import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handleReminders } from '../reminders-api.mjs';
import { normalizeBrazilianWhatsApp, validateReminderAction } from '../reminders-model.mjs';

function database(){
  const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');sql.exec(readFileSync(new URL('../migrations/0032_reminders.sql',import.meta.url),'utf8'));
  const prepare=query=>{let args=[];const statement=sql.prepare(query);return{isWrite:/^\s*(INSERT|UPDATE|DELETE)/i.test(query),bind(...values){args=values;return this;},async first(){return statement.get(...args)||null;},async run(){return{meta:{changes:statement.run(...args).changes}};},async all(){return{results:statement.all(...args)};}}};
  return{sql,prepare,async batch(statements){sql.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(statement.isWrite?await statement.run():await statement.all());sql.exec('COMMIT');return results;}catch(error){sql.exec('ROLLBACK');throw error;}}};
}
const env=()=>({CONTENT_DB:database(),ADMIN_PASSWORD:'pw',ALLOW_LEGACY_ADMIN_AUTH:'true'});
const request=body=>new Request('https://x/api/admin/reminders',{method:body?'POST':'GET',headers:{'Content-Type':'application/json','x-admin-password':'pw'},...(body?{body:JSON.stringify(body)}:{})});
const id=()=>crypto.randomUUID();

test('valida categoria, lembrete e telefone brasileiro',()=>{
  const category={type:'category',id:id(),name:' Saúde '};assert.equal(validateReminderAction(category).name,'Saúde');
  const reminder={type:'reminder',id:id(),description:'Consulta',categoryId:id(),resolutionDate:'2026-10-20'};assert.equal(validateReminderAction(reminder).description,'Consulta');
  assert.equal(normalizeBrazilianWhatsApp('(48) 99999-1234'),'5548999991234');assert.equal(normalizeBrazilianWhatsApp('+55 48 3333-1234'),'554833331234');
  assert.throws(()=>normalizeBrazilianWhatsApp('9999-1234'));assert.throws(()=>validateReminderAction({...reminder,resolutionDate:'2026-02-30'}));
});

test('cadastra, edita e exclui lembretes e categorias com revisão',async()=>{
  const e=env(),category={type:'category',id:id(),name:'Pessoal'};
  let response=await handleReminders(request(category),e);assert.equal(response.status,200);let data=await response.json();assert.equal(data.categories[0].name,'Pessoal');
  const reminder={type:'reminder',id:id(),description:'Renovar documento',categoryId:category.id,resolutionDate:'2026-11-10'};
  data=await(await handleReminders(request(reminder),e)).json();assert.equal(data.reminders[0].categoryName,'Pessoal');assert.equal(data.reminders[0].resolutionDate,'2026-11-10');
  data=await(await handleReminders(request({...reminder,operation:'update',revision:0,description:'Renovar passaporte'}),e)).json();assert.equal(data.reminders[0].description,'Renovar passaporte');assert.equal(data.reminders[0].revision,1);
  response=await handleReminders(request({type:'category',operation:'delete',id:category.id,revision:0}),e);assert.equal(response.status,409);
  data=await(await handleReminders(request({type:'reminder',operation:'delete',id:reminder.id,revision:1}),e)).json();assert.equal(data.reminders.length,0);
  data=await(await handleReminders(request({type:'category',operation:'delete',id:category.id,revision:0}),e)).json();assert.equal(data.categories.length,0);
});

test('API de lembretes exige autenticação',async()=>{assert.equal((await handleReminders(new Request('https://x/api/admin/reminders'),{CONTENT_DB:database()})).status,401);});
