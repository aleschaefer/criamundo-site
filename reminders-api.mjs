import { requireAdminSession } from './admin-auth.mjs';
import { validateReminderAction } from './reminders-model.mjs';

const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
async function overview(db){
  const [categories,reminders]=await db.batch([
    db.prepare('SELECT id,name,revision FROM reminder_categories ORDER BY name COLLATE NOCASE'),
    db.prepare(`SELECT r.id,r.description,r.category_id AS categoryId,c.name AS categoryName,
      r.resolution_date AS resolutionDate,r.revision
      FROM reminders r JOIN reminder_categories c ON c.id=r.category_id
      ORDER BY r.resolution_date,r.description COLLATE NOCASE`)
  ]);
  return{categories:categories.results,reminders:reminders.results};
}

export async function handleReminders(request,env){
  if(!await requireAdminSession(request,env))return reply({error:'Sessão inválida. Entre novamente.'},401);
  if(!['GET','POST'].includes(request.method))return reply({error:'Método não permitido.'},405);
  if(!env.CONTENT_DB)return reply({error:'Banco de dados não configurado.'},503);
  try{
    const db=env.CONTENT_DB;if(request.method==='GET')return reply(await overview(db));
    let action;try{action=validateReminderAction(await request.json());}catch(error){return reply({error:error.message},400);}
    if(action.operation==='delete'){
      const table=action.type==='category'?'reminder_categories':'reminders';
      const result=await db.prepare(`DELETE FROM ${table} WHERE id=?1 AND revision=?2`).bind(action.id,action.revision).run();
      if(!result.meta.changes)return reply({error:'Registro alterado ou excluído. Atualize os dados.'},409);
    }else if(action.operation==='update'){
      const statement=action.type==='category'
        ?db.prepare('UPDATE reminder_categories SET name=?1,revision=revision+1 WHERE id=?2 AND revision=?3').bind(action.name,action.id,action.revision)
        :db.prepare("UPDATE reminders SET description=?1,category_id=?2,resolution_date=?3,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),revision=revision+1 WHERE id=?4 AND revision=?5").bind(action.description,action.categoryId,action.resolutionDate,action.id,action.revision);
      const result=await statement.run();if(!result.meta.changes)return reply({error:'Registro alterado ou excluído. Atualize os dados.'},409);
    }else if(action.type==='category'){
      await db.prepare('INSERT INTO reminder_categories(id,name) VALUES(?1,?2) ON CONFLICT(id) DO NOTHING').bind(action.id,action.name).run();
    }else{
      const result=await db.prepare('INSERT INTO reminders(id,description,category_id,resolution_date) SELECT ?1,?2,id,?4 FROM reminder_categories WHERE id=?3 ON CONFLICT(id) DO NOTHING').bind(action.id,action.description,action.categoryId,action.resolutionDate).run();
      if(!result.meta.changes)return reply({error:'Categoria não encontrada ou lembrete já cadastrado.'},409);
    }
    return reply(await overview(db));
  }catch(error){
    if(/UNIQUE constraint/i.test(error.message))return reply({error:'Já existe uma categoria com esse nome.'},409);
    if(/FOREIGN KEY constraint/i.test(error.message))return reply({error:'A categoria possui lembretes e não pode ser excluída.'},409);
    if(/CHECK constraint/i.test(error.message))return reply({error:'Os dados não atendem às regras de Lembretes.'},400);
    console.error('Reminders database error',error);return reply({error:'Não foi possível acessar Lembretes. Aplique a migração 0032.'},503);
  }
}
