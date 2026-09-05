import { validateCreditAction, expandInstallments } from './credit-card-model.mjs';
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
async function overview(db) {
  const [groups, periods, transactions] = await db.batch([
    db.prepare('SELECT id, name, revision FROM credit_card_groups ORDER BY name COLLATE NOCASE'),
    db.prepare('SELECT id, month, year, start_date AS startDate, end_date AS endDate, revision FROM credit_card_periods ORDER BY year DESC, month DESC'),
    db.prepare(`SELECT t.id, t.series_id AS seriesId, t.transaction_date AS transactionDate, t.name, t.value,
      t.group_id AS groupId, g.name AS groupName, t.payment, t.installment_number AS installmentNumber,
      t.installment_count AS installmentCount, t.period_id AS periodId
      FROM credit_card_transactions t JOIN credit_card_groups g ON g.id=t.group_id
      ORDER BY t.transaction_date DESC, t.created_at DESC`)
  ]);
  return { groups: groups.results, periods: periods.results, transactions: transactions.results };
}
export async function handleCreditCard(request, env) {
  if (!env.ADMIN_PASSWORD) return reply({ error: 'Acesso administrativo não configurado.' }, 503);
  if (request.headers.get('x-admin-password') !== env.ADMIN_PASSWORD) return reply({ error: 'Sessão inválida. Entre novamente.' }, 401);
  if (!['GET', 'POST'].includes(request.method)) return reply({ error: 'Método não permitido.' }, 405);
  if (!env.CONTENT_DB) return reply({ error: 'Banco de dados não configurado.' }, 503);
  let action;
  try {
    if (request.method === 'GET') return reply(await overview(env.CONTENT_DB));
    try { action = validateCreditAction(await request.json()); } catch (error) { return reply({ error: error.message }, 400); }
    const db = env.CONTENT_DB;
    if (action.operation === 'update' && action.type === 'group') {
      const result = await db.prepare('UPDATE credit_card_groups SET name=?1,name_key=?2,revision=revision+1 WHERE id=?3 AND revision=?4').bind(action.name,action.nameKey,action.id,action.revision).run();
      if (!result.meta.changes) return reply({ error: 'Grupo alterado ou excluído. Atualize os dados.' }, 409);
    } else if (action.operation === 'update' && action.type === 'period') {
      const result = await db.prepare('UPDATE credit_card_periods SET month=?1,year=?2,start_date=?3,end_date=?4,revision=revision+1 WHERE id=?5 AND revision=?6').bind(action.month,action.year,action.startDate,action.endDate,action.id,action.revision).run();
      if (!result.meta.changes) return reply({ error: 'Período alterado ou excluído. Atualize os dados.' }, 409);
    } else if (action.type === 'group') {
      await db.prepare('INSERT INTO credit_card_groups (id,name,name_key) VALUES (?1,?2,?3) ON CONFLICT(id) DO NOTHING').bind(action.id, action.name, action.nameKey).run();
    } else if (action.type === 'period') {
      await db.prepare('INSERT INTO credit_card_periods (id,month,year,start_date,end_date) VALUES (?1,?2,?3,?4,?5) ON CONFLICT(id) DO NOTHING').bind(action.id, action.month, action.year, action.startDate, action.endDate).run();
    } else {
      const installments = expandInstallments(action);
      const statements = installments.map(item => db.prepare(`INSERT INTO credit_card_transactions
        (id,series_id,transaction_date,name,value,group_id,payment,installment_number,installment_count)
        SELECT ?1,?2,?3,?4,?5,id,?7,?8,?9 FROM credit_card_groups WHERE id=?6
        ON CONFLICT(series_id, installment_number) DO NOTHING`)
        .bind(item.id,item.seriesId,item.transactionDate,item.name,item.value,item.groupId,item.payment,item.installmentNumber,item.installmentCount));
      const results = await db.batch(statements);
      if (!results.some(result => result.meta.changes)) return reply({ error: 'Grupo não encontrado ou transação já incluída.' }, 409);
    }
    return reply(await overview(db));
  } catch (error) {
    if (/UNIQUE constraint/i.test(error.message)) return reply({ error: action?.type === 'period' ? 'Já existe uma fatura para esse mês/ano.' : 'Já existe um grupo com esse nome.' }, 409);
    if (/sobrepõe/i.test(error.message)) return reply({ error: 'Este período sobrepõe as datas de outra fatura.' }, 409);
    if (/FOREIGN KEY|CHECK constraint/i.test(error.message)) return reply({ error: 'Os dados não atendem às regras de Cartão de Crédito.' }, 400);
    console.error('Credit card database error', error);
    return reply({ error: 'Não foi possível acessar Cartão de Crédito. Aplique a migração 0009.' }, 503);
  }
}
