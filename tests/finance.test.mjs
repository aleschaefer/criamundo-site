import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { validateAction } from '../finance-model.mjs';
import { handleFinance } from '../finance-api.mjs';
import { assetAllocation } from '../finance-allocation.mjs';
const migration = readFileSync(new URL('../migrations/0001_finance.sql', import.meta.url), 'utf8');
const marketMigration = readFileSync(new URL('../migrations/0002_asset_market_fields.sql', import.meta.url), 'utf8');
function database() {
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys = ON');
  sql.exec(migration);
  sql.exec(marketMigration);
  const prepare = (query) => {
    let args = [];
    const statement = sql.prepare(query);
    return { bind(...values) { args = values; return this; },
      async first() { return statement.get(...args) || null; },
      async run() { return { meta: { changes: statement.run(...args).changes } }; },
      async all() { return { results: statement.all(...args) }; }
    };
  };
  return { sql, prepare, async batch(statements) {
    sql.exec('BEGIN');
    try { const result = await Promise.all(statements.map(statement => statement.all())); sql.exec('COMMIT'); return result; }
    catch (error) { sql.exec('ROLLBACK'); throw error; }
  } };
}
const asset = (values = {}) => ({ type: 'asset', id: crypto.randomUUID(), name: 'Reserva', assetType: 3, quantity: 10, averagePrice: 20, ...values });
const transaction = (assetId, values = {}) => ({ type: 'transaction', id: crypto.randomUUID(), assetId, quantity: 10, value: 300, ...values });
const request = (body, password = 'test-password') => new Request('https://example.test/api/admin/finance', { method: body ? 'POST' : 'GET', headers: { 'x-admin-password': password }, ...(body ? { body: JSON.stringify(body) } : {}) });
const envFor = () => ({ ADMIN_PASSWORD: 'test-password', CONTENT_DB: database() });
test('valida nomes, enum, quantidades inteiras e precisão decimal', () => {
  assert.equal(validateAction(asset({ averagePrice: 12.34 })).value, 123.4);
  for (const values of [{ name: 'a'.repeat(31) }, { name: ' ' }, { assetType: 0 }, { assetType: '1' }, { quantity: 1.5 }, { quantity: -1 }, { averagePrice: 1.001 }, { averagePrice: 1000000 }, { quantity: 1000, averagePrice: 999999.99 }]) assert.throws(() => validateAction(asset(values)));
  for (const values of [{ quantity: 0 }, { quantity: 1.1 }, { value: 1.001 }, { value: -1 }, { value: Infinity }, { value: 100000000 }]) assert.throws(() => validateAction(transaction('id', values)));
});
test('API persiste nas tabelas e trigger recalcula quantidade, média e valor', async () => {
  const env = envFor(); const a = asset();
  assert.equal((await handleFinance(request(a), env)).status, 200);
  const tx = transaction(a.id);
  const response = await handleFinance(request(tx), env);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.assets[0].quantity, 20);
  assert.equal(data.assets[0].averagePrice, 25);
  assert.equal(data.assets[0].total, 500);
  assert.equal(data.transactions[0].name, a.name);
  assert.equal(data.transactions[0].assetType, a.assetType);
  // Repetir o mesmo envio após uma falha de rede não duplica a transação.
  await handleFinance(request(tx), env);
  const saved = await (await handleFinance(request(), env)).json();
  assert.equal(saved.transactions.length, 1);
  assert.equal(saved.total, 500);
});
test('média arredondada não perde centavos no custo acumulado', async () => {
  const env = envFor(); const a = asset({ quantity: 0, averagePrice: 0 });
  await handleFinance(request(a), env);
  let response = await handleFinance(request(transaction(a.id, { quantity: 3, value: 10 })), env);
  let data = await response.json();
  assert.equal(data.assets[0].averagePrice, 3.33);
  assert.equal(data.total, 10);
  response = await handleFinance(request(transaction(a.id, { quantity: 1, value: 1 })), env);
  data = await response.json();
  assert.equal(data.assets[0].averagePrice, 2.75);
  assert.equal(data.total, 11);
});
test('limite excedido reverte também o INSERT de transação', async () => {
  const env = envFor(); const a = asset({ quantity: 100, averagePrice: 999999.99 });
  await handleFinance(request(a), env);
  const response = await handleFinance(request(transaction(a.id, { value: 1, quantity: 1 })), env);
  assert.equal(response.status, 400);
  const data = await (await handleFinance(request(), env)).json();
  assert.equal(data.transactions.length, 0);
  assert.equal(data.assets[0].quantity, 100);
  assert.equal(data.total, 99999999);
});
test('banco rejeita campos inválidos, relacionamento incorreto e edição de histórico', () => {
  const { sql } = database();
  sql.exec("INSERT INTO finance_assets (id, name, type, quantity, average_price, value) VALUES ('a','ABC',1,1,10,10)");
  const insert = sql.prepare('INSERT INTO finance_transactions (id, asset_id, name, type, quantity, value) VALUES (?, ?, ?, ?, ?, ?)');
  for (const args of [['t','a','ABC',1,1.5,10], ['t','a','ABC',1,1,1.001], ['t','a','ABC',6,1,10], ['t','missing','ABC',1,1,10], ['t','a','Wrong',1,1,10]]) assert.throws(() => insert.run(...args));
  insert.run('t','a','ABC',1,1,10);
  assert.throws(() => sql.exec("UPDATE finance_transactions SET value = 100 WHERE id = 't'"));
  assert.throws(() => sql.exec("DELETE FROM finance_transactions WHERE id = 't'"));
});
test('autorização, ativo inexistente e duplicidade', async () => {
  const env = envFor();
  assert.equal((await handleFinance(request(null, ''), env)).status, 401);
  assert.equal((await handleFinance(request(asset(), 'wrong'), env)).status, 401);
  assert.equal((await handleFinance(request(transaction('missing')), env)).status, 400);
  assert.equal((await handleFinance(request(asset()), env)).status, 200);
  assert.equal((await handleFinance(request(asset()), env)).status, 409);
});
test('script único pode ser reaplicado sem alterar saldos e histórico', () => {
  const { sql } = database();
  sql.exec("INSERT INTO finance_assets (id, name, type, quantity, average_price, value) VALUES ('a','ABC',1,1,10,10)");
  sql.exec("INSERT INTO finance_transactions (id, asset_id, name, type, quantity, value) VALUES ('t','a','ABC',1,2,30)");
  sql.exec(migration);
  assert.equal(sql.prepare('SELECT count(*) AS count FROM finance_transactions').get().count, 1);
  const asset = sql.prepare("SELECT quantity, average_price, value FROM finance_assets WHERE id = 'a'").get();
  assert.equal(asset.quantity, 3);
  assert.equal(asset.average_price, 13.33);
  assert.equal(asset.value, 40);
  assert.equal(sql.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'finance_state'").get().count, 0);
});
test('valor atual e DY opcionais, explícitos e restritos a Ação/FII', async () => {
  for (const assetType of [1, 2]) {
    const env = envFor();
    const omitted = asset({ assetType });
    let response = await handleFinance(request(omitted), env);
    let data = await response.json();
    assert.equal(data.assets[0].currentPrice, 20);
    assert.equal(data.assets[0].currentDy, 0);
    // O padrão acompanha a média recalculada.
    data = await (await handleFinance(request(transaction(omitted.id)), env)).json();
    assert.equal(data.assets[0].currentPrice, 25);
    const explicit = asset({ name: 'Cotação', assetType, currentPrice: 45.67, currentDy: 8.91 });
    await handleFinance(request(explicit), env);
    data = await (await handleFinance(request(transaction(explicit.id)), env)).json();
    const saved = data.assets.find(item => item.id === explicit.id);
    assert.equal(saved.currentPrice, 45.67);
    assert.equal(saved.currentDy, 8.91);
    assert.equal(saved.averagePrice, 25);
    const zero = validateAction(asset({ assetType, currentPrice: 0, currentDy: 0 }));
    assert.equal(zero.currentPrice, 0);
    assert.equal(zero.currentDy, 0);
    const blank = validateAction(asset({ assetType, currentPrice: '', currentDy: '' }));
    assert.equal(blank.currentPrice, null);
    assert.equal(blank.currentDy, 0);
    for (const values of [{ currentPrice: -1 }, { currentPrice: 1.001 }, { currentPrice: 1000000 }, { currentDy: -1 }, { currentDy: NaN }, { currentDy: 1.001 }]) {
      assert.throws(() => validateAction(asset({ assetType, ...values })));
    }
  }
  for (const assetType of [3, 4, 5]) {
    const value = validateAction(asset({ assetType, currentPrice: 100, currentDy: 10 }));
    assert.equal(value.currentPrice, null);
    assert.equal(value.currentDy, 0);
  }
});
test('migração preserva registros e aplica os padrões aos ativos existentes', () => {
  const sql = new DatabaseSync(':memory:');
  sql.exec(migration);
  sql.exec("INSERT INTO finance_assets VALUES ('old','ABC',1,2,10,20)");
  sql.exec(marketMigration);
  const value = sql.prepare("SELECT COALESCE(current_price, average_price) AS price, current_dy AS dy, quantity, value FROM finance_assets WHERE id='old'").get();
  assert.equal(value.price, 10); assert.equal(value.dy, 0);
  assert.equal(value.quantity, 2); assert.equal(value.value, 20);
  assert.throws(() => sql.exec("UPDATE finance_assets SET current_price=-1 WHERE id='old'"));
  assert.throws(() => sql.exec("UPDATE finance_assets SET current_dy=1.001 WHERE id='old'"));
});
test('schema completo inclui os campos atuais para banco novo', () => {
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  sql.exec("INSERT INTO finance_assets (id,name,type,quantity,average_price,value,current_price,current_dy) VALUES ('a','ABC',1,1,10,10,12.34,5.67)");
  assert.equal(sql.prepare('SELECT current_dy FROM finance_assets').get().current_dy, 5.67);
});
test('pizza agrupa custos em centavos para os cinco tipos sem usar a cotação', () => {
  const allocation = assetAllocation([
    { assetType: 1, total: .1, currentPrice: 100 },
    { assetType: 1, total: .2, currentPrice: 500 },
    { assetType: 2, total: .3 },
    { assetType: 3, total: .6 },
    { assetType: 4, total: 0 },
    { assetType: 5, total: 0 }
  ]);
  assert.deepEqual(allocation.map(item => item.amount), [.3, .3, .6, 0, 0]);
  assert.deepEqual(allocation.map(item => item.percent), [25, 25, 50, 0, 0]);
  assert.ok(assetAllocation([]).every(item => item.percent === 0));
  assert.equal(assetAllocation([{ assetType: 2, total: 10 }])[1].percent, 100);
});
