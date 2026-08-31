import { calculateYields } from './finance-yield.mjs';
import { validateAction } from './finance-model.mjs';
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
async function overview(db) {
  // Um batch fornece uma visão consistente das duas tabelas.
  const [assets, transactions] = await db.batch([
    db.prepare('SELECT id, name, type AS assetType, quantity, average_price AS averagePrice, value AS total, COALESCE(current_price, average_price) AS currentPrice, current_income AS currentIncome, current_price IS NULL AS priceIsDefault, created_at AS createdAt, updated_at AS updatedAt, revision, (SELECT COUNT(*) FROM finance_transactions t WHERE t.asset_id = finance_assets.id) AS transactionCount FROM finance_assets ORDER BY name, type'),
    db.prepare('SELECT id, asset_id AS assetId, name, type AS assetType, quantity, value, created_at AS createdAt, updated_at AS updatedAt, transaction_date AS transactionDate, revision FROM finance_transactions ORDER BY transaction_date, created_at, rowid')
  ]);
  return { assets: assets.results.map(asset => ({ ...asset, ...calculateYields(asset.currentIncome, asset.currentPrice, asset.averagePrice) })), transactions: transactions.results, total: assets.results.reduce((sum, asset) => sum + Math.round(asset.total * 100), 0) / 100 };
}
export async function handleFinance(request, env) {
  if (!env.ADMIN_PASSWORD) return reply({ error: 'Acesso administrativo não configurado.' }, 503);
  if (request.headers.get('x-admin-password') !== env.ADMIN_PASSWORD) return reply({ error: 'Sessão inválida. Entre novamente.' }, 401);
  if (!['GET', 'POST'].includes(request.method)) return reply({ error: 'Método não permitido.' }, 405);
  if (!env.CONTENT_DB) return reply({ error: 'Banco de dados não configurado.' }, 503);
  try {
    const db = env.CONTENT_DB;
    if (request.method === 'GET') return reply(await overview(db));
    let action;
    try { action = validateAction(await request.json()); } catch (error) { return reply({ error: error.message }, 400); }
    const operation = action.operation || 'create';
    if (operation === 'delete') {
      const table = action.type === 'asset' ? 'finance_assets' : 'finance_transactions';
      const result = await db.prepare(`DELETE FROM ${table} WHERE id = ?1 AND revision = ?2`).bind(action.id, action.revision).run();
      if (!result.meta.changes) return reply({ error: 'Registro alterado ou excluído. Atualize os dados antes de tentar novamente.' }, 409);
    } else if (operation === 'update' && action.type === 'asset') {
      const result = await db.prepare(`UPDATE finance_assets SET name = ?1, type = ?2,
        quantity = ?3, average_price = ?4,
        value = CASE WHEN EXISTS (SELECT 1 FROM finance_transactions WHERE asset_id = ?7) THEN value ELSE ?5 END,
        current_price = ?6, current_income = ?8, current_dy = 0, revision = revision + 1
        WHERE id = ?7 AND revision = ?9 AND
          (NOT EXISTS (SELECT 1 FROM finance_transactions WHERE asset_id = ?7) OR (quantity = ?3 AND average_price = ?4))`)
        .bind(action.name, action.assetType, action.quantity, action.averagePrice, action.value, action.currentPrice, action.id, action.currentIncome, action.revision).run();
      if (!result.meta.changes) return reply({ error: 'Registro alterado ou saldo vinculado a transações. Atualize os dados; altere o saldo pelo histórico.' }, 409);
    } else if (operation === 'update') {
      const result = await db.prepare(`UPDATE finance_transactions SET
        asset_id = ?1, name = (SELECT name FROM finance_assets WHERE id = ?1),
        type = (SELECT type FROM finance_assets WHERE id = ?1), quantity = ?2, value = ?3, transaction_date = ?6, revision = revision + 1
        WHERE id = ?4 AND revision = ?5 AND EXISTS (SELECT 1 FROM finance_assets WHERE id = ?1)`)
        .bind(action.assetId, action.quantity, action.value, action.id, action.revision, action.transactionDate).run();
      if (!result.meta.changes) return reply({ error: 'Registro alterado, excluído ou ativo indisponível. Atualize os dados.' }, 409);
    } else if (action.type === 'asset') {
      await db.prepare(`INSERT INTO finance_assets (id, name, type, quantity, average_price, value, current_price, current_income)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8) ON CONFLICT(id) DO NOTHING`)
        .bind(action.id, action.name, action.assetType, action.quantity, action.averagePrice, action.value, action.currentPrice, action.currentIncome).run();
    } else {
      // O INSERT e o trigger são atômicos: falha no saldo desfaz também a transação.
      // Nome e tipo vêm do ativo, nunca de campos livres enviados pelo cliente.
      const result = await db.prepare(`INSERT INTO finance_transactions (id, asset_id, name, type, quantity, value, transaction_date)
        SELECT ?1, id, name, type, ?3, ?4, ?5 FROM finance_assets WHERE id = ?2
        ON CONFLICT(id) DO NOTHING`).bind(action.id, action.assetId, action.quantity, action.value, action.transactionDate).run();
      if (!result.meta.changes) {
        const existing = await db.prepare('SELECT id FROM finance_transactions WHERE id = ?1').bind(action.id).first();
        if (!existing) return reply({ error: 'Ativo não encontrado. Atualize os dados.' }, 400);
      }
    }
    return reply(await overview(db));
  } catch (error) {
    if (/FOREIGN KEY constraint/i.test(error.message)) return reply({ error: 'Este ativo possui transações. Exclua as transações vinculadas antes de excluir o ativo.' }, 409);
    if (/UNIQUE constraint/i.test(error.message)) return reply({ error: 'Já existe um ativo com este nome e tipo.' }, 409);
    if (/CHECK constraint/i.test(error.message)) return reply({ error: 'A operação excede os limites de quantidade, preço médio ou valor do ativo.' }, 400);
    console.error('Finance database error', error);
    return reply({ error: 'Não foi possível acessar Finanças. Verifique a conexão e se as migrações 0001, 0002, 0003, 0004, 0005 e 0006 foram aplicadas no banco.' }, 503);
  }
}
