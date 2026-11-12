import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handleReminders } from '../reminders-api.mjs';
import { normalizeBrazilianWhatsApp, validateReminderAction } from '../reminders-model.mjs';

function database(){
  const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');sql.exec(readFileSync(new URL('../migrations/0032_reminders.sql',import.meta.url),'utf8'));
  sql.exec(readFileSync(new URL('../migrations/0035_reminder_title_responsible.sql',import.meta.url),'utf8'));
  sql.exec(readFileSync(new URL('../migrations/0036_reminder_description.sql',import.meta.url),'utf8'));
  sql.exec(readFileSync(new URL('../migrations/0037_reminder_responsible_label.sql',import.meta.url),'utf8'));
  sql.exec(readFileSync(new URL('../migrations/0038_reminder_flags.sql',import.meta.url),'utf8'));
  const prepare=query=>{let args=[];const statement=sql.prepare(query);return{isWrite:/^\s*(INSERT|UPDATE|DELETE)/i.test(query),bind(...values){args=values;return this;},async first(){return statement.get(...args)||null;},async run(){return{meta:{changes:statement.run(...args).changes}};},async all(){return{results:statement.all(...args)};}}};
  return{sql,prepare,async batch(statements){sql.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(statement.isWrite?await statement.run():await statement.all());sql.exec('COMMIT');return results;}catch(error){sql.exec('ROLLBACK');throw error;}}};
}
const env=()=>({CONTENT_DB:database(),ADMIN_PASSWORD:'pw',ALLOW_LEGACY_ADMIN_AUTH:'true'});
const request=body=>new Request('https://x/api/admin/reminders',{method:body?'POST':'GET',headers:{'Content-Type':'application/json','x-admin-password':'pw'},...(body?{body:JSON.stringify(body)}:{})});
const id=()=>crypto.randomUUID();

test('valida categoria, lembrete e telefone brasileiro',()=>{
  const category={type:'category',id:id(),name:' Saúde '};assert.equal(validateReminderAction(category).name,'Saúde');
  const reminder={type:'reminder',id:id(),title:'Documento',responsible:'Ale',description:'Consulta',categoryId:id(),resolutionDate:'2026-10-20'};assert.equal(validateReminderAction(reminder).description,'Consulta');
  assert.equal(normalizeBrazilianWhatsApp('(48) 99999-1234'),'5548999991234');assert.equal(normalizeBrazilianWhatsApp('+55 48 3333-1234'),'554833331234');
  assert.throws(()=>normalizeBrazilianWhatsApp('9999-1234'));assert.throws(()=>validateReminderAction({...reminder,resolutionDate:'2026-02-30'}));
});

test('cadastra, edita e exclui lembretes e categorias com revisão',async()=>{
  const e=env(),category={type:'category',id:id(),name:'Pessoal'};
  let response=await handleReminders(request(category),e);assert.equal(response.status,200);let data=await response.json();assert.equal(data.categories[0].name,'Pessoal');
  const reminder={type:'reminder',id:id(),title:'Documento',responsible:'Ale',description:'Renovar documento',categoryId:category.id,resolutionDate:'2026-11-10'};
  data=await(await handleReminders(request(reminder),e)).json();assert.equal(data.reminders[0].title,'Documento');assert.equal(data.reminders[0].responsible,'Ale');assert.equal(data.reminders[0].categoryName,'Pessoal');assert.equal(data.reminders[0].resolutionDate,'2026-11-10');
  data=await(await handleReminders(request({...reminder,operation:'update',revision:0,title:'Passaporte',responsible:'Ana',description:'Renovar passaporte'}),e)).json();assert.equal(data.reminders[0].description,'Renovar passaporte');assert.equal(data.reminders[0].revision,1);assert.equal(data.reminders[0].title,'Passaporte');assert.equal(data.reminders[0].responsible,'Ana');
  response=await handleReminders(request({type:'category',operation:'delete',id:category.id,revision:0}),e);assert.equal(response.status,409);
  data=await(await handleReminders(request({type:'reminder',operation:'delete',id:reminder.id,revision:1}),e)).json();assert.equal(data.reminders.length,0);
  data=await(await handleReminders(request({type:'category',operation:'delete',id:category.id,revision:0}),e)).json();assert.equal(data.categories.length,0);
});

test('API de lembretes exige autenticação',async()=>{assert.equal((await handleReminders(new Request('https://x/api/admin/reminders'),{CONTENT_DB:database()})).status,401);});

