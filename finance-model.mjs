import { validTransactionDate } from './finance-date.mjs';
import { ASSET_TYPES, SUBTYPES_BY_TYPE, hasIncome, hasCurrentPrice } from './finance-types.mjs';
export function moneyCents(value, max, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max || Math.abs(value * 100 - Math.round(value * 100)) > 0.000001) {
    throw new Error(`${label}: informe um valor entre 0 e ${max}, com até 2 casas decimais.`);
  }
  return Math.round(value * 100);
}
export function validateAction(action) {
  if (!action || !['asset', 'transaction'].includes(action.type)) throw new Error('Ação inválida.');
  const operation = action.operation || 'create';
  if (!['create', 'update', 'delete'].includes(operation)) throw new Error('Operação inválida.');
  if (operation !== 'create' && (!Number.isSafeInteger(action.revision) || action.revision < 0)) throw new Error('Versão inválida. Atualize os dados.');
  if (operation === 'delete') {
    if (typeof action.id !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(action.id)) throw new Error('Identificador inválido.');
    return action;
  }
  if (!Number.isInteger(action.quantity) || action.quantity < (action.type === 'asset' ? 0 : 1) || action.quantity > 2147483647) throw new Error('Quantidade deve ser um número inteiro dentro do limite permitido.');
  if (typeof action.id !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(action.id)) throw new Error('Identificador inválido.');
  if (action.type === 'asset') {
    const name = typeof action.name === 'string' ? action.name.trim() : '';
    if (!name || [...name].length > 30) throw new Error('Nome deve ter até 30 caracteres.');
    if (!Number.isInteger(action.assetType) || !ASSET_TYPES[action.assetType]) throw new Error('Tipo de ativo inválido.');
    if (!Number.isInteger(action.subType) || !SUBTYPES_BY_TYPE[action.assetType].includes(action.subType)) throw new Error('Selecione um subtipo válido para o tipo de ativo.');
    const cents = moneyCents(action.averagePrice, 999999.99, action.assetType === 2 ? 'Valor de Compra' : 'Preço médio');
    const valueCents = cents * action.quantity;
    if (!Number.isSafeInteger(valueCents) || valueCents > 9999999999) throw new Error('Valor do ativo excede 99.999.999,99.');
    const marketFields = hasIncome(action);
    const blank = value => value === undefined || value === null || value === '';
    const currentPrice = hasCurrentPrice(action) && !blank(action.currentPrice)
      ? moneyCents(action.currentPrice, 999999.99, 'Valor atual') / 100 : null;
    const currentIncome = marketFields && !blank(action.currentIncome) ? action.currentIncome : 0;
    if (typeof currentIncome !== 'number' || !Number.isFinite(currentIncome) || currentIncome < 0 || currentIncome > 99.99999 || Math.abs(currentIncome * 100000 - Math.round(currentIncome * 100000)) > 0.000001) {
      throw new Error('Rendimento atual: informe um valor entre 0 e 99,99999, com até 5 casas decimais.');
    }
    return { ...action, name, currentPrice, currentIncome: Math.round(currentIncome * 100000) / 100000, averagePrice: action.quantity ? cents / 100 : 0, value: valueCents / 100 };
  }
  if (!validTransactionDate(action.transactionDate)) throw new Error('Informe uma data da transação válida.');
  if (typeof action.assetId !== 'string' || !action.assetId) throw new Error('Selecione um ativo.');
  const unitCents = moneyCents(action.unitPrice, 999999.99, 'Valor unitário');
  const totalCents = action.quantity * unitCents;
  if (!Number.isSafeInteger(totalCents) || totalCents > 9999999999) throw new Error('Valor total da transação excede 99.999.999,99.');
  // O total enviado pelo cliente nunca é usado como fonte de verdade.
  return { ...action, unitPrice: unitCents / 100, value: totalCents / 100 };
}
