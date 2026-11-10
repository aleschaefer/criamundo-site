import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importMarketData } from '../finance-market-import.mjs';
const asset = { id: 'ale', owner: 'Ale', symbol: 'BCRI11', assetType: 1, subType: 2, revision: 0 };
const ok = result => ({ response: { ok: true }, result });
test('importa em sequência com revisões novas e conta registros do agrupamento selecionado', async () => {
  let state = { assets: [asset, { ...asset, id: 'ana', owner: 'Ana' }] }; const saved = [];
  const summary = await importMarketData({ pause: async () => {}, assetIds: ['ale'], assetType: 1, subType: 2, onData() {}, onProgress() {}, request: async (url, options) => {
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
  const summary = await importMarketData({ pause: async () => {}, assetIds: ['ale'], assetType: 1, subType: 2, onData() {}, onProgress() {}, request: async (url, options) => {
    if (options.method === 'POST') { posts++; return posts === 1 ? { response: { ok: false }, result: { error: 'Conflito' } } : ok({ assets: [asset] }); }
    if (url === '/api/admin/finance') return ok({ assets: [asset] });
    if (url.includes('/minimum-price?')) throw new Error('Timeout');
    return ok({ value: 1 });
  } });
  assert.deepEqual(summary.map(s => s.imported), [0, 0, 1]);
  assert.deepEqual(summary.map(s => s.failed), [1, 1, 0]);
  assert.equal(summary[1].error, 'Conflito');
});

test('preserva motivo e sigla das consultas bloqueadas', async () => {
  const summary = await importMarketData({ pause: async () => {}, assetIds: ['ale'], assetType: 1, subType: 2, onData() {}, onProgress() {}, request: async url => {
    if (url === '/api/admin/finance') return ok({ assets: [asset] });
    return { response: { ok: false, status: 502 }, result: { error: 'Status Invest bloqueou a consulta (HTTP 403).' } };
  } });
  for (const step of summary) {
    assert.equal(step.imported, 0);
    assert.match(step.error, /403/);
  }
});

test('aguarda dois segundos entre consultas, inclusive entre etapas', async () => {
  const pauses = [];
  await importMarketData({ assetIds: ['ale'], assetType: 1, subType: 2, onData() {}, onProgress() {}, pause: async ms => pauses.push(ms), request: async url => url === '/api/admin/finance' ? ok({ assets: [asset] }) : ok({ value: 1 }) });
  assert.deepEqual(pauses, [2000, 2000]);
});
test('não insiste após limitação HTTP 429', async () => {
  let queries = 0;
  const result = await importMarketData({ assetIds: ['ale', 'other'], assetType: 1, subType: 2, onData() {}, onProgress() {}, pause: async () => {}, request: async url => {
    if (url === '/api/admin/finance') return ok({ assets: [asset, { ...asset, id: 'other', symbol: 'CPTS11' }] });
    queries++; return { response: { ok: false, status: 429 }, result: { error: 'Limite HTTP 429.' } };
  } });
  assert.equal(queries, 1);
  assert.ok(result.every(step => step.failed === 2 && step.imported === 0));
});
