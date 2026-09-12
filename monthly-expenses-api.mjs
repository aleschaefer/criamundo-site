import { requireAdminSession } from './admin-auth.mjs';
import { validateMonthlyExpenseAction } from './monthly-expenses-model.mjs';
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
async function overview(db){const [groups,expenses,entries,incomes]=await db.batch([
  db.prepare('SELECT id,name,revision FROM monthly_expense_groups ORDER BY name COLLATE NOCASE'),
  db.prepare(`SELECT e.id,e.owner,e.name,e.value,e.group_id AS groupId,g.name AS groupName,e.revision FROM monthly_expenses e JOIN monthly_expense_groups g ON g.id=e.group_id ORDER BY e.owner,e.name COLLATE NOCASE`),
  db.prepare('SELECT expense_id AS expenseId,month,year FROM monthly_expense_entries ORDER BY year DESC,month DESC'),
  db.prepare('SELECT id,owner,name,value,revision FROM monthly_incomes ORDER BY owner,name COLLATE NOCASE')
]);return{groups:groups.results,expenses:expenses.results,entries:entries.results,incomes:incomes.results};}
export async function handleMonthlyExpenses(request,env){
  if(!await requireAdminSession(request,env))return reply({error:'Sessão inválida. Entre novamente.'},401);
  if(!['GET','POST'].includes(request.method))return reply({error:'Método não permitido.'},405);
  if(!env.CONTENT_DB)return reply({error:'Banco de dados não configurado.'},503);
  try{
    const db=env.CONTENT_DB;if(request.method==='GET')return reply(await overview(db));
    let action;try{action=validateMonthlyExpenseAction(await request.json());}catch(error){return reply({error:error.message},400);}
    if(action.type==='delete-all-expenses')await db.prepare('DELETE FROM monthly_expenses').run();
    else if(action.type==='delete-all-incomes')await db.prepare('DELETE FROM monthly_incomes').run();
    else if(action.type==='group')await db.prepare('INSERT INTO monthly_expense_groups(id,name) VALUES(?1,?2) ON CONFLICT(id) DO NOTHING').bind(action.id,action.name).run();
    else if(action.type==='expense'){
      const result=await db.prepare(`INSERT INTO monthly_expenses(id,owner,name,value,group_id) SELECT ?1,?2,?3,?4,id FROM monthly_expense_groups WHERE id=?5 ON CONFLICT(id) DO NOTHING`).bind(action.id,action.owner,action.name,action.value,action.groupId).run();
      if(!result.meta.changes)return reply({error:'Grupo não encontrado ou gasto já incluído.'},409);
    }else if(action.type==='income'){
      await db.prepare('INSERT INTO monthly_incomes(id,owner,name,value) VALUES(?1,?2,?3,?4) ON CONFLICT(id) DO NOTHING').bind(action.id,action.owner,action.name,action.value).run();
    }else{
      const statements=[db.prepare('DELETE FROM monthly_expense_entries WHERE month=?1 AND year=?2').bind(action.month,action.year),...action.expenseIds.map(expenseId=>db.prepare('INSERT INTO monthly_expense_entries(expense_id,month,year) SELECT id,?2,?3 FROM monthly_expenses WHERE id=?1').bind(expenseId,action.month,action.year))];
      await db.batch(statements);
    }
    return reply(await overview(db));
  }catch(error){
    if(/UNIQUE constraint/i.test(error.message))return reply({error:'Já existe um grupo com esse nome.'},409);
    if(/FOREIGN KEY|CHECK constraint/i.test(error.message))return reply({error:'Os dados não atendem às regras de Gastos Mensais.'},400);
    console.error('Monthly expenses database error',error);return reply({error:'Não foi possível acessar Gastos Mensais. Aplique as migrações 0024 e 0025.'},503);
  }
}
