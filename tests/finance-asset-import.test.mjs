import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyB3Section, parseB3PositionItems, validateAssetImport } from '../finance-asset-import-model.mjs';

const item = (str, x, y) => ({ str, transform: [1, 0, 0, 1, x, y] });

test('reconhece os agrupamentos suportados do extrato B3', () => {
  assert.deepEqual(classifyB3Section('Ações'), { assetType: 1, subType: 1 });
  assert.deepEqual(classifyB3Section('CDB - Certificado de Depósito Bancário'), { assetType: 2, subType: 4 });
  assert.deepEqual(classifyB3Section('FII - Fundo de Investimento Imobiliário'), { assetType: 1, subType: 2 });
  assert.deepEqual(classifyB3Section('Fundos de Investimentos'), { assetType: 1, subType: 2 });
  assert.deepEqual(classifyB3Section('LCA - Letra de Crédito do Agronegócio'), { assetType: 2, subType: 5 });
});

test('extrai produto, classificação, quantidade e valores de linhas B3', () => {
  const parsed = parseB3PositionItems([
    item('Ações', 37, 700), item('Produto', 37, 680), item('Quantidade', 393, 680),
    item('Preço de fechamento', 459, 680), item('Valor Atualizado', 520, 680),
    item('AGRO3 - BRASILAGRO - CIA BRAS DE PROP AGRÍCOLAS', 37, 650),
    item('1.600', 406, 645), item('R$ 19,27', 470, 645), item('R$ 30.832,00', 522, 640),
    item('Total', 37, 610)
  ], 1);
  assert.deepEqual(parsed, [{ page: 1, symbol: 'AGRO3', name: 'BRASILAGRO - CIA BRAS DE PROP', assetType: 1, subType: 1, quantity: 1600, currentPrice: 19.27, total: 30832 }]);
});

test('valida os ativos selecionados e mantém CDBs de nomes diferentes', () => {
  const base = { id: 'asset-1', symbol: 'CDB', name: 'BANCO A', assetType: 2, subType: 4, quantity: 10, currentPrice: 100, total: 1000 };
  assert.equal(validateAssetImport({ type: 'asset-import', items: [base] }).items[0].symbol, 'CDB');
  assert.throws(() => validateAssetImport({ type: 'asset-import', items: [{ ...base, quantity: 0, total: 1 }] }));
  assert.throws(() => validateAssetImport({ type: 'asset-import', items: [{ ...base, currentPrice: 1.234 }] }));
});