test('valida título de até 30 caracteres e opções de responsável',()=>{
 const action={type:'reminder',id:id(),title:'A'.repeat(30),responsible:'Ale/Ana',description:'Descrição',categoryId:id(),resolutionDate:'2026-11-10'};
 assert.equal(validateReminderAction(action).title.length,30);
 for(const responsible of ['Ale','Ana','Ale/Ana'])assert.equal(validateReminderAction({...action,responsible}).responsible,responsible);
 for(const title of ['', 'A'.repeat(31)])assert.throws(()=>validateReminderAction({...action,title}));
 assert.throws(()=>validateReminderAction({...action,responsible:'Outro'}));
});

test('importa eventos e tarefas paginados sem duplicar lembretes',async()=>{
  const { importGoogleDay }=await import('../reminders-google.mjs');
  const db=database();
  const fetcher=async url=>{
    let result;
    if(url.pathname.endsWith('/calendarList'))result={items:[{id:'me',primary:true},{id:'family',selected:true},{id:'ignored',selected:false}]};
    else if(url.pathname.includes('/events')){
      assert.equal(url.searchParams.get('timeMin'),'2026-11-10T00:00:00-03:00');
      assert.equal(url.searchParams.get('singleEvents'),'true');
      result={items:[{id:'event',summary:'Consulta',start:{date:'2026-11-10'}}]};
    }else if(url.pathname.endsWith('/users/@me/lists'))result={items:[{id:'tasks'}]};
    else result=url.searchParams.has('pageToken')?{items:[{id:'other-day',title:'Outra data',due:'2026-11-11T00:00:00Z'}]}:{items:[{id:'task',title:'Comprar medicamento',due:'2026-11-10T00:00:00Z'}],nextPageToken:'next'};
    return {ok:true,json:async()=>result};
  };
  const first=await importGoogleDay(db,'2026-11-10','token',fetcher);
  assert.equal(first.created.length,1);
  assert.equal(first.created[0].title,'AGENDA - 10/11/2026');
  assert.match(first.created[0].description,/Consulta/);
  assert.match(first.created[0].description,/Comprar medicamento/);
  assert.equal(first.created[0].description.split('\n').length,3);
  const second=await importGoogleDay(db,'2026-11-10','token',fetcher);
  assert.equal(second.created.length,0);assert.equal(second.existing,1);
  assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM reminders').get().n,1);
});

test('não grava importação se uma fonte Google falhar',async()=>{
  const { importGoogleDay }=await import('../reminders-google.mjs');const db=database();
  await assert.rejects(()=>importGoogleDay(db,'2026-11-10','token',async()=>({ok:false,status:403})),/403/);
  assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM reminders').get().n,0);
});

test('identifica API desativada e permissão ausente na importação Google',async()=>{
  const { readGoogleDay }=await import('../reminders-google.mjs');
  for(const [reason,expected] of [['SERVICE_DISABLED',/Ative a Google Calendar API/],['ACCESS_TOKEN_SCOPE_INSUFFICIENT',/autorize as duas permissões/]]){
    await assert.rejects(()=>readGoogleDay('2026-11-10','token',async()=>({ok:false,status:403,json:async()=>({error:{details:[{reason}]}})})),expected);
  }
});

 test('salva e edita prioridade e data opcional sem aceitar datas inválidas',async()=>{
 const e=env(),category={type:'category',id:id(),name:'Pessoal'};
 await handleReminders(request(category),e);
 const item={type:'reminder',id:id(),title:'Sem prazo',responsible:'Ale/Ana',description:'Resolver',categoryId:category.id,resolutionDate:'',noDateDefined:true,priority:true};
 let response=await handleReminders(request(item),e);assert.equal(response.status,200);
 let data=await response.json();assert.equal(data.reminders[0].resolutionDate,null);assert.equal(data.reminders[0].priority,1);assert.equal(data.reminders[0].noDateDefined,1);
 assert.equal((await handleReminders(request({...item,operation:'update',revision:0,noDateDefined:false}),e)).status,400);
 assert.equal((await handleReminders(request({...item,operation:'update',revision:0,resolutionDate:'2026-02-30'}),e)).status,400);
 response=await handleReminders(request({...item,operation:'update',revision:0,resolutionDate:'2026-11-12',noDateDefined:false,priority:false}),e);
 data=await response.json();assert.equal(data.reminders[0].resolutionDate,'2026-11-12');assert.equal(data.reminders[0].priority,0);assert.equal(data.reminders[0].noDateDefined,0);
 });
