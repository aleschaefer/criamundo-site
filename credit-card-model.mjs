import { validTransactionDate } from './finance-date.mjs';
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9-]{1,64}$/.test(value);
const cleanName = (value, max, label) => {
  const result = typeof value === 'string' ? value.trim() : '';
  if (!result || [...result].length > max) throw new Error(`${label} deve ter até ${max} caracteres.`);
  return result;
};
const integer = (value, min, max, label) => {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${label}: informe um número inteiro entre ${min} e ${max}.`);
  return value;
};
export function addMonthsClamped(date, months) {
  if (!validTransactionDate(date)) throw new Error('Data inválida.');
  const [year, month, day] = date.split('-').map(Number);
  const index = year * 12 + month - 1 + months;
  const nextYear = Math.floor(index / 12);
  const nextMonth = index % 12 + 1;
  if (nextYear > 9999) throw new Error('As parcelas ultrapassam o limite de data permitido.');
  const lastDay = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate();
  return `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}
export function validateCreditAction(action) {
  if (!action || !['group', 'period', 'transaction'].includes(action.type) || !validId(action.id)) throw new Error('Dados inválidos.');
  if (action.type === 'group') {
    const name = cleanName(action.name, 30, 'Nome do grupo');
    return { ...action, name, nameKey: name.normalize('NFKC').toLocaleLowerCase('pt-BR') };
  }
  if (action.type === 'period') {
    integer(action.month, 1, 12, 'Mês'); integer(action.year, 1900, 9999, 'Ano');
    if (!validTransactionDate(action.startDate) || !validTransactionDate(action.endDate) || action.endDate < action.startDate) throw new Error('Informe datas válidas; a data final deve ser igual ou posterior à inicial.');
    return action;
  }
  if (!validId(action.groupId) || !validTransactionDate(action.transactionDate)) throw new Error('Selecione um grupo e informe uma data válida.');
  const name = cleanName(action.name, 120, 'Nome da transação');
  if (![1, 2].includes(action.payment)) throw new Error('Forma de pagamento inválida.');
  const current = action.payment === 1 ? 1 : integer(action.currentInstallment, 1, 999, 'Parcela atual');
  const count = action.payment === 1 ? 1 : integer(action.installmentCount, 1, 999, 'Quantidade de parcelas');
  if (current > count) throw new Error('A parcela atual não pode ser maior que a quantidade de parcelas.');
  if (typeof action.value !== 'number' || !Number.isFinite(action.value) || action.value < 0 || action.value > 99999999.99 || Math.abs(action.value * 100 - Math.round(action.value * 100)) > 0.000001) throw new Error('Valor deve ter até 2 casas decimais e não pode exceder R$ 99.999.999,99.');
  return { ...action, name, value: Math.round(action.value * 100) / 100, currentInstallment: current, installmentCount: count };
}
export function expandInstallments(action) {
  const clean = validateCreditAction(action);
  if (clean.type !== 'transaction') throw new Error('Ação não é uma transação.');
  return Array.from({ length: clean.installmentCount - clean.currentInstallment + 1 }, (_, offset) => ({
    id: offset === 0 ? clean.id : crypto.randomUUID(), seriesId: clean.id,
    transactionDate: addMonthsClamped(clean.transactionDate, offset), name: clean.name,
    value: clean.value, groupId: clean.groupId, payment: clean.payment,
    installmentNumber: clean.currentInstallment + offset, installmentCount: clean.installmentCount
  }));
}
