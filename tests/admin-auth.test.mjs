import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handleAdminAuthentication, requireAdminSession } from '../admin-auth.mjs';

function database(){
  const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');sql.exec(readFileSync(new URL('../migrations/0016_admin_passkey_auth.sql',import.meta.url),'utf8'));
  const prepare=query=>{let args=[];const statement=sql.prepare(query);return{isWrite:/^\s*(INSERT|UPDATE|DELETE)/i.test(query),bind(...values){args=values;return this},async first(){return statement.get(...args)||null},async run(){return{meta:{changes:statement.run(...args).changes}}},async all(){return{results:statement.all(...args)}}}};
  return{sql,prepare,async batch(statements){sql.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(statement.isWrite?await statement.run():await statement.all());sql.exec('COMMIT');return results;}catch(error){sql.exec('ROLLBACK');throw error;}}};
}

function emailEnvironment(){let code='',recipient='',sender='';const env={CONTENT_DB:database(),ADMIN_PASSWORD:'legada',RESEND_API_KEY:'re_test'};const fetch=globalThis.fetch;globalThis.fetch=async(_url,options)=>{const message=JSON.parse(options.body);recipient=message.to[0];sender=message.from;code=message.text.match(/\b\d{5}\b/)[0];return new Response(JSON.stringify({id:'email-id'}),{status:200});};return{env,get code(){return code},get recipient(){return recipient},get sender(){return sender},restore(){globalThis.fetch=fetch}};}

test('cadastro inicial exige a senha legada e envia código de 5 dígitos ao e-mail fixo',async()=>{
  const mail=emailEnvironment(),env=mail.env;
  let response=await handleAdminAuthentication(new Request('https://criamundo.art.br/api/admin/auth/status'),env,'/api/admin/auth/status');
  assert.deepEqual(await response.json(),{configured:false,authenticated:false,secondFactor:'email',destination:'a•••••••••@gmail.com'});
  const body={password:'senha-segura-123',legacyPassword:'errada'};
  response=await handleAdminAuthentication(new Request('https://criamundo.art.br/api/admin/auth/setup-options',{method:'POST',body:JSON.stringify(body)}),env,'/api/admin/auth/setup-options');
  assert.equal(response.status,401);
  response=await handleAdminAuthentication(new Request('https://criamundo.art.br/api/admin/auth/setup-options',{method:'POST',body:JSON.stringify({...body,legacyPassword:'legada'})}),env,'/api/admin/auth/setup-options');
  const result=await response.json();assert.equal(response.status,200);assert.match(mail.code,/^\d{5}$/);assert.equal(mail.recipient,'aleschaefer@gmail.com');assert.equal(mail.sender,'onboarding@resend.dev');
  response=await handleAdminAuthentication(new Request('https://criamundo.art.br/api/admin/auth/setup-verify',{method:'POST',body:JSON.stringify({flowId:result.flowId,code:mail.code})}),env,'/api/admin/auth/setup-verify');
  assert.equal(response.status,200);assert.match(response.headers.get('set-cookie'),/__Host-admin_session=/);assert.equal(env.CONTENT_DB.sql.prepare('SELECT email FROM admin_users').get().email,'aleschaefer@gmail.com');mail.restore();
});

test('login exige senha e código de uso único e bloqueia após cinco erros',async()=>{const mail=emailEnvironment(),env=mail.env;let response=await handleAdminAuthentication(new Request('https://x/api/admin/auth/setup-options',{method:'POST',body:JSON.stringify({password:'senha-segura-123',legacyPassword:'legada'})}),env,'/api/admin/auth/setup-options'),setup=await response.json();await handleAdminAuthentication(new Request('https://x/api/admin/auth/setup-verify',{method:'POST',body:JSON.stringify({flowId:setup.flowId,code:mail.code})}),env,'/api/admin/auth/setup-verify');response=await handleAdminAuthentication(new Request('https://x/api/admin/auth/login-options',{method:'POST',body:JSON.stringify({password:'errada'})}),env,'/api/admin/auth/login-options');assert.equal(response.status,401);response=await handleAdminAuthentication(new Request('https://x/api/admin/auth/login-options',{method:'POST',body:JSON.stringify({password:'senha-segura-123'})}),env,'/api/admin/auth/login-options');const login=await response.json(),wrongCode=mail.code==='00000'?'00001':'00000';assert.equal(response.status,200);for(let attempt=1;attempt<=5;attempt++){response=await handleAdminAuthentication(new Request('https://x/api/admin/auth/login-verify',{method:'POST',body:JSON.stringify({flowId:login.flowId,code:wrongCode})}),env,'/api/admin/auth/login-verify');assert.equal(response.status,401);}response=await handleAdminAuthentication(new Request('https://x/api/admin/auth/login-verify',{method:'POST',body:JSON.stringify({flowId:login.flowId,code:mail.code})}),env,'/api/admin/auth/login-verify');assert.equal(response.status,400);mail.restore();});

test('código correto cria sessão e não pode ser reutilizado',async()=>{const mail=emailEnvironment(),env=mail.env;let response=await handleAdminAuthentication(new Request('https://x/api/admin/auth/setup-options',{method:'POST',body:JSON.stringify({password:'senha-segura-123',legacyPassword:'legada'})}),env,'/api/admin/auth/setup-options'),setup=await response.json();await handleAdminAuthentication(new Request('https://x/api/admin/auth/setup-verify',{method:'POST',body:JSON.stringify({flowId:setup.flowId,code:mail.code})}),env,'/api/admin/auth/setup-verify');response=await handleAdminAuthentication(new Request('https://x/api/admin/auth/login-options',{method:'POST',body:JSON.stringify({password:'senha-segura-123'})}),env,'/api/admin/auth/login-options');const login=await response.json(),code=mail.code;response=await handleAdminAuthentication(new Request('https://x/api/admin/auth/login-verify',{method:'POST',body:JSON.stringify({flowId:login.flowId,code})}),env,'/api/admin/auth/login-verify');assert.equal(response.status,200);assert.match(response.headers.get('set-cookie'),/__Host-admin_session=/);response=await handleAdminAuthentication(new Request('https://x/api/admin/auth/login-verify',{method:'POST',body:JSON.stringify({flowId:login.flowId,code})}),env,'/api/admin/auth/login-verify');assert.equal(response.status,400);mail.restore();});

test('APIs rejeitam senha legada em produção e só permitem compatibilidade explicitamente habilitada',async()=>{
  const request=new Request('https://criamundo.art.br/api/admin/finance',{headers:{'x-admin-password':'legada'}}),db=database();
  assert.equal(await requireAdminSession(request,{CONTENT_DB:db,ADMIN_PASSWORD:'legada'}),false);
  assert.equal(await requireAdminSession(request,{CONTENT_DB:db,ADMIN_PASSWORD:'legada',ALLOW_LEGACY_ADMIN_AUTH:'true'}),true);
});
