import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { validateAction } from '../finance-model.mjs';
import { handleFinance } from '../finance-api.mjs';
import { todayInSaoPaulo, validTransactionDate, formatTransactionDate } from '../finance-date.mjs';
import { calculateYields } from '../finance-yield.mjs';
import { assetAllocation } from '../finance-allocation.mjs';
const migration = readFileSync(new URL('../migrations/0001_finance.sql', import.meta.url), 'utf8');
const marketMigration = readFileSync(new URL('../migrations/0002_asset_market_fields.sql', import.meta.url), 'utf8');
const incomeMigration = readFileSync(new URL('../migrations/0003_asset_income.sql', import.meta.url), 'utf8');
const editMigration = readFileSync(new URL('../migrations/0004_finance_edit_delete.sql', import.meta.url), 'utf8');
const timestampMigration = readFileSync(new URL('../migrations/0005_finance_timestamps.sql', import.meta.url), 'utf8');
const dateMigration = readFileSync(new URL('../migrations/0006_transaction_date.sql', import.meta.url), 'utf8');
function database() {
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys = ON');
  sql.exec(migration);
  sql.exec(marketMigration);
  sql.exec(incomeMigration);
  sql.exec(editMigration);
  sql.exec(timestampMigration);
  sql.exec(dateMigration);
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
const transaction = (assetId, values = {}) => ({ type: 'transaction', id: crypto.randomUUID(), assetId, transactionDate: '2026-08-31', quantity: 10, unitPrice: 30, ...values });
const request = (body, password = 'test-password') => new Request('https://example.test/api/admin/finance', { method: body ? 'POST' : 'GET', headers: { 'x-admin-password': password }, ...(body ? { body: JSON.stringify(body) } : {}) });
const envFor = () => ({ ADMIN_PASSWORD: 'test-password', CONTENT_DB: database() });
test('valida nomes, enum, quantidades inteiras e precisão decimal', () => {
  assert.equal(validateAction(asset({ averagePrice: 12.34 })).value, 123.4);
  for (const values of [{ name: 'a'.repeat(31) }, { name: ' ' }, { assetType: 0 }, { assetType: '1' }, { quantity: 1.5 }, { quantity: -1 }, { averagePrice: 1.001 }, { averagePrice: 1000000 }, { quantity: 1000, averagePrice: 999999.99 }]) assert.throws(() => validateAction(asset(values)));
  for (const values of [{ quantity: 0 }, { quantity: 1.1 }, { unitPrice: 1.001 }, { unitPrice: -1 }, { unitPrice: Infinity }, { unitPrice: 1000000 }, { unitPrice: undefined }, { quantity: 1000, unitPrice: 999999.99 }]) assert.throws(() => validateAction(transaction('id', values)));
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
  let response = await handleFinance(request(transaction(a.id, { quantity: 3, unitPrice: 3.33 })), env);
  let data = await response.json();
  assert.equal(data.assets[0].averagePrice, 3.33);
  assert.equal(data.total, 9.99);
  response = await handleFinance(request(transaction(a.id, { quantity: 1, unitPrice: 1 })), env);
  data = await response.json();
  assert.equal(data.assets[0].averagePrice, 2.75);
  assert.equal(data.total, 10.99);
});
test('limite excedido reverte também o INSERT de transação', async () => {
  const env = envFor(); const a = asset({ quantity: 100, averagePrice: 999999.99 });
  await handleFinance(request(a), env);
  const response = await handleFinance(request(transaction(a.id, { unitPrice: 1, quantity: 1 })), env);
  assert.equal(response.status, 400);
  const data = await (await handleFinance(request(), env)).json();
  assert.equal(data.transactions.length, 0);
  assert.equal(data.assets[0].quantity, 100);
  assert.equal(data.total, 99999999);
});
test('banco rejeita campos inválidos e relacionamento incorreto e recalcula edição/exclusão', () => {
  const { sql } = database();
  sql.exec("INSERT INTO finance_assets (id, name, type, quantity, average_price, value) VALUES ('a','ABC',1,1,10,10)");
  const insert = sql.prepare("INSERT INTO finance_transactions (id, asset_id, name, type, quantity, value, transaction_date) VALUES (?, ?, ?, ?, ?, ?, '2026-08-31')");
  for (const args of [['t','a','ABC',1,1.5,10], ['t','a','ABC',1,1,1.001], ['t','a','ABC',6,1,10], ['t','missing','ABC',1,1,10], ['t','a','Wrong',1,1,10]]) assert.throws(() => insert.run(...args));
  insert.run('t','a','ABC',1,1,10);
  sql.exec("UPDATE finance_transactions SET value = 100 WHERE id = 't'");
  assert.equal(sql.prepare("SELECT value FROM finance_assets WHERE id = 'a'").get().value, 110);
  sql.exec("DELETE FROM finance_transactions WHERE id = 't'");
  assert.equal(sql.prepare("SELECT value FROM finance_assets WHERE id = 'a'").get().value, 10);
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
  sql.exec("INSERT INTO finance_transactions (id, asset_id, name, type, quantity, value, transaction_date) VALUES ('t','a','ABC',1,2,30,'2026-08-31')");
  sql.exec(migration);
  assert.equal(sql.prepare('SELECT count(*) AS count FROM finance_transactions').get().count, 1);
  const asset = sql.prepare("SELECT quantity, average_price, value FROM finance_assets WHERE id = 'a'").get();
  assert.equal(asset.quantity, 3);
  assert.equal(asset.average_price, 13.33);
  assert.equal(asset.value, 40);
  assert.equal(sql.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'finance_state'").get().count, 0);
});
test('rendimento com cinco casas, DY calculados e restrição a Ação/FII', async () => {
  for (const assetType of [1, 2]) {
    const env = envFor();
    const omitted = asset({ assetType });
    let data = await (await handleFinance(request(omitted), env)).json();
    assert.equal(data.assets[0].currentIncome, 0);
    assert.equal(data.assets[0].currentDy, 0);
    assert.equal(data.assets[0].averageDy, 0);
    const explicit = asset({ name: 'Cotação', assetType, currentPrice: 25, currentIncome: 0.12345, currentDy: 999, averageDy: 999 });
    data = await (await handleFinance(request(explicit), env)).json();
    let saved = data.assets.find(item => item.id === explicit.id);
    assert.equal(saved.currentIncome, 0.12345);
    assert.equal(saved.currentDy, 0.12345 / 25 * 100);
    assert.equal(saved.averageDy, 0.12345 / 20 * 100);
    data = await (await handleFinance(request(transaction(explicit.id)), env)).json();
    saved = data.assets.find(item => item.id === explicit.id);
    assert.equal(saved.averagePrice, 25);
    assert.equal(saved.averageDy, saved.currentDy);
    assert.equal(saved.currentIncome, 0.12345);
    const zero = validateAction(asset({ assetType, currentPrice: 0, currentIncome: 0 }));
    assert.equal(zero.currentPrice, 0); assert.equal(zero.currentIncome, 0);
    const blank = validateAction(asset({ assetType, currentPrice: '', currentIncome: '' }));
    assert.equal(blank.currentPrice, null); assert.equal(blank.currentIncome, 0);
    for (const values of [{ currentPrice: -1 }, { currentPrice: 1.001 }, { currentPrice: 1000000 }, { currentIncome: -1 }, { currentIncome: NaN }, { currentIncome: 0.123456 }, { currentIncome: 100 }]) {
      assert.throws(() => validateAction(asset({ assetType, ...values })));
    }
    assert.equal(validateAction(asset({ assetType, currentIncome: 99.99999 })).currentIncome, 99.99999);
  }
  for (const assetType of [3, 4, 5]) {
    const value = validateAction(asset({ assetType, currentPrice: 100, currentIncome: 10 }));
    assert.equal(value.currentPrice, null); assert.equal(value.currentIncome, 0);
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
test('DY: fórmulas sem anualização, preços zero e fallback após transação', async () => {
  assert.deepEqual(calculateYields(1, 25, 20), { currentDy: 4, averageDy: 5 });
  assert.deepEqual(calculateYields(1, 0, 0), { currentDy: null, averageDy: null });
  assert.deepEqual(calculateYields(0, 10, 10), { currentDy: 0, averageDy: 0 });
  const env = envFor();
  const a = asset({ assetType: 1, currentIncome: 1 });
  let saved = (await (await handleFinance(request(a), env)).json()).assets[0];
  assert.equal(saved.currentPrice, 20); assert.equal(saved.currentDy, 5);
  saved = (await (await handleFinance(request(transaction(a.id)), env)).json()).assets[0];
  assert.equal(saved.currentPrice, 25); assert.equal(saved.currentDy, 4); assert.equal(saved.averageDy, 4);
  const empty = asset({ name: 'Sem saldo', assetType: 1, quantity: 0, averagePrice: 0, currentPrice: 0, currentIncome: 1 });
  const rows = (await (await handleFinance(request(empty), env)).json()).assets;
  saved = rows.find(item => item.id === empty.id);
  assert.equal(saved.currentDy, null); assert.equal(saved.averageDy, null);
});
test('migração 0003 preserva saldos e DY legado e valida cinco casas no banco', () => {
  const sql = new DatabaseSync(':memory:');
  sql.exec(migration); sql.exec(marketMigration);
  sql.exec("INSERT INTO finance_assets (id,name,type,quantity,average_price,value,current_dy) VALUES ('a','ABC',1,1,10,10,5)");
  sql.exec(incomeMigration);
  let value = sql.prepare("SELECT * FROM finance_assets WHERE id='a'").get();
  assert.equal(value.current_dy, 5); assert.equal(value.current_income, 0);
  assert.equal(value.quantity, 1); assert.equal(value.value, 10);
  sql.exec("UPDATE finance_assets SET current_income=0.12345 WHERE id='a'");
  assert.equal(sql.prepare("SELECT current_income FROM finance_assets WHERE id='a'").get().current_income, .12345);
  assert.throws(() => sql.exec("UPDATE finance_assets SET current_income=0.123456 WHERE id='a'"));
  assert.throws(() => sql.exec("UPDATE finance_assets SET current_income=100 WHERE id='a'"));
  assert.throws(() => sql.exec("UPDATE finance_assets SET current_income=-1 WHERE id='a'"));
});
test('transação calcula quantidade × valor unitário sem confiar no total enviado', async () => {
  const env = envFor(); const a = asset({ quantity: 0, averagePrice: 0 });
  await handleFinance(request(a), env);
  const input = transaction(a.id, { quantity: 3, unitPrice: 12.34, value: 999 });
  assert.equal(validateAction(input).value, 37.02);
  const response = await handleFinance(request(input), env);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.transactions[0].value, 37.02);
  assert.equal(data.assets[0].quantity, 3);
  assert.equal(data.assets[0].averagePrice, 12.34);
  assert.equal(data.total, 37.02);
  assert.equal(validateAction(transaction(a.id, { unitPrice: 0 })).value, 0);
});
const snapshot = async env => (await handleFinance(request(), env)).json();
const mutate = (record, type, operation, changes = {}) => ({ ...record, type, operation, ...changes });
test('editar e excluir transações preserva saldo de abertura e bloqueia versões antigas', async () => {
  const env = envFor(); const a = asset();
  await handleFinance(request(a), env);
  await handleFinance(request(transaction(a.id)), env);
  let data = await snapshot(env); let tx = data.transactions[0];
  const update = mutate(tx, 'transaction', 'update', { quantity: 5, unitPrice: 10 });
  assert.equal((await handleFinance(request(update), env)).status, 200);
  data = await snapshot(env);
  assert.equal(data.assets[0].quantity, 15); assert.equal(data.assets[0].total, 250);
  assert.equal(data.assets[0].averagePrice, 16.67);
  assert.equal((await handleFinance(request(update), env)).status, 409);
  assert.equal((await handleFinance(request(mutate(tx, 'transaction', 'delete')), env)).status, 409);
  tx = data.transactions[0];
  assert.equal((await handleFinance(request(mutate(tx, 'transaction', 'delete')), env)).status, 200);
  data = await snapshot(env);
  assert.equal(data.assets[0].quantity, 10); assert.equal(data.assets[0].total, 200);
  assert.equal(data.assets[0].averagePrice, 20); assert.equal(data.transactions.length, 0);
});
test('transação pode mudar de ativo e excluir última entrada zera o saldo', async () => {
  const env = envFor(); const a = asset({ quantity: 0, averagePrice: 0 }); const b = asset({ name: 'Outro' });
  await handleFinance(request(a), env); await handleFinance(request(b), env);
  await handleFinance(request(transaction(a.id)), env);
  let data = await snapshot(env);
  assert.equal((await handleFinance(request(mutate(data.transactions[0], 'transaction', 'update', { assetId: b.id, quantity: 2, unitPrice: 5 })), env)).status, 200);
  data = await snapshot(env);
  assert.equal(data.assets.find(x => x.id === a.id).total, 0);
  assert.equal(data.assets.find(x => x.id === a.id).averagePrice, 0);
  assert.equal(data.assets.find(x => x.id === b.id).total, 210);
  assert.equal(data.transactions[0].name, b.name);
});
test('editar ativo preserva custo arredondado e propaga nome/tipo sem apagar histórico', async () => {
  const env = envFor(); const a = asset({ quantity: 1, averagePrice: 10 });
  await handleFinance(request(a), env); await handleFinance(request(transaction(a.id, { quantity: 2, unitPrice: 10.01 })), env);
  let data = await snapshot(env); let saved = data.assets[0]; const before = saved.total;
  const update = mutate(saved, 'asset', 'update', { name: 'Novo nome', assetType: 1, currentIncome: .12, currentPrice: 30 });
  assert.equal((await handleFinance(request(update), env)).status, 200);
  data = await snapshot(env);
  assert.equal(data.assets[0].total, before);
  assert.equal(data.assets[0].currentIncome, .12);
  assert.equal(data.transactions[0].name, 'Novo nome'); assert.equal(data.transactions[0].assetType, 1);
  assert.equal((await handleFinance(request(mutate(data.assets[0], 'asset', 'update', { quantity: 99 })), env)).status, 409);
  assert.equal((await handleFinance(request(mutate(data.assets[0], 'asset', 'delete')), env)).status, 409);
  assert.equal((await snapshot(env)).transactions.length, 1);
});
test('ativo sem transações permite editar saldo e excluir; escrita exige senha', async () => {
  const env = envFor(); const a = asset();
  await handleFinance(request(a), env);
  let data = await snapshot(env);
  assert.equal((await handleFinance(request(mutate(data.assets[0], 'asset', 'update', { quantity: 5, averagePrice: 2 })), env)).status, 200);
  data = await snapshot(env); assert.equal(data.total, 10);
  const remove = mutate(data.assets[0], 'asset', 'delete');
  assert.equal((await handleFinance(request(remove, 'wrong'), env)).status, 401);
  assert.equal((await handleFinance(request(remove), env)).status, 200);
  assert.equal((await snapshot(env)).assets.length, 0);
});
test('edição fora dos limites é revertida junto com o histórico', async () => {
  const env = envFor(); const a = asset({ quantity: 100, averagePrice: 999999.98 });
  await handleFinance(request(a), env); await handleFinance(request(transaction(a.id, { quantity: 1, unitPrice: 1 })), env);
  const before = await snapshot(env);
  const response = await handleFinance(request(mutate(before.transactions[0], 'transaction', 'update', { quantity: 2, unitPrice: 1 })), env);
  assert.equal(response.status, 400);
  assert.deepEqual(await snapshot(env), before);
});
test('migração 0004 preserva registros, histórico e chaves estrangeiras', () => {
  const sql = new DatabaseSync(':memory:'); sql.exec('PRAGMA foreign_keys=ON');
  sql.exec(migration); sql.exec(marketMigration); sql.exec(incomeMigration);
  sql.exec("INSERT INTO finance_assets (id,name,type,quantity,average_price,value) VALUES ('a','ABC',1,1,10,10)");
  sql.exec("INSERT INTO finance_transactions (id,asset_id,name,type,quantity,value) VALUES ('t','a','ABC',1,2,30)");
  sql.exec(editMigration);
  assert.equal(sql.prepare('SELECT value FROM finance_assets').get().value, 40);
  assert.equal(sql.prepare('SELECT value FROM finance_transactions').get().value, 30);
  assert.equal(sql.prepare('PRAGMA foreign_key_check').all().length, 0);
  sql.exec("DELETE FROM finance_transactions WHERE id='t'");
  assert.equal(sql.prepare('SELECT value FROM finance_assets').get().value, 10);
});
test('data de inclusão é preservada e última atualização vem do banco, não do cliente', async () => {
  const env = envFor();
  let now = '2026-08-31T12:00:00.000Z';
  env.CONTENT_DB.sql.function('strftime', { varargs: true }, () => now);
  const a = asset({ createdAt: '2000-01-01T00:00:00Z', updatedAt: '2000-01-01T00:00:00Z' });
  await handleFinance(request(a), env);
  let data = await snapshot(env);
  assert.equal(data.assets[0].createdAt, now); assert.equal(data.assets[0].updatedAt, now);
  const createdAt = now;
  now = '2026-08-31T13:00:00.000Z';
  await handleFinance(request(mutate(data.assets[0], 'asset', 'update', { name: 'Renomeado', updatedAt: createdAt })), env);
  data = await snapshot(env);
  assert.equal(data.assets[0].createdAt, createdAt); assert.equal(data.assets[0].updatedAt, now);
  // Leituras e reenvios de criação não substituem a data persistida.
  now = '2026-08-31T14:00:00.000Z';
  await handleFinance(request(a), env);
  data = await snapshot(env); assert.equal(data.assets[0].updatedAt, '2026-08-31T13:00:00.000Z');
});
test('transação registra inclusão/edição e atualiza a data do ativo inclusive ao excluir', async () => {
  const env = envFor();
  let now = '2026-08-31T12:00:00.000Z';
  env.CONTENT_DB.sql.function('strftime', { varargs: true }, () => now);
  const a = asset(); await handleFinance(request(a), env);
  now = '2026-08-31T13:00:00.000Z';
  await handleFinance(request(transaction(a.id)), env);
  let data = await snapshot(env); const txCreated = now;
  assert.equal(data.transactions[0].createdAt, now); assert.equal(data.transactions[0].updatedAt, now);
  assert.equal(data.assets[0].updatedAt, now);
  now = '2026-08-31T14:00:00.000Z';
  await handleFinance(request(mutate(data.transactions[0], 'transaction', 'update', { quantity: 5, unitPrice: 10 })), env);
  data = await snapshot(env);
  assert.equal(data.transactions[0].createdAt, txCreated); assert.equal(data.transactions[0].updatedAt, now);
  assert.equal(data.assets[0].updatedAt, now);
  now = '2026-08-31T15:00:00.000Z';
  await handleFinance(request(mutate(data.transactions[0], 'transaction', 'delete')), env);
  data = await snapshot(env);
  assert.equal(data.assets[0].updatedAt, now); assert.equal(data.assets[0].createdAt, '2026-08-31T12:00:00.000Z');
});
test('migração 0005 preserva datas conhecidas e não inventa datas para registros antigos', () => {
  const sql = new DatabaseSync(':memory:'); sql.exec('PRAGMA foreign_keys=ON');
  sql.exec(migration); sql.exec(marketMigration); sql.exec(incomeMigration); sql.exec(editMigration);
  sql.exec("INSERT INTO finance_assets (id,name,type,quantity,average_price,value) VALUES ('a','ABC',1,1,10,10)");
  sql.exec("INSERT INTO finance_transactions (id,asset_id,name,type,quantity,value,created_at) VALUES ('t','a','ABC',1,2,30,'2026-08-01T12:00:00.000Z')");
  sql.exec("INSERT INTO finance_transactions (id,asset_id,name,type,quantity,value,created_at,revision) VALUES ('edited','a','ABC',1,1,10,'2026-08-01T12:00:00.000Z',1)");
  sql.exec(timestampMigration);
  assert.equal(sql.prepare('SELECT created_at FROM finance_assets').get().created_at, null);
  assert.equal(sql.prepare('SELECT updated_at FROM finance_assets').get().updated_at, null);
  assert.equal(sql.prepare("SELECT updated_at FROM finance_transactions WHERE id='t'").get().updated_at, '2026-08-01T12:00:00.000Z');
  assert.equal(sql.prepare("SELECT updated_at FROM finance_transactions WHERE id='edited'").get().updated_at, null);
  assert.equal(sql.prepare('SELECT value FROM finance_assets').get().value, 50);
});
test('data de negócio válida, calendário e data atual no horário de Brasília', () => {
  assert.equal(todayInSaoPaulo(new Date('2026-09-01T02:59:59Z')), '2026-08-31');
  assert.equal(todayInSaoPaulo(new Date('2026-09-01T03:00:00Z')), '2026-09-01');
  assert.equal(formatTransactionDate('2026-08-31'), '31/08/2026');
  assert.equal(formatTransactionDate(null), 'Não informada');
  assert.equal(validTransactionDate('2024-02-29'), true);
  for (const date of [null, '', undefined, '2026-02-29', '2026-02-30', '2026-04-31', '2026-13-01', '2026-00-10', '0000-01-01', '31/08/2026', '2026-08-31T00:00:00Z']) {
    assert.equal(validTransactionDate(date), false);
    assert.throws(() => validateAction(transaction('a', { transactionDate: date })));
  }
});
test('incluir e editar data da transação preserva data de criação e atualiza auditoria', async () => {
  const env = envFor(); let now = '2026-08-31T12:00:00.000Z';
  env.CONTENT_DB.sql.function('strftime', { varargs: true }, () => now);
  const a = asset(); await handleFinance(request(a), env);
  const tx = transaction(a.id, { transactionDate: '2026-07-05' });
  let response = await handleFinance(request(tx), env);
  assert.equal(response.status, 200);
  let data = await response.json();
  assert.equal(data.transactions[0].transactionDate, '2026-07-05');
  assert.equal(data.transactions[0].createdAt, now);
  const initialTotal = data.total;
  now = '2026-09-01T12:00:00.000Z';
  response = await handleFinance(request(mutate(data.transactions[0], 'transaction', 'update', { unitPrice: 30, transactionDate: '2026-07-06' })), env);
  assert.equal(response.status, 200); data = await response.json();
  assert.equal(data.transactions[0].transactionDate, '2026-07-06');
  assert.equal(data.transactions[0].createdAt, '2026-08-31T12:00:00.000Z');
  assert.equal(data.transactions[0].updatedAt, now);
  assert.equal(data.total, initialTotal);
});
test('migração 0006 preserva transações antigas sem inventar a data de negócio', () => {
  const sql = new DatabaseSync(':memory:'); sql.exec('PRAGMA foreign_keys=ON');
  sql.exec(migration); sql.exec(marketMigration); sql.exec(incomeMigration); sql.exec(editMigration); sql.exec(timestampMigration);
  sql.exec("INSERT INTO finance_assets (id,name,type,quantity,average_price,value) VALUES ('a','ABC',1,1,10,10)");
  sql.exec("INSERT INTO finance_transactions (id,asset_id,name,type,quantity,value) VALUES ('t','a','ABC',1,2,30)");
  const before = sql.prepare("SELECT created_at, updated_at FROM finance_transactions WHERE id='t'").get();
  sql.exec(dateMigration);
  assert.equal(sql.prepare("SELECT transaction_date FROM finance_transactions WHERE id='t'").get().transaction_date, null);
  assert.deepEqual(sql.prepare("SELECT created_at, updated_at FROM finance_transactions WHERE id='t'").get(), before);
  assert.equal(sql.prepare('SELECT value FROM finance_assets').get().value, 40);
  for (const date of ['2026-02-30', '2026-04-31', '2026-13-01', '2026-00-10', '0000-01-01', null]) {
    assert.throws(() => sql.prepare("UPDATE finance_transactions SET transaction_date=? WHERE id='t'").run(date));
  }
  sql.exec("UPDATE finance_transactions SET transaction_date='2024-02-29' WHERE id='t'");
  assert.equal(sql.prepare('SELECT transaction_date FROM finance_transactions').get().transaction_date, '2024-02-29');
});
