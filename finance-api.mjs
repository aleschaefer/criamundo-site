import { calculateYields } from './finance-yield.mjs';
import { validateAction, validateAssetIncomeBatch } from './finance-model.mjs';
import { requireAdminSession } from './admin-auth.mjs';
import { validateAssetImport } from './finance-asset-import-model.mjs';
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
async function overview(db) {
  // Um batch fornece uma visão consistente das duas tabelas.
  const [assets, transactions] = await db.batch([
    db.prepare('SELECT id, owner, name, symbol, type AS assetType, subtype AS subType, quantity, average_price AS averagePrice, value AS total, COALESCE(current_price, average_price) AS currentPrice, current_income AS currentIncome, current_price IS NULL AS priceIsDefault, created_at AS createdAt, updated_at AS updatedAt, revision, (SELECT COUNT(*) FROM finance_transactions t WHERE t.asset_id = finance_assets.id) AS transactionCount FROM finance_assets ORDER BY owner, name, type'),
    db.prepare('SELECT id, owner, asset_id AS assetId, name, type AS assetType, subtype AS subType, quantity, value, created_at AS createdAt, updated_at AS updatedAt, transaction_date AS transactionDate, revision FROM finance_transactions ORDER BY transaction_date, created_at, rowid')
  ]);
  return { assets: assets.results.map(asset => ({ ...asset, ...calculateYields(asset.currentIncome, asset.currentPrice, asset.averagePrice) })), transactions: transactions.results, total: assets.results.reduce((sum, asset) => sum + Math.round(asset.total * 100), 0) / 100 };
}
export async function handleFinance(request, env) {
  if (!await requireAdminSession(request, env)) return reply({ error: 'Sessão inválida. Entre novamente.' }, 401);
  if (!['GET', 'POST'].includes(request.method)) return reply({ error: 'Método não permitido.' }, 405);
  if (!env.CONTENT_DB) return reply({ error: 'Banco de dados não configurado.' }, 503);
  try {
    const db = env.CONTENT_DB;
    if (request.method === 'GET') return reply(await overview(db));
    let action;
    try { const body=await request.json();action=body?.type==='asset-import'?validateAssetImport(body):body?.type==='asset-income-batch'?validateAssetIncomeBatch(body):validateAction(body); } catch (error) { return reply({ error: error.message }, 400); }
    if(action.type==='asset-import'){
      const statements=[];
      for(const item of action.items){
        const averagePrice=item.quantity?Math.round(item.total/item.quantity*100)/100:0;
        const existing=await db.prepare(`SELECT id FROM finance_assets
          WHERE (symbol=?1 AND name=?2) OR (name=?2 AND type=?3 AND subtype=?4)
          ORDER BY CASE WHEN symbol=?1 THEN 0 ELSE 1 END LIMIT 1`)
          .bind(item.symbol,item.name,item.assetType,item.subType).first();
        if(existing)statements.push(db.prepare(`UPDATE finance_assets SET owner=?1,name=?2,symbol=?3,type=?4,subtype=?5,quantity=?6,average_price=?7,value=?8,current_price=?9,current_income=0,current_dy=0,revision=revision+1 WHERE id=?10`).bind(item.owner,item.name,item.symbol,item.assetType,item.subType,item.quantity,averagePrice,item.total,item.currentPrice,existing.id));
        else statements.push(db.prepare(`INSERT INTO finance_assets(id,owner,name,symbol,type,subtype,quantity,average_price,value,current_price,current_income,current_dy) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,0,0)`).bind(item.id,item.owner,item.name,item.symbol,item.assetType,item.subType,item.quantity,averagePrice,item.total,item.currentPrice));
      }
      await db.batch(statements);return reply(await overview(db));
    }
    if(action.type==='asset-income-batch'){
      const results=await db.batch(action.items.map(item=>db.prepare(`UPDATE finance_assets SET current_income=?1,current_dy=0,revision=revision+1
        WHERE id=?2 AND revision=?3 AND type=1 AND subtype IN (1,2) RETURNING id`).bind(item.currentIncome,item.id,item.revision)));
      if(results.some(result=>!result.results?.length))return reply({error:'Um dos ativos foi alterado ou não aceita rendimento. Atualize os dados e tente novamente.'},409);
      return reply(await overview(db));
    }
    const operation = action.operation || 'create';
    if (operation === 'delete') {
      const table = action.type === 'asset' ? 'finance_assets' : 'finance_transactions';
      const result = await db.prepare(`DELETE FROM ${table} WHERE id = ?1 AND revision = ?2`).bind(action.id, action.revision).run();
      if (!result.meta.changes) return reply({ error: 'Registro alterado ou excluído. Atualize os dados antes de tentar novamente.' }, 409);
    } else if (operation === 'update' && action.type === 'asset') {
      const result = await db.prepare(`UPDATE finance_assets SET name = ?1, type = ?2, subtype = ?10, symbol = ?11, owner = ?12,
        quantity = ?3, average_price = ?4,
        value = CASE WHEN EXISTS (SELECT 1 FROM finance_transactions WHERE asset_id = ?7) THEN value ELSE ?5 END,
        current_price = ?6, current_income = ?8, current_dy = 0, revision = revision + 1
        WHERE id = ?7 AND revision = ?9 AND
          (NOT EXISTS (SELECT 1 FROM finance_transactions WHERE asset_id = ?7) OR (quantity = ?3 AND average_price = ?4))`)
        .bind(action.name, action.assetType, action.quantity, action.averagePrice, action.value, action.currentPrice, action.id, action.currentIncome, action.revision, action.subType, action.symbol, action.owner).run();
      if (!result.meta.changes) return reply({ error: 'Registro alterado ou saldo vinculado a transações. Atualize os dados; altere o saldo pelo histórico.' }, 409);
    } else if (operation === 'update') {
      const result = await db.prepare(`UPDATE finance_transactions SET
        asset_id = ?1, name = (SELECT name FROM finance_assets WHERE id = ?1),
        type = (SELECT type FROM finance_assets WHERE id = ?1), subtype = (SELECT subtype FROM finance_assets WHERE id = ?1), owner = ?7, quantity = ?2, value = ?3, transaction_date = ?6, revision = revision + 1
        WHERE id = ?4 AND revision = ?5 AND EXISTS (SELECT 1 FROM finance_assets WHERE id = ?1)`)
        .bind(action.assetId, action.quantity, action.value, action.id, action.revision, action.transactionDate, action.owner).run();
      if (!result.meta.changes) return reply({ error: 'Registro alterado, excluído ou ativo indisponível. Atualize os dados.' }, 409);
    } else if (action.type === 'asset') {
      await db.prepare(`INSERT INTO finance_assets (id, owner, name, type, quantity, average_price, value, current_price, current_income, subtype, symbol)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11) ON CONFLICT(id) DO NOTHING`)
        .bind(action.id, action.owner, action.name, action.assetType, action.quantity, action.averagePrice, action.value, action.currentPrice, action.currentIncome, action.subType, action.symbol).run();
    } else {
      // O INSERT e o trigger são atômicos: falha no saldo desfaz também a transação.
      // Nome e tipo vêm do ativo, nunca de campos livres enviados pelo cliente.
      const result = await db.prepare(`INSERT INTO finance_transactions (id, owner, asset_id, name, type, quantity, value, transaction_date, subtype)
        SELECT ?1, ?6, id, name, type, ?3, ?4, ?5, subtype FROM finance_assets WHERE id = ?2
        ON CONFLICT(id) DO NOTHING`).bind(action.id, action.assetId, action.quantity, action.value, action.transactionDate, action.owner).run();
      if (!result.meta.changes) {
        const existing = await db.prepare('SELECT id FROM finance_transactions WHERE id = ?1').bind(action.id).first();
        if (!existing) return reply({ error: 'Ativo não encontrado. Atualize os dados.' }, 400);
      }
    }
    return reply(await overview(db));
  } catch (error) {
    if (/FOREIGN KEY constraint/i.test(error.message)) return reply({ error: 'Este ativo possui transações. Exclua as transações vinculadas antes de excluir o ativo.' }, 409);
    if (/UNIQUE constraint/i.test(error.message)) return reply({ error: 'Já existe um ativo com esta sigla, nome, tipo e subtipo.' }, 409);
    if (/CHECK constraint/i.test(error.message)) return reply({ error: 'A operação excede os limites de quantidade, preço médio ou valor do ativo.' }, 400);
    console.error('Finance database error', error);
    return reply({ error: 'Não foi possível acessar Finanças. Verifique a conexão e se as migrações de Finanças até 0019 foram aplicadas no banco.' }, 503);
  }
}
