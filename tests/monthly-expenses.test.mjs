import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { validateMonthlyExpenseAction } from '../monthly-expenses-model.mjs';
import { handleMonthlyExpenses } from '../monthly-expenses-api.mjs';
const migration=readFileSync(new URL('../migrations/0024_monthly_expenses.sql',import.meta.url),'utf8');
const incomeMigration=readFileSync(new URL('../migrations/0025_monthly_income.sql',import.meta.url),'utf8');
const id=()=>crypto.randomUUID();
function database(){const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');sql.exec(migration);sql.exec(incomeMigration);const prepare=query=>{let args=[];const statement=sql.prepare(query);return{bind(...values){args=values;return this},async first(){return statement.get(...args)||null},async run(){const result=statement.run(...args);return{meta:{changes:result.changes}}},async all(){return{results:statement.all(...args)}}}};return{sql,prepare,async batch(statements){sql.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(/^\s*(SELECT|WITH)/i.test(statement.source||'')?await statement.all():await statement.run());sql.exec('COMMIT');return results;}catch(error){sql.exec('ROLLBACK');throw error;}}};}
// D1 statements do not expose their SQL; this wrapper supports the SELECTs used by overview.
function env(){const db=database(),original=db.prepare;db.prepare=query=>{const statement=original(query);statement.source=query;return statement;};return{ADMIN_PASSWORD:'pw',ALLOW_LEGACY_ADMIN_AUTH:'true',CONTENT_DB:db};}
const request=body=>new Request('https://x/api/admin/monthly-expenses',{method:body?'POST':'GET',headers:{'x-admin-password':'pw','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});

test('valida proprietário, valor, período e identificadores',()=>{const groupId=id();assert.equal(validateMonthlyExpenseAction({type:'expense',id:id(),owner:'Ale',name:'Internet',value:99.9,groupId}).value,99.9);assert.throws(()=>validateMonthlyExpenseAction({type:'expense',id:id(),owner:'Outro',name:'X',value:1,groupId}));assert.throws(()=>validateMonthlyExpenseAction({type:'month',month:13,year:2026,expenseIds:[]}));});

test('cadastra grupos e gastos e atualiza a seleção de cada mês',async()=>{const e=env(),groupId=id(),expenseId=id();assert.equal((await handleMonthlyExpenses(request({type:'group',id:groupId,name:'CASA'}),e)).status,200);assert.equal((await handleMonthlyExpenses(request({type:'expense',id:expenseId,owner:'Ana',name:'Internet',value:120.5,groupId}),e)).status,200);let response=await handleMonthlyExpenses(request({type:'month',month:9,year:2026,expenseIds:[expenseId]}),e);assert.equal(response.status,200);let data=await response.json();assert.deepEqual(data.entries,[{expenseId,month:9,year:2026}]);response=await handleMonthlyExpenses(request({type:'month',month:9,year:2026,expenseIds:[]}),e);data=await response.json();assert.equal(data.entries.length,0);assert.equal(data.expenses[0].groupName,'CASA');});

test('API exige autenticação',async()=>{const e=env();const response=await handleMonthlyExpenses(new Request('https://x/api/admin/monthly-expenses'),e);assert.equal(response.status,401);});

test('cadastra renda mensal por proprietário',async()=>{const e=env(),incomeId=id();const response=await handleMonthlyExpenses(request({type:'income',id:incomeId,owner:'Ale',name:'Salário',value:5000}),e);assert.equal(response.status,200);const data=await response.json();assert.deepEqual(data.incomes,[{id:incomeId,owner:'Ale',name:'Salário',value:5000,revision:0}]);});

test('exclui todos os gastos e suas competências sem excluir grupos',async()=>{const e=env(),groupId=id(),expenseId=id();await handleMonthlyExpenses(request({type:'group',id:groupId,name:'CASA'}),e);await handleMonthlyExpenses(request({type:'expense',id:expenseId,owner:'Ale',name:'Condomínio',value:500,groupId}),e);await handleMonthlyExpenses(request({type:'month',month:9,year:2026,expenseIds:[expenseId]}),e);const response=await handleMonthlyExpenses(request({type:'delete-all-expenses'}),e),data=await response.json();assert.equal(response.status,200);assert.equal(data.expenses.length,0);assert.equal(data.entries.length,0);assert.equal(data.groups.length,1);});

test('exclui todas as rendas sem alterar gastos',async()=>{const e=env(),groupId=id();await handleMonthlyExpenses(request({type:'group',id:groupId,name:'CASA'}),e);await handleMonthlyExpenses(request({type:'expense',id:id(),owner:'Ana',name:'Luz',value:100,groupId}),e);await handleMonthlyExpenses(request({type:'income',id:id(),owner:'Ana',name:'Salário',value:5000}),e);const data=await(await handleMonthlyExpenses(request({type:'delete-all-incomes'}),e)).json();assert.equal(data.incomes.length,0);assert.equal(data.expenses.length,1);});
