import { test } from 'node:test';
import assert from 'node:assert/strict';
import { preferredSimilarAssets, similarSymbolKey, valuesForSimilarAssets } from '../finance-similar-assets.mjs';

test('agrupa siglas semelhantes e prefere o ativo terminado em 11', () => {
  const assets = [{ id: 'right', symbol: 'RECR12' }, { id: 'main', symbol: 'RECR11' }, { id: 'other', symbol: 'MXRF11' }];
  assert.equal(similarSymbolKey('RECR12'), 'RECR');
  assert.deepEqual(preferredSimilarAssets(assets).map(asset => asset.id), ['main', 'other']);
});

test('replica preço ou rendimento do código 11 para todos os ativos semelhantes', () => {
  const assets = [{ id: 'main', symbol: 'RECR11' }, { id: 'right', symbol: 'RECR12' }, { id: 'other', symbol: 'MXRF11' }];
  const values = valuesForSimilarAssets(assets, new Map([['RECR12', 70], ['RECR11', 79.13], ['MXRF11', 9.15]]));
  assert.equal(values.get('main'), 79.13);
  assert.equal(values.get('right'), 79.13);
  assert.equal(values.get('other'), 9.15);
});

test('encontra o código 11 equivalente mesmo quando pertence a outro proprietário', () => {
  const targets = [{ id: 'ana-right', owner: 'Ana', symbol: 'RECR12' }];
  const allAssets = [...targets, { id: 'ale-main', owner: 'Ale', symbol: 'RECR11' }, { id: 'unrelated', owner: 'Ale', symbol: 'MXRF11' }];
  assert.deepEqual(preferredSimilarAssets(targets, allAssets).map(asset => asset.id), ['ale-main']);
  const values = valuesForSimilarAssets(targets, new Map([['RECR11', 0.85]]));
  assert.equal(values.get('ana-right'), 0.85);
});
