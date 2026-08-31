import { validateAction } from './finance-model.mjs';
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
async function overview(db) {
  // Um batch fornece uma visão consistente das duas tabelas.
  const [assets, transactions] = await db.batch([
    db.prepare('SELECT id, name, type AS assetType, quantity, average_price AS averagePrice, value AS total FROM finance_assets ORDER BY name, type'),
    db.prepare('SELECT id, asset_id AS assetId, name, type AS assetType, quantity, value, created_at AS createdAt FROM finance_transactions ORDER BY created_at, rowid')
  ]);
  return { assets: assets.results, transactions: transactions.results, total: assets.results.reduce((sum, asset) => sum + Math.round(asset.total * 100), 0) / 100 };
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
    if (action.type === 'asset') {
      await db.prepare(`INSERT INTO finance_assets (id, name, type, quantity, average_price, value)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT(id) DO NOTHING`)
        .bind(action.id, action.name, action.assetType, action.quantity, action.averagePrice, action.value).run();
    } else {
      // O INSERT e o trigger são atômicos: falha no saldo desfaz também a transação.
      // Nome e tipo vêm do ativo, nunca de campos livres enviados pelo cliente.
      const result = await db.prepare(`INSERT INTO finance_transactions (id, asset_id, name, type, quantity, value)
        SELECT ?1, id, name, type, ?3, ?4 FROM finance_assets WHERE id = ?2
        ON CONFLICT(id) DO NOTHING`).bind(action.id, action.assetId, action.quantity, action.value).run();
      if (!result.meta.changes) {
        const existing = await db.prepare('SELECT id FROM finance_transactions WHERE id = ?1').bind(action.id).first();
        if (!existing) return reply({ error: 'Ativo não encontrado. Atualize os dados.' }, 400);
      }
    }
    return reply(await overview(db));
  } catch (error) {
    if (/UNIQUE constraint/i.test(error.message)) return reply({ error: 'Já existe um ativo com este nome e tipo.' }, 409);
    if (/CHECK constraint/i.test(error.message)) return reply({ error: 'A operação excede os limites de quantidade, preço médio ou valor do ativo.' }, 400);
    console.error('Finance database error', error);
    return reply({ error: 'Não foi possível acessar Finanças. Verifique a conexão e aplique migrations/0001_finance.sql no banco.' }, 503);
  }
}
