import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRicoQuantities, quantityUpdatesForAssets } from '../finance-quantity-import-model.mjs';
const row = (str, y) => ({ str, transform: [1, 0, 0, 1, 30, y] });
test('lê Quantidade com preço médio definido ou indefinido e milhares', () => {
  const items = [row('BCRI11 Último preço Variação Preço Médio Rentabilidade Quantidade Posição', 700), row('FII BEES R$ 49,01 0,00% R$ 73,87 -33,65% 305 R$ 14.948,05', 680), row('MXRF11 Último preço Variação Preço Médio Rentabilidade Quantidade Posição', 650), row('FII MAXI R$ 8,47 0,00% Indefinido Indefinida 2.585 R$ 21.894,95', 630)];
  assert.deepEqual(parseRicoQuantities(items), [{ symbol: 'BCRI11', quantity: 305, page: 1 }, { symbol: 'MXRF11', quantity: 2585, page: 1 }]);
  assert.deepEqual(parseRicoQuantities([row('Quantidade 400', 700)]), []);
});
test('quantidade exige sigla exata, não aplica a recibos similares nem duplica saldos', () => {
  const assets = [{ id: 'a', revision: 2, symbol: 'BCRI11' }, { id: 'b', revision: 0, symbol: 'BCRI12' }];
  const recognized = [{ symbol: 'BCRI11', quantity: 305 }];
  assert.deepEqual(quantityUpdatesForAssets(assets, recognized), [{ id: 'a', revision: 2, quantity: 305 }]);
  assert.throws(() => quantityUpdatesForAssets(assets, [...recognized, ...recognized]));
  assert.throws(() => quantityUpdatesForAssets([...assets, { ...assets[0], id: 'c' }], recognized));
});
