import { validateCreditAction, expandInstallments } from './credit-card-model.mjs';
import { validateImportAction, normalizeImportText } from './credit-card-import-model.mjs';
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
async function overview(db) {
  const [groups, periods, transactions, imports] = await db.batch([
    db.prepare('SELECT id, name, revision FROM credit_card_groups ORDER BY name COLLATE NOCASE'),
    db.prepare('SELECT id, month, year, start_date AS startDate, end_date AS endDate, revision FROM credit_card_periods ORDER BY year DESC, month DESC'),
    db.prepare(`SELECT t.id, t.series_id AS seriesId, t.transaction_date AS transactionDate,
      COALESCE(m.purchase_date,t.transaction_date) AS purchaseDate, COALESCE(m.is_projected,0) AS isProjected, t.name, t.value,
      t.group_id AS groupId, g.name AS groupName, t.payment, t.installment_number AS installmentNumber,
      t.installment_count AS installmentCount, t.period_id AS periodId, t.created_at AS createdAt,
      COALESCE(t.updated_at,t.created_at) AS updatedAt, t.revision
      FROM credit_card_transactions t JOIN credit_card_groups g ON g.id=t.group_id
      LEFT JOIN credit_card_transaction_meta m ON m.transaction_id=t.id
      WHERE t.deleted_at IS NULL
      ORDER BY t.created_at DESC, t.transaction_date DESC, t.id DESC`)
    ,db.prepare(`SELECT i.id, i.file_name AS fileName, i.period_id AS periodId, i.item_count AS itemCount,
      i.created_at AS createdAt FROM credit_card_imports i ORDER BY i.created_at DESC LIMIT 20`)
  ]);
  return { groups: groups.results, periods: periods.results, transactions: transactions.results, imports: imports.results };
}

const addMonthsClamped = (date, months) => {
  const [year, month, day] = date.split('-').map(Number), index = year * 12 + month - 1 + months;
  const nextYear = Math.floor(index / 12), nextMonth = index % 12 + 1;
  const lastDay = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate();
  return `${String(nextYear).padStart(4,'0')}-${String(nextMonth).padStart(2,'0')}-${String(Math.min(day,lastDay)).padStart(2,'0')}`;
};
const hexDigest = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
const seriesName = name => normalizeImportText(name).replace(/\bPARC\s*\d{1,3}\s*\/\s*\d{1,3}\b/ig,'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');

