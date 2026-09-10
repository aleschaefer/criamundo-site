import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyB3Section, fillSimilarCurrentPrices, parseB3PositionItems, parseB3PositionPage, validateAssetImport } from '../finance-asset-import-model.mjs';

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

test('reconhece valor total alinhado em 513,9 no extrato de ações da B3', () => {
  const parsed = parseB3PositionItems([
    item('Ações', 37.2, 597.5), item('Produto', 37.2, 557.5), item('Quantidade', 377.8, 557.5),
    item('AGRO3 - BRASILAGRO - CIA BRAS DE PROP', 37.2, 526),
    item('ON', 232.8, 521), item('295', 392.7, 521), item('R$ 19,27', 463.4, 521), item('R$ 5.684,65', 513.9, 521),
    item('AGRICOLAS', 37.2, 516), item('Total', 540.7, 197)
  ], 1);
  assert.deepEqual(parsed, [{ page: 1, symbol: 'AGRO3', name: 'BRASILAGRO - CIA BRAS DE PROP', assetType: 1, subType: 1, quantity: 295, currentPrice: 19.27, total: 5684.65 }]);
});

test('reconhece quantidade deslocada à esquerda e preserva nome iniciado por Fundo', () => {
  const action = parseB3PositionItems([
    item('Ações', 37, 700), item('Produto', 37, 680),
    item('BBAS3 - BCO BRASIL S.A.', 37, 650), item('ON', 152, 650),
    item('20', 347, 650), item('R$ 22,52', 445, 650), item('R$ 450,40', 520, 650), item('Total', 540, 600)
  ], 1);
  assert.equal(action[0].quantity, 20);
  const fii = parseB3PositionItems([
    item('FII - Fundo de Investimento Imobiliário', 37, 700), item('Produto', 37, 680),
    item('RZTR11 - FUNDO DE INVEST IMOB RIZA TERRAX', 37, 650), item('Cotas', 252, 645),
    item('174', 408, 645), item('R$ 83,75', 470, 645), item('R$', 547, 650), item('14.572,50', 522, 640), item('Total', 540, 600)
  ], 1);
  assert.equal(fii[0].symbol, 'RZTR11');
  assert.match(fii[0].name, /^FUNDO DE INVEST/);
});

test('mantém o agrupamento quando os ativos continuam na página seguinte', () => {
  const first = parseB3PositionPage([
    item('FII - Fundo de Investimento Imobiliário', 37, 100),
    item('Produto', 37, 80), item('Quantidade', 377, 80)
  ], 1);
  const second = parseB3PositionPage([
    item('BCRI11 - BANESTES RECEBIVEIS IMOBILIARIOS', 37, 700),
    item('Cotas', 230, 695), item('192', 392, 695), item('R$ 55,09', 463, 695), item('R$ 10.577,28', 514, 695),
    item('Total', 540, 100)
  ], 2, first.classification);
  assert.deepEqual(second.assets, [{ page: 2, symbol: 'BCRI11', name: 'BANESTES RECEBIVEIS IMOBILIARI', assetType: 1, subType: 2, quantity: 192, currentPrice: 55.09, total: 10577.28 }]);
});

test('preenche o preço atual de um direito com o ativo de mesma raiz e mesmo nome', () => {
  const assets=[
    {symbol:'HGRU11',name:'PATRIA RENDA URBANA - FII',assetType:1,subType:2,currentPrice:115.10,total:16114,quantity:140},
    {symbol:'HGRU12',name:'PATRIA RENDA URBANA - FII',assetType:1,subType:2,currentPrice:0,total:0,quantity:46},
    {symbol:'OUTR12',name:'OUTRO ATIVO',assetType:1,subType:2,currentPrice:0,total:0,quantity:1}
  ];
  const completed=fillSimilarCurrentPrices(assets);
  assert.equal(completed[1].currentPrice,115.10);
  assert.equal(completed[1].total,0);
  assert.equal(completed[2].currentPrice,0);
});

test('valida os ativos selecionados e mantém CDBs de nomes diferentes', () => {
  const base = { id: 'asset-1', owner: 'Ale', symbol: 'CDB', name: 'BANCO A', assetType: 2, subType: 4, quantity: 10, currentPrice: 100, total: 1000 };
  assert.equal(validateAssetImport({ type: 'asset-import', items: [base] }).items[0].symbol, 'CDB');
  assert.throws(() => validateAssetImport({ type: 'asset-import', items: [{ ...base, quantity: 0, total: 1 }] }));
  assert.throws(() => validateAssetImport({ type: 'asset-import', items: [{ ...base, currentPrice: 1.234 }] }));
  assert.throws(() => validateAssetImport({ type: 'asset-import', items: [{ ...base, owner: '' }] }));
});
