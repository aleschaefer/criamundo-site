import { requireAdminSession } from './admin-auth.mjs';
import { validateMonthlyExpenseAction } from './monthly-expenses-model.mjs';
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
async function overview(db){const [groups,expenses,entries,incomes]=await db.batch([
  db.prepare('SELECT id,name,revision FROM monthly_expense_groups ORDER BY name COLLATE NOCASE'),
  db.prepare(`SELECT e.id,e.owner,e.name,e.value,e.group_id AS groupId,g.name AS groupName,e.payment_date AS paymentDate,e.settled,e.revision FROM monthly_expenses e JOIN monthly_expense_groups g ON g.id=e.group_id ORDER BY e.owner,e.name COLLATE NOCASE`),
  db.prepare('SELECT expense_id AS expenseId,month,year,settled,disregarded FROM monthly_expense_entries ORDER BY year DESC,month DESC'),
  db.prepare('SELECT id,owner,name,value,month,year,revision FROM monthly_incomes ORDER BY year DESC,month DESC,owner,name COLLATE NOCASE')
]);return{groups:groups.results,expenses:expenses.results,entries:entries.results,incomes:incomes.results};}
export async function handleMonthlyExpenses(request,env){
  if(!await requireAdminSession(request,env))return reply({error:'Sessão inválida. Entre novamente.'},401);
  if(!['GET','POST'].includes(request.method))return reply({error:'Método não permitido.'},405);
  if(!env.CONTENT_DB)return reply({error:'Banco de dados não configurado.'},503);
  try{
    const db=env.CONTENT_DB;if(request.method==='GET')return reply(await overview(db));
    let action;try{action=validateMonthlyExpenseAction(await request.json());}catch(error){return reply({error:error.message},400);}
    if(action.operation==='delete'){
      const table={group:'monthly_expense_groups',expense:'monthly_expenses',income:'monthly_incomes'}[action.type],result=await db.prepare(`DELETE FROM ${table} WHERE id=?1 AND revision=?2`).bind(action.id,action.revision).run();
      if(!result.meta.changes)return reply({error:'Registro alterado ou excluído. Atualize os dados.'},409);
    }else if(action.operation==='update'){
      let statement;if(action.type==='group')statement=db.prepare('UPDATE monthly_expense_groups SET name=?1,revision=revision+1 WHERE id=?2 AND revision=?3').bind(action.name,action.id,action.revision);
      else if(action.type==='expense')statement=db.prepare('UPDATE monthly_expenses SET owner=?1,name=?2,value=?3,group_id=?4,payment_date=?5,revision=revision+1 WHERE id=?6 AND revision=?7').bind(action.owner,action.name,action.value,action.groupId,action.paymentDate,action.id,action.revision);
      else statement=db.prepare('UPDATE monthly_incomes SET owner=?1,name=?2,value=?3,month=?4,year=?5,revision=revision+1 WHERE id=?6 AND revision=?7').bind(action.owner,action.name,action.value,action.month,action.year,action.id,action.revision);
      const result=await statement.run();if(!result.meta.changes)return reply({error:'Registro alterado ou excluído. Atualize os dados.'},409);
    }else if(action.type==='delete-all-expenses')await db.prepare('DELETE FROM monthly_expenses').run();
    else if(action.type==='delete-all-incomes')await db.prepare('DELETE FROM monthly_incomes').run();
    else if(action.type==='group')await db.prepare('INSERT INTO monthly_expense_groups(id,name) VALUES(?1,?2) ON CONFLICT(id) DO NOTHING').bind(action.id,action.name).run();
    else if(action.type==='expense'){
      const result=await db.prepare(`INSERT INTO monthly_expenses(id,owner,name,value,group_id,payment_date) SELECT ?1,?2,?3,?4,id,?6 FROM monthly_expense_groups WHERE id=?5 ON CONFLICT(id) DO NOTHING`).bind(action.id,action.owner,action.name,action.value,action.groupId,action.paymentDate).run();
      if(!result.meta.changes)return reply({error:'Grupo não encontrado ou gasto já incluído.'},409);
    }else if(action.type==='income'){
      await db.prepare('INSERT INTO monthly_incomes(id,owner,name,value,month,year) VALUES(?1,?2,?3,?4,?5,?6) ON CONFLICT(id) DO NOTHING').bind(action.id,action.owner,action.name,action.value,action.month,action.year).run();
    }else if(action.type==='settlement'){
      const result=await db.prepare('INSERT INTO monthly_expense_entries(expense_id,month,year,settled) SELECT id,?2,?3,?4 FROM monthly_expenses WHERE id=?1 ON CONFLICT(expense_id,month,year) DO UPDATE SET settled=excluded.settled').bind(action.expenseId,action.month,action.year,action.settled?1:0).run();
      if(!result.meta.changes)return reply({error:'Gasto não encontrado.'},404);
    }else if(action.type==='consideration'){
      const result=await db.prepare('INSERT INTO monthly_expense_entries(expense_id,month,year,disregarded) SELECT id,?2,?3,?4 FROM monthly_expenses WHERE id=?1 ON CONFLICT(expense_id,month,year) DO UPDATE SET disregarded=excluded.disregarded').bind(action.expenseId,action.month,action.year,action.disregarded?1:0).run();
      if(!result.meta.changes)return reply({error:'Gasto não encontrado.'},404);
    }else{
      const statements=[db.prepare('DELETE FROM monthly_expense_entries WHERE month=?1 AND year=?2 AND expense_id NOT IN (SELECT value FROM json_each(?3))').bind(action.month,action.year,JSON.stringify(action.expenseIds)),...action.expenseIds.map(expenseId=>db.prepare('INSERT INTO monthly_expense_entries(expense_id,month,year) SELECT id,?2,?3 FROM monthly_expenses WHERE id=?1 ON CONFLICT(expense_id,month,year) DO NOTHING').bind(expenseId,action.month,action.year))];
      await db.batch(statements);
    }
    return reply(await overview(db));
  }catch(error){
    if(/UNIQUE constraint/i.test(error.message))return reply({error:'Já existe um grupo com esse nome.'},409);
    if(/FOREIGN KEY constraint/i.test(error.message))return reply({error:'Este grupo está sendo usado por gastos e não pode ser excluído.'},409);
    if(/CHECK constraint/i.test(error.message))return reply({error:'Os dados não atendem às regras de Gastos Mensais.'},400);
    console.error('Monthly expenses database error',error);return reply({error:'Não foi possível acessar Gastos Mensais. Aplique as migrações até 0029.'},503);
  }
}
