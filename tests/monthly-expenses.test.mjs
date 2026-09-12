import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { validateMonthlyExpenseAction } from '../monthly-expenses-model.mjs';
import { handleMonthlyExpenses } from '../monthly-expenses-api.mjs';
const migration=readFileSync(new URL('../migrations/0024_monthly_expenses.sql',import.meta.url),'utf8');
const id=()=>crypto.randomUUID();
function database(){const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');sql.exec(migration);const prepare=query=>{let args=[];const statement=sql.prepare(query);return{bind(...values){args=values;return this},async first(){return statement.get(...args)||null},async run(){const result=statement.run(...args);return{meta:{changes:result.changes}}},async all(){return{results:statement.all(...args)}}}};return{sql,prepare,async batch(statements){sql.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(/^\s*(SELECT|WITH)/i.test(statement.source||'')?await statement.all():await statement.run());sql.exec('COMMIT');return results;}catch(error){sql.exec('ROLLBACK');throw error;}}};}
// D1 statements do not expose their SQL; this wrapper supports the SELECTs used by overview.
function env(){const db=database(),original=db.prepare;db.prepare=query=>{const statement=original(query);statement.source=query;return statement;};return{ADMIN_PASSWORD:'pw',ALLOW_LEGACY_ADMIN_AUTH:'true',CONTENT_DB:db};}
const request=body=>new Request('https://x/api/admin/monthly-expenses',{method:body?'POST':'GET',headers:{'x-admin-password':'pw','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});

test('valida proprietário, valor, período e identificadores',()=>{const groupId=id();assert.equal(validateMonthlyExpenseAction({type:'expense',id:id(),owner:'Ale',name:'Internet',value:99.9,groupId}).value,99.9);assert.throws(()=>validateMonthlyExpenseAction({type:'expense',id:id(),owner:'Outro',name:'X',value:1,groupId}));assert.throws(()=>validateMonthlyExpenseAction({type:'month',month:13,year:2026,expenseIds:[]}));});

test('cadastra grupos e gastos e atualiza a seleção de cada mês',async()=>{const e=env(),groupId=id(),expenseId=id();assert.equal((await handleMonthlyExpenses(request({type:'group',id:groupId,name:'CASA'}),e)).status,200);assert.equal((await handleMonthlyExpenses(request({type:'expense',id:expenseId,owner:'Ana',name:'Internet',value:120.5,groupId}),e)).status,200);let response=await handleMonthlyExpenses(request({type:'month',month:9,year:2026,expenseIds:[expenseId]}),e);assert.equal(response.status,200);let data=await response.json();assert.deepEqual(data.entries,[{expenseId,month:9,year:2026}]);response=await handleMonthlyExpenses(request({type:'month',month:9,year:2026,expenseIds:[]}),e);data=await response.json();assert.equal(data.entries.length,0);assert.equal(data.expenses[0].groupName,'CASA');});

test('API exige autenticação',async()=>{const e=env();const response=await handleMonthlyExpenses(new Request('https://x/api/admin/monthly-expenses'),e);assert.equal(response.status,401);});
