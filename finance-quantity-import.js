import { parseRicoQuantities } from './finance-quantity-import-model.mjs';
const MAX_BYTES = 15 * 1024 * 1024, MAX_PAGES = 30;

export async function readRicoQuantitiesPdf(file) {
  if (!(file instanceof File) || !/\.pdf$/i.test(file.name) || file.size < 5 || file.size > MAX_BYTES) throw new Error('Selecione um PDF de até 15 MB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (String.fromCharCode(...bytes.slice(0, 5)) !== '%PDF-') throw new Error('O arquivo não é um PDF válido.');
  const pdfjs = await import('./vendor/pdfjs/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
  const task = pdfjs.getDocument({ data: bytes });
  try {
  const pdf = await task.promise;
  if (pdf.numPages < 1 || pdf.numPages > MAX_PAGES) throw new Error('O PDF deve ter entre 1 e 30 páginas.');
  const quantities = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const items = (await page.getTextContent()).items;
    quantities.push(...parseRicoQuantities(items, pageNumber));
  }
  return quantities;
  } finally { await task.destroy(); }
}
