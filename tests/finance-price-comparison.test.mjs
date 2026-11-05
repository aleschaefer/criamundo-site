import { test } from 'node:test';
import assert from 'node:assert/strict';
import { priceDifferencePercent, matchesPriceFilter } from '../finance-price-comparison.mjs';
test('compara preço atual usando preço médio como base', () => {
  assert.equal(priceDifferencePercent({ currentPrice: 120, averagePrice: 100 }), 20);
  assert.equal(priceDifferencePercent({ currentPrice: 75, averagePrice: 100 }), -25);
  assert.equal(priceDifferencePercent({ currentPrice: 100, averagePrice: 100 }), 0);
  assert.equal(priceDifferencePercent({ currentPrice: 10, averagePrice: 0 }), null);
  assert.equal(priceDifferencePercent({ currentPrice: null, averagePrice: 100 }), null);
});
test('filtros distinguem acima, abaixo, iguais e valores indisponíveis', () => {
  const assets = [{currentPrice:120,averagePrice:100},{currentPrice:75,averagePrice:100},{currentPrice:100,averagePrice:100},{currentPrice:10,averagePrice:0}];
  assert.deepEqual(assets.filter(a=>matchesPriceFilter(a,'above')), [assets[0]]);
  assert.deepEqual(assets.filter(a=>matchesPriceFilter(a,'below')), [assets[1]]);
  assert.equal(assets.filter(a=>matchesPriceFilter(a,'')).length, 4);
});
