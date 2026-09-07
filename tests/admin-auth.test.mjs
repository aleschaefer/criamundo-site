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

test('cadastro inicial exige a senha legada e prepara uma passkey do Touch ID',async()=>{
  const env={CONTENT_DB:database(),ADMIN_PASSWORD:'legada'};
  let response=await handleAdminAuthentication(new Request('https://criamundo.art.br/api/admin/auth/status'),env,'/api/admin/auth/status');
  assert.deepEqual(await response.json(),{configured:false,authenticated:false,passkeySupported:true});
  const body={email:'admin@example.com',password:'senha-segura-123',legacyPassword:'errada'};
  response=await handleAdminAuthentication(new Request('https://criamundo.art.br/api/admin/auth/setup-options',{method:'POST',body:JSON.stringify(body)}),env,'/api/admin/auth/setup-options');
  assert.equal(response.status,401);
  response=await handleAdminAuthentication(new Request('https://criamundo.art.br/api/admin/auth/setup-options',{method:'POST',body:JSON.stringify({...body,legacyPassword:'legada'})}),env,'/api/admin/auth/setup-options');
  const result=await response.json();assert.equal(response.status,200);assert.equal(result.publicKey.rp.id,'criamundo.art.br');assert.equal(result.publicKey.authenticatorSelection.authenticatorAttachment,'platform');assert.equal(result.publicKey.authenticatorSelection.userVerification,'required');
});

test('APIs rejeitam senha legada em produção e só permitem compatibilidade explicitamente habilitada',async()=>{
  const request=new Request('https://criamundo.art.br/api/admin/finance',{headers:{'x-admin-password':'legada'}}),db=database();
  assert.equal(await requireAdminSession(request,{CONTENT_DB:db,ADMIN_PASSWORD:'legada'}),false);
  assert.equal(await requireAdminSession(request,{CONTENT_DB:db,ADMIN_PASSWORD:'legada',ALLOW_LEGACY_ADMIN_AUTH:'true'}),true);
});
