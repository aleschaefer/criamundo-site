import { requireAdminSession } from './admin-auth.mjs';
import { validateMarketAction } from './market-model.mjs';
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
async function overview(db){
  const [categories,items,lists,listItems]=await db.batch([
    db.prepare('SELECT id,name,revision FROM market_categories ORDER BY name COLLATE NOCASE'),
    db.prepare(`SELECT i.id,i.name,i.quantity,i.category_id AS categoryId,c.name AS categoryName,i.approximate_value AS approximateValue,i.revision FROM market_items i JOIN market_categories c ON c.id=i.category_id ORDER BY c.name COLLATE NOCASE,i.name COLLATE NOCASE`),
    db.prepare('SELECT id,list_date AS listDate,revision FROM market_lists ORDER BY list_date DESC,created_at DESC'),
    db.prepare('SELECT list_id AS listId,item_id AS itemId FROM market_list_items ORDER BY list_id,item_id')
  ]);return{categories:categories.results,items:items.results,lists:lists.results.map(list=>({...list,itemIds:listItems.results.filter(row=>row.listId===list.id).map(row=>row.itemId)}))};
}
export async function handleMarket(request,env){
  if(!await requireAdminSession(request,env))return reply({error:'Sessão inválida. Entre novamente.'},401);
  if(!['GET','POST'].includes(request.method))return reply({error:'Método não permitido.'},405);
  if(!env.CONTENT_DB)return reply({error:'Banco de dados não configurado.'},503);
  try{
    const db=env.CONTENT_DB;if(request.method==='GET')return reply(await overview(db));let action;try{action=validateMarketAction(await request.json());}catch(error){return reply({error:error.message},400);}
    if(action.operation==='delete'){
      const table={category:'market_categories',item:'market_items',list:'market_lists'}[action.type],result=await db.prepare(`DELETE FROM ${table} WHERE id=?1 AND revision=?2`).bind(action.id,action.revision).run();if(!result.meta.changes)return reply({error:'Registro alterado ou excluído. Atualize os dados.'},409);
    }else if(action.type==='list'){
      if(action.operation==='update'){
        const exists=await db.prepare('SELECT id FROM market_lists WHERE id=?1 AND revision=?2').bind(action.id,action.revision).first();if(!exists)return reply({error:'Lista alterada ou excluída. Atualize os dados.'},409);
      }
      const placeholders=action.itemIds.map((_,index)=>`?${index+1}`).join(','),found=await db.prepare(`SELECT COUNT(*) AS total FROM market_items WHERE id IN (${placeholders})`).bind(...action.itemIds).first();if(Number(found?.total)!==action.itemIds.length)return reply({error:'Um ou mais itens não existem mais. Atualize os dados.'},409);
      const statements=action.operation==='update'
        ?[db.prepare("UPDATE market_lists SET list_date=?1,revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?2 AND revision=?3").bind(action.listDate,action.id,action.revision),db.prepare('DELETE FROM market_list_items WHERE list_id=?1').bind(action.id)]
        :[db.prepare('INSERT INTO market_lists(id,list_date) VALUES(?1,?2)').bind(action.id,action.listDate)];
      statements.push(...action.itemIds.map(itemId=>db.prepare('INSERT INTO market_list_items(list_id,item_id) VALUES(?1,?2)').bind(action.id,itemId)));await db.batch(statements);
    }else if(action.operation==='update'){
      const statement=action.type==='category'
        ?db.prepare('UPDATE market_categories SET name=?1,revision=revision+1 WHERE id=?2 AND revision=?3').bind(action.name,action.id,action.revision)
        :db.prepare('UPDATE market_items SET name=?1,quantity=?2,category_id=?3,approximate_value=?4,revision=revision+1 WHERE id=?5 AND revision=?6').bind(action.name,action.quantity,action.categoryId,action.approximateValue,action.id,action.revision);
      const result=await statement.run();if(!result.meta.changes)return reply({error:'Registro alterado ou excluído. Atualize os dados.'},409);
    }else if(action.type==='category')await db.prepare('INSERT INTO market_categories(id,name) VALUES(?1,?2)').bind(action.id,action.name).run();
    else{const result=await db.prepare('INSERT INTO market_items(id,name,quantity,category_id,approximate_value) SELECT ?1,?2,?3,id,?5 FROM market_categories WHERE id=?4').bind(action.id,action.name,action.quantity,action.categoryId,action.approximateValue).run();if(!result.meta.changes)return reply({error:'Categoria não encontrada.'},409);}
    return reply(await overview(db));
  }catch(error){
    if(/UNIQUE constraint/i.test(error.message))return reply({error:'Já existe um registro igual nesta categoria.'},409);
    if(/FOREIGN KEY constraint/i.test(error.message))return reply({error:'O registro está sendo utilizado e não pode ser excluído.'},409);
    if(/CHECK constraint/i.test(error.message))return reply({error:'Os dados não atendem às regras do Mercado.'},400);
    console.error('Market database error',error);return reply({error:'Não foi possível acessar Mercado. Aplique a migração 0033.'},503);
  }
}
