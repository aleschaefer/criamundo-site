import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importMarketData } from '../finance-market-import.mjs';
const asset = { id: 'ale', owner: 'Ale', symbol: 'BCRI11', assetType: 1, subType: 2, revision: 0 };
const ok = result => ({ response: { ok: true }, result });
test('importa em sequência com revisões novas e conta registros do agrupamento selecionado', async () => {
  let state = { assets: [asset, { ...asset, id: 'ana', owner: 'Ana' }] }; const saved = [];
  const summary = await importMarketData({ assetIds: ['ale'], assetType: 1, subType: 2, onData() {}, onProgress() {}, request: async (url, options) => {
    if (url === '/api/admin/finance' && options.method !== 'POST') return ok(state);
    if (options.method === 'POST') {
      const action = JSON.parse(options.body); saved.push(action.type);
      assert.equal(action.items.length, 1); assert.equal(action.items[0].id, 'ale');
      assert.equal(action.items[0].revision, saved.length - 1);
      state = { assets: state.assets.map(a => a.id === 'ale' ? { ...a, revision: a.revision + 1 } : a) }; return ok(state);
    }
    return ok({ value: url.includes('/income?') ? 0 : 49.01 });
  } });
  assert.deepEqual(saved, ['asset-minimum-price-batch', 'asset-current-price-batch', 'asset-income-batch']);
  assert.deepEqual(summary.map(s => s.imported), [1, 1, 1]);
  assert.equal(state.assets[1].revision, 0);
});
test('falhas de consulta e gravação não contam como importadas e não impedem a próxima etapa', async () => {
  let posts = 0;
  const summary = await importMarketData({ assetIds: ['ale'], assetType: 1, subType: 2, onData() {}, onProgress() {}, request: async (url, options) => {
    if (options.method === 'POST') { posts++; return posts === 1 ? { response: { ok: false }, result: { error: 'Conflito' } } : ok({ assets: [asset] }); }
    if (url === '/api/admin/finance') return ok({ assets: [asset] });
    if (url.includes('/minimum-price?')) throw new Error('Timeout');
    return ok({ value: 1 });
  } });
  assert.deepEqual(summary.map(s => s.imported), [0, 0, 1]);
  assert.deepEqual(summary.map(s => s.failed), [1, 1, 0]);
  assert.equal(summary[1].error, 'Conflito');
});
