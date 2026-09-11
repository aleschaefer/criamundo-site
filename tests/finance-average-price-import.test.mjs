import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRicoAveragePrices, parseClearAveragePrices } from '../finance-average-price-import-model.mjs';
const item = (str, x, y) => ({ str, transform: [1, 0, 0, 1, x, y] });

test('extrai o preço médio pelo código do ativo no PDF da Rico', () => {
  const prices = parseRicoAveragePrices([
    item('MCCI11', 30, 700), item('Último preço', 150, 700), item('Preço Médio', 300, 700),
    item('R$ 95,15', 150, 680), item('+ 0,11%', 220, 680), item('R$ 91,82', 300, 680), item('+ 3,63%', 380, 680), item('R$ 26.166,25', 520, 680),
    item('MXRF11 Último preço Variação Preço Médio Rentabilidade Quantidade Posição', 30, 650),
    item('R$ 9,19 0,00% Indefinido Indefinida 2.035 R$ 18.701,65', 150, 630)
  ], 1);
  assert.deepEqual(prices, [
    { page: 1, symbol: 'MCCI11', averagePrice: 91.82 },
    { page: 1, symbol: 'MXRF11', averagePrice: null, undefined: true }
  ]);
});

test('preserva a sigla cujo preço médio está indefinido para destacá-la na tela', () => {
  const prices = parseRicoAveragePrices([
    item('RECR12', 30, 700), item('Último preço', 150, 700), item('Preço Médio', 300, 700),
    item('R$ 79,13', 150, 680), item('Indefinido', 300, 680), item('40', 500, 680)
  ], 2);
  assert.deepEqual(prices, [{ page: 2, symbol: 'RECR12', averagePrice: null, undefined: true }]);
});

test('extrai preços médios da tabela de carteira da Clear', () => {
  const prices = parseClearAveragePrices([
    item('PETR4', 30, 700), item('R$ 15.270,40', 130, 700), item('25,3%', 230, 700), item('79,3%', 290, 700), item('R$ 26,61', 360, 700), item('R$ 47,72', 450, 700), item('320', 540, 700),
    item('BBAS3 R$ 11.493,80 19,04% 12,43% R$ 20,24 R$ 22,76 505', 30, 680),
    item('GRND3', 30, 660), item('R$ 2.163,40', 130, 660), item('3,58%', 230, 660), item('-46,6%', 290, 660), item('R$ 6,98', 360, 660), item('R$ 3,73', 450, 660), item('580', 540, 660)
  ], 1);
  assert.deepEqual(prices, [
    { page: 1, symbol: 'PETR4', averagePrice: 26.61 },
    { page: 1, symbol: 'BBAS3', averagePrice: 20.24 },
    { page: 1, symbol: 'GRND3', averagePrice: 6.98 }
  ]);
});

test('extrai tabela da Clear mesmo quando as células da linha têm alturas diferentes', () => {
  const values = ['PETR4', 'R$ 15.270,40', '25,3%', '79,3%', 'R$ 26,61', 'R$ 47,72', '320'];
  const prices = parseClearAveragePrices(values.map((value, index) => item(value, 30 + index * 80, 700 - index * 4)), 1);
  assert.deepEqual(prices, [{ page: 1, symbol: 'PETR4', averagePrice: 26.61 }]);
});
