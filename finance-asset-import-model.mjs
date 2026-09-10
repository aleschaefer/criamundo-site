const sectionTypes=[
  [/^acoes$/i,{assetType:1,subType:1}],
  [/^cdb\s*-\s*certificado/i,{assetType:2,subType:4}],
  [/^(fii\s*-\s*fundo de investimento imobiliario|fundos de investimentos)$/i,{assetType:1,subType:2}],
  [/^lca\s*-\s*letra de credito do agronegocio$/i,{assetType:2,subType:5}]
];
const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
const brNumber=value=>{const matches=String(value||'').match(/\d+(?:\.\d{3})*(?:,\d+)?/g);if(!matches?.length)return NaN;return Number(matches.at(-1).replaceAll('.','').replace(',','.'));};

export function classifyB3Section(title){const text=normalize(title);return sectionTypes.find(([pattern])=>pattern.test(text))?.[1]||null;}

export function parseB3PositionPage(items,page=1,initialClassification=null){
  const rows=[];for(const item of items||[]){const y=Math.round((item.transform?.[5]||0)*2)/2,x=item.transform?.[4]||0;let row=rows.find(entry=>Math.abs(entry.y-y)<=2);if(!row){row={y,items:[]};rows.push(row);}row.items.push({x,text:String(item.str||'').trim()});}
  rows.sort((a,b)=>b.y-a.y).forEach(row=>row.items.sort((a,b)=>a.x-b.x));
  let classification=initialClassification,active=Boolean(initialClassification),current=null;const output=[];
  const finish=()=>{if(!current)return;const product=current.product.join(' ').replace(/\s+/g,' ').replace(/\b(?:ON|PN|PNB|Cotas?|Direito)\b.*$/i,'').trim();const match=product.match(/^([^\s]+)\s*-\s*(.+)$/);const quantity=Math.trunc(brNumber(current.quantity.join(' '))),currentPrice=brNumber(current.price.join(' ')),total=brNumber(current.total.join(' '));if(match&&classification&&Number.isInteger(quantity)&&quantity>=0&&Number.isFinite(currentPrice)&&Number.isFinite(total)){output.push({page,symbol:match[1].slice(0,7).toUpperCase(),name:match[2].slice(0,30).trim(),...classification,quantity,currentPrice:Math.round(currentPrice*100)/100,total:Math.round(total*100)/100});}current=null;};
  for(const row of rows){const text=normalize(row.items.map(item=>item.text).join(' '));const found=classifyB3Section(text);if(found){finish();classification=found;active=false;continue;}if(/^Produto\b/i.test(text)){finish();active=Boolean(classification);continue;}if(!active)continue;if(/^Total\b/i.test(text)||/A valorizacao dos ativos/i.test(text)||/^acesse /i.test(text)){finish();active=false;continue;}
    const left=normalize(row.items.filter(item=>item.x<250).map(item=>item.text).join(' '));const starts=/^[A-Z0-9.]{2,12}\s*-\s+/i.test(left);
    if(starts){finish();current={product:[],quantity:[],price:[],total:[]};}
    if(!current)continue;
    const values={product:row.items.filter(item=>item.x<250),quantity:row.items.filter(item=>item.x>=320&&item.x<440),price:row.items.filter(item=>item.x>=440&&item.x<510),total:row.items.filter(item=>item.x>=510)};
    Object.entries(values).forEach(([key,list])=>current[key].push(...list.map(item=>item.text).filter(Boolean)));
  }
  finish();return{assets:output,classification};
}

export function parseB3PositionItems(items,page=1){return parseB3PositionPage(items,page).assets;}

const symbolBase=value=>normalize(value).toUpperCase().replace(/\d{1,2}$/,'');
export function fillSimilarCurrentPrices(assets){
  const sourceByIdentity=new Map();
  for(const asset of assets||[]){
    if(!(Number(asset.currentPrice)>0))continue;
    const key=`${asset.assetType}\u0000${asset.subType}\u0000${symbolBase(asset.symbol)}\u0000${normalize(asset.name).toUpperCase()}`;
    const current=sourceByIdentity.get(key);
    if(!current||String(asset.symbol).endsWith('11'))sourceByIdentity.set(key,asset);
  }
  return(assets||[]).map(asset=>{
    if(Number(asset.currentPrice)>0)return asset;
    const key=`${asset.assetType}\u0000${asset.subType}\u0000${symbolBase(asset.symbol)}\u0000${normalize(asset.name).toUpperCase()}`;
    const source=sourceByIdentity.get(key);
    return source?{...asset,currentPrice:source.currentPrice,total:Math.round(Number(asset.quantity)*Number(source.currentPrice)*100)/100}:asset;
  });
}

export function validateAssetImport(action){
  if(action?.type!=='asset-import'||!Array.isArray(action.items)||!action.items.length||action.items.length>500)throw new Error('Nenhum ativo válido foi selecionado.');
  return{type:'asset-import',items:action.items.map((item,index)=>{const id=String(item.id||''),symbol=String(item.symbol||'').trim().toUpperCase(),name=String(item.name||'').trim();if(!['Ale','Ana'].includes(item.owner))throw new Error('Selecione quem é o proprietário dos ativos.');if(!/^[a-zA-Z0-9-]{1,64}$/.test(id)||!/^[^\s]{1,7}$/.test(symbol)||!name||[...name].length>30)throw new Error(`Revise a sigla e o nome do ativo ${index+1}.`);if(!Number.isInteger(item.assetType)||![[1,1],[1,2],[2,4],[2,5]].some(pair=>pair[0]===item.assetType&&pair[1]===item.subType))throw new Error(`Classificação inválida no ativo ${index+1}.`);if(!Number.isInteger(item.quantity)||item.quantity<0||item.quantity>2147483647)throw new Error(`Quantidade inválida no ativo ${index+1}.`);for(const key of ['currentPrice','total']){const max=key==='currentPrice'?999999.99:99999999.99;if(typeof item[key]!=='number'||!Number.isFinite(item[key])||item[key]<0||item[key]>max||Math.abs(item[key]*100-Math.round(item[key]*100))>0.000001)throw new Error(`Valor inválido no ativo ${index+1}.`);}if(item.quantity===0&&item.total!==0)throw new Error(`Quantidade incompatível com o valor total no ativo ${index+1}.`);if(item.quantity&&item.total/item.quantity>999999.99)throw new Error(`Preço médio calculado acima do limite no ativo ${index+1}.`);return{...item,id,symbol,name};})};
}
