import { validTransactionDate } from './finance-date.mjs';

const validId = value => typeof value === 'string' && /^[a-zA-Z0-9-]{1,64}$/.test(value);
const validHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

export function normalizeImportText(value) {
  return String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
}

export function inferPurchaseDate(shortDate, periodEnd) {
  if (!validTransactionDate(periodEnd)) throw new Error('Período da fatura inválido.');
  const match = String(shortDate).match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/);
  if (!match) throw new Error('Data reconhecida inválida.');
  const day = Number(match[1]), month = Number(match[2]);
  let year = match[3] ? Number(match[3]) : Number(periodEnd.slice(0, 4));
  if (year < 100) year += year >= 70 ? 1900 : 2000;
  if (!match[3] && `${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}` > periodEnd.slice(5)) year--;
  const result = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  if (!validTransactionDate(result)) throw new Error('Data reconhecida inválida.');
  return result;
}

const categoryNames = new Map([
  ['educacao','EDUCAÇÃO'], ['lazer','LAZER'], ['restaurantes','RESTAURANTES'],
  ['servicos','SERVIÇOS'], ['supermercados','SUPERMERCADOS'], ['transporte','TRANSPORTE'],
  ['outros lancamentos','OUTRO'], ['compras parceladas','COMPRAS PARCELADAS']
]);
const ignoredCategories = /pagamentos?\s*\/\s*cr[eé]ditos?|saldo fatura anterior/i;
const stripMarks = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');

function parseAmount(value) {
  const negative = /^\s*[-−]/.test(value);
  let cleaned = value.replace(/[^\d,.]/g, '').replace(/\./g, '');
  if (!cleaned.includes(',') && cleaned.length >= 3) cleaned = `${cleaned.slice(0,-2)},${cleaned.slice(-2)}`;
  const numeric = cleaned.replace(',', '.');
  const amount = Number(numeric);
  return Number.isFinite(amount) ? Math.round((negative ? -amount : amount) * 100) / 100 : NaN;
}

export function parseOcrText(text, { page = 1, periodEnd, confidence = 0 } = {}) {
  let category = '', ignored = false, row = 0;
  const result = [];
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    row++;
    let line = normalizeImportText(rawLine);
    if (!line) continue;
    line = line.replace(/^[^\d\p{L}]*/u,'').replace(/^(\d{3})(\/\d{2})\b/,(_,day,month)=>`${day.slice(-2)}${month}`).replace(/^(\d{1,2}\/\d{2}(?:\/\d{2,4})?)[\]|)]\s*/, '$1 ');
    const categoryKey = stripMarks(line.replace(/[:.]$/, ''));
    const knownCategory = [...categoryNames].find(([key]) => categoryKey === key || categoryKey.startsWith(`${key} `));
    if (knownCategory) { category = knownCategory[1]; ignored = false; continue; }
    if (ignoredCategories.test(line)) { ignored = true; continue; }
    const match = line.match(/^(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s+(.+?)\s+(?:R\s*\$?|RS|R5)?\s*[|/]?\s*(-?\s*\d(?:[\d.]*,\d{2}|\d{2,}))\s*$/i);
    if (!match) continue;
    const value = parseAmount(match[3]);
    let name = normalizeImportText(match[2]).replace(/^[/|\[\]]+\s*/,'').replace(/\s+(?:R\s*\$?|RS|R5)\s*[|/]?$/i, '').trim();
    if (!name || !Number.isFinite(value)) continue;
    const installment = name.match(/\bPARC\s*(\d{1,3})\s*\/\s*(\d{1,3})\b/i);
    const currentInstallment = installment ? Number(installment[1]) : 1;
    const installmentCount = installment ? Number(installment[2]) : 1;
    if (currentInstallment < 1 || installmentCount < currentInstallment || installmentCount > 999) continue;
    let purchaseDate;
    try { purchaseDate = inferPurchaseDate(match[1], periodEnd); } catch { continue; }
    result.push({
      page, row, purchaseDate, name: name.slice(0, 120), value: Math.abs(value), category,
      payment: installment ? 2 : 1, currentInstallment, installmentCount,
      confidence: Math.max(0, Math.min(100, Math.round(confidence))),
      include: !ignored && value > 0,
      reason: ignored || value <= 0 ? 'Pagamento ou crédito: não será somado aos gastos.' : ''
    });
  }
  return result;
}

export function validateImportAction(action) {
  if (!action || action.type !== 'import' || !validId(action.id) || !validId(action.periodId) || !validHash(action.fileHash)) throw new Error('Dados da importação inválidos.');
  const fileName = normalizeImportText(action.fileName);
  if (!fileName || [...fileName].length > 180 || !/\.pdf$/i.test(fileName)) throw new Error('Informe um arquivo PDF válido.');
  if (!Array.isArray(action.items) || !action.items.length || action.items.length > 500) throw new Error('Selecione entre 1 e 500 transações.');
  const items = action.items.map((item, index) => {
    if (!validId(item.id) || !validId(item.groupId) || !validTransactionDate(item.purchaseDate)) throw new Error(`Revise a transação ${index + 1}.`);
    const name = normalizeImportText(item.name);
    if (!name || [...name].length > 120) throw new Error(`Nome inválido na transação ${index + 1}.`);
    if (typeof item.value !== 'number' || !Number.isFinite(item.value) || item.value <= 0 || item.value > 99999999.99 || Math.abs(item.value * 100 - Math.round(item.value * 100)) > .000001) throw new Error(`Valor inválido na transação ${index + 1}.`);
    const current = item.payment === 2 ? item.currentInstallment : 1;
    const count = item.payment === 2 ? item.installmentCount : 1;
    if (![1,2].includes(item.payment) || !Number.isInteger(current) || !Number.isInteger(count) || current < 1 || count < current || count > 999) throw new Error(`Parcelas inválidas na transação ${index + 1}.`);
    if (!Number.isInteger(item.page) || item.page < 1 || !Number.isInteger(item.row) || item.row < 1) throw new Error(`Origem inválida na transação ${index + 1}.`);
    return { ...item, name, value: Math.round(item.value * 100) / 100, currentInstallment: current, installmentCount: count, confidence: Math.max(0, Math.min(100, Number(item.confidence) || 0)) };
  });
  return { ...action, fileName, items };
}
