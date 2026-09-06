import { parseOcrText } from './credit-card-import-model.mjs?v=3';

const PDF_MAX_BYTES = 15 * 1024 * 1024, PDF_MAX_PAGES = 30;
let librariesPromise;

function loadScript(src) {
  return new Promise((resolve,reject)=>{
    const existing=document.querySelector(`script[src="${src}"]`);
    if(existing){if(globalThis.Tesseract)return resolve();existing.addEventListener('load',resolve,{once:true});existing.addEventListener('error',reject,{once:true});return;}
    const script=document.createElement('script');script.src=src;script.onload=resolve;script.onerror=()=>reject(new Error('Não foi possível carregar o leitor de OCR.'));document.head.append(script);
  });
}

async function libraries() {
  if(!librariesPromise) librariesPromise=Promise.all([
    import('./vendor/pdfjs/pdf.min.mjs'),
    loadScript('/vendor/tesseract/tesseract.min.js')
  ]).then(([pdfjs])=>{pdfjs.GlobalWorkerOptions.workerSrc='/vendor/pdfjs/pdf.worker.min.mjs';return pdfjs;});
  return librariesPromise;
}

function textLines(content) {
  const rows=[];
  for(const item of content.items || []){
    const y=Math.round(item.transform?.[5] || 0), x=item.transform?.[4] || 0;
    let row=rows.find(entry=>Math.abs(entry.y-y)<=2);
    if(!row){row={y,items:[]};rows.push(row);}
    row.items.push({x,text:item.str});
  }
  return rows.sort((a,b)=>b.y-a.y).map(row=>row.items.sort((a,b)=>a.x-b.x).map(item=>item.text).join(' ')).join('\n');
}

function croppedCanvas(source, start, width) {
  const canvas=document.createElement('canvas');canvas.width=Math.floor(source.width*width);canvas.height=source.height;
  canvas.getContext('2d',{willReadFrequently:true}).drawImage(source,Math.floor(source.width*start),0,canvas.width,source.height,0,0,canvas.width,canvas.height);
  return canvas;
}

export async function readCreditCardPdf(file, periodEnd, onProgress=()=>{}) {
  if(!(file instanceof File) || (file.type && file.type!=='application/pdf') || !/\.pdf$/i.test(file.name)) throw new Error('Selecione um arquivo PDF.');
  if(file.size<5 || file.size>PDF_MAX_BYTES) throw new Error('O PDF deve ter no máximo 15 MB.');
  const bytes=new Uint8Array(await file.arrayBuffer());
  if(String.fromCharCode(...bytes.slice(0,5))!=='%PDF-') throw new Error('O arquivo selecionado não é um PDF válido.');
  const pdfjs=await libraries();onProgress(2,'Abrindo o PDF…');
  const pdf=await pdfjs.getDocument({data:bytes}).promise;
  if(pdf.numPages<1 || pdf.numPages>PDF_MAX_PAGES) throw new Error('O PDF deve ter entre 1 e 30 páginas.');
  let worker, candidates=[], sequence=0;
  try {
    for(let pageNumber=1;pageNumber<=pdf.numPages;pageNumber++){
      const page=await pdf.getPage(pageNumber), content=await page.getTextContent();
      let portions=[];
      if((content.items || []).map(item=>item.str).join('').trim().length>80){
        portions=[{text:textLines(content),confidence:100}];
      }else{
        if(!worker){
          onProgress(5,'Preparando o reconhecimento em português…');
          worker=await globalThis.Tesseract.createWorker('por',1,{
            workerPath:'/vendor/tesseract/worker.min.js',corePath:'/vendor/tesseract/core',langPath:'/vendor/tesseract/lang',
            logger: message=>{if(message.status==='recognizing text')onProgress(5+Math.round(((pageNumber-1+message.progress)/pdf.numPages)*90),`Reconhecendo página ${pageNumber} de ${pdf.numPages}…`);}
          });
        }
        const viewport=page.getViewport({scale:2.6}), canvas=document.createElement('canvas');canvas.width=Math.floor(viewport.width);canvas.height=Math.floor(viewport.height);
        await page.render({canvasContext:canvas.getContext('2d',{willReadFrequently:true}),viewport}).promise;
        for(const [start,width] of [[.035,.475],[.50,.465]]){
          const result=await worker.recognize(croppedCanvas(canvas,start,width));
          portions.push({text:result.data.text,confidence:result.data.confidence});
        }
        canvas.width=canvas.height=1;
      }
      const combinedText=portions.map(portion=>portion.text).join('\n');
      const combinedConfidence=portions.reduce((sum,portion)=>sum+(Number(portion.confidence)||0),0)/portions.length;
      for(const item of parseOcrText(combinedText,{page:pageNumber,periodEnd,confidence:combinedConfidence})) candidates.push({...item,row:++sequence});
    }
  } finally { if(worker)await worker.terminate(); }
  onProgress(100,`${candidates.length} lançamento(s) reconhecido(s).`);
  return candidates;
}

export async function fileSha256(file) {
  const bytes=await file.arrayBuffer(), digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}