async function importTransactions(db, action) {
  const period = await db.prepare('SELECT id,month,year,end_date AS endDate FROM credit_card_periods WHERE id=?1').bind(action.periodId).first();
  if (!period) return reply({ error: 'A fatura selecionada não existe mais. Atualize os dados.' }, 409);
  const keys = await Promise.all(action.items.map(item => hexDigest(`${seriesName(item.name)}|${item.purchaseDate}|${item.value.toFixed(2)}|${item.installmentCount}`)));
  const matches = await db.batch(action.items.map((item,index)=>db.prepare(`SELECT t.id,t.series_id AS seriesId FROM credit_card_transactions t
    JOIN credit_card_transaction_meta m ON m.transaction_id=t.id
    WHERE m.source_series_key=?1 AND m.is_projected=1 AND t.deleted_at IS NULL AND t.installment_number=?2 LIMIT 1`).bind(keys[index],item.currentInstallment)));
  const statements = [db.prepare(`INSERT INTO credit_card_imports(id,file_hash,file_name,period_id,item_count)
    VALUES(?1,?2,?3,?4,?5)`).bind(action.id,action.fileHash,action.fileName,action.periodId,action.items.length)];
  action.items.forEach((item,index)=>{
    const projected = matches[index].results[0];
    const transactionId = projected?.id || item.id, seriesId = projected?.seriesId || item.id;
    if (projected) {
      statements.push(db.prepare(`UPDATE credit_card_transactions SET transaction_date=?1,name=?2,value=?3,group_id=?4,payment=?5,
        installment_number=?6,installment_count=?7,period_id=?8,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),revision=revision+1
        WHERE id=?9`).bind(period.endDate,item.name,item.value,item.groupId,item.payment,item.currentInstallment,item.installmentCount,action.periodId,transactionId));
    } else {
      statements.push(db.prepare(`INSERT INTO credit_card_transactions
        (id,series_id,transaction_date,name,value,group_id,payment,installment_number,installment_count,period_id)
        SELECT ?1,?2,?3,?4,?5,id,?7,?8,?9,?10 FROM credit_card_groups WHERE id=?6`)
        .bind(transactionId,seriesId,period.endDate,item.name,item.value,item.groupId,item.payment,item.currentInstallment,item.installmentCount,action.periodId));
    }
    statements.push(db.prepare(`INSERT INTO credit_card_import_items
      (id,import_id,page_number,row_number,purchase_date,raw_name,value,confidence,transaction_id)
      VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)`).bind(item.id,action.id,item.page,item.row,item.purchaseDate,item.name,item.value,item.confidence,transactionId));
    if (projected) {
      statements.push(db.prepare(`UPDATE credit_card_transaction_meta SET purchase_date=?1,source_import_item_id=?2,is_projected=0,billing_month=?3,billing_year=?4 WHERE transaction_id=?5`)
        .bind(item.purchaseDate,item.id,period.month,period.year,transactionId));
    } else {
      statements.push(db.prepare(`INSERT INTO credit_card_transaction_meta(transaction_id,purchase_date,source_series_key,source_import_item_id,is_projected,billing_month,billing_year)
        VALUES(?1,?2,?3,?4,0,?5,?6)`).bind(transactionId,item.purchaseDate,keys[index],item.id,period.month,period.year));
      const billingAnchor=`${period.year}-${String(period.month).padStart(2,'0')}-01`;
      for(let offset=1;offset<=item.installmentCount-item.currentInstallment;offset++){
        const futureId=crypto.randomUUID(),futureDate=addMonthsClamped(billingAnchor,offset),[futureYear,futureMonth]=futureDate.split('-').map(Number);
        statements.push(db.prepare(`INSERT INTO credit_card_transactions
          (id,series_id,transaction_date,name,value,group_id,payment,installment_number,installment_count)
          SELECT ?1,?2,?3,?4,?5,id,2,?7,?8 FROM credit_card_groups WHERE id=?6`)
          .bind(futureId,seriesId,futureDate,item.name,item.value,item.groupId,item.currentInstallment+offset,item.installmentCount));
        statements.push(db.prepare(`INSERT INTO credit_card_transaction_meta(transaction_id,purchase_date,source_series_key,is_projected,billing_month,billing_year)
          VALUES(?1,?2,?3,1,?4,?5)`).bind(futureId,item.purchaseDate,keys[index],futureMonth,futureYear));
        statements.push(db.prepare(`UPDATE credit_card_transactions SET period_id=(
          SELECT id FROM credit_card_periods WHERE month=?1 AND year=?2 LIMIT 1
        ) WHERE id=?3`).bind(futureMonth,futureYear,futureId));
      }
    }
  });
  await db.batch(statements);
  return reply(await overview(db));
}
export async function handleCreditCard(request, env) {
  if (!env.ADMIN_PASSWORD) return reply({ error: 'Acesso administrativo não configurado.' }, 503);
  if (request.headers.get('x-admin-password') !== env.ADMIN_PASSWORD) return reply({ error: 'Sessão inválida. Entre novamente.' }, 401);
  if (!['GET', 'POST'].includes(request.method)) return reply({ error: 'Método não permitido.' }, 405);
  if (!env.CONTENT_DB) return reply({ error: 'Banco de dados não configurado.' }, 503);
  let action;
  try {
    if (request.method === 'GET') return reply(await overview(env.CONTENT_DB));
    try { const body=await request.json(); action=body?.type==='import'?validateImportAction(body):validateCreditAction(body); } catch (error) { return reply({ error: error.message }, 400); }
    const db = env.CONTENT_DB;
    if (action.type === 'import') return await importTransactions(db,action);
    if (action.type === 'transaction' && action.operation === 'delete-all') {
      await db.prepare(`UPDATE credit_card_transactions SET deleted_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
        updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),revision=revision+1 WHERE deleted_at IS NULL`).run();
    } else if (action.type === 'transaction' && action.operation === 'delete') {
      const result=await db.prepare(`UPDATE credit_card_transactions SET deleted_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
        updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),revision=revision+1 WHERE id=?1 AND revision=?2 AND deleted_at IS NULL`).bind(action.id,action.revision).run();
      if(!result.meta.changes)return reply({error:'Transação alterada ou excluída. Atualize os dados.'},409);
    } else if (action.type === 'transaction' && action.operation === 'update') {
      const meta=await db.prepare('SELECT transaction_id FROM credit_card_transaction_meta WHERE transaction_id=?1').bind(action.id).first();
      const transactionSql=meta
        ? `UPDATE credit_card_transactions SET name=?1,value=?2,group_id=?3,payment=?4,installment_number=?5,installment_count=?6,
           updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),revision=revision+1 WHERE id=?7 AND revision=?8 AND deleted_at IS NULL`
        : `UPDATE credit_card_transactions SET transaction_date=?9,name=?1,value=?2,group_id=?3,payment=?4,installment_number=?5,installment_count=?6,
           period_id=(SELECT id FROM credit_card_periods WHERE ?9 BETWEEN start_date AND end_date LIMIT 1),
           updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),revision=revision+1 WHERE id=?7 AND revision=?8 AND deleted_at IS NULL`;
      const statement=db.prepare(transactionSql);
      const result=await (meta
        ? statement.bind(action.name,action.value,action.groupId,action.payment,action.currentInstallment,action.installmentCount,action.id,action.revision)
        : statement.bind(action.name,action.value,action.groupId,action.payment,action.currentInstallment,action.installmentCount,action.id,action.revision,action.transactionDate)).run();
      if(!result.meta.changes)return reply({error:'Transação alterada ou excluída. Atualize os dados.'},409);
      if(meta)await db.prepare('UPDATE credit_card_transaction_meta SET purchase_date=?1 WHERE transaction_id=?2').bind(action.transactionDate,action.id).run();
    } else if (action.operation === 'update' && action.type === 'group') {
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
    if (/UNIQUE constraint/i.test(error.message)) return reply({ error: action?.type === 'period' ? 'Já existe uma fatura para esse mês/ano.' : action?.type === 'import' ? 'Este PDF ou uma de suas linhas já foi importado.' : action?.type === 'transaction' ? 'Já existe uma parcela com este número na mesma compra.' : 'Já existe um grupo com esse nome.' }, 409);
    if (/sobrepõe/i.test(error.message)) return reply({ error: 'Este período sobrepõe as datas de outra fatura.' }, 409);
    if (/FOREIGN KEY|CHECK constraint/i.test(error.message)) return reply({ error: 'Os dados não atendem às regras de Cartão de Crédito.' }, 400);
    console.error('Credit card database error', error);
    return reply({ error: 'Não foi possível acessar Cartão de Crédito. Aplique as migrações até 0014.' }, 503);
  }
}
