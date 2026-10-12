import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handleMarket } from '../market-api.mjs';
import { validateMarketAction } from '../market-model.mjs';

function database(){
  const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');sql.exec(readFileSync(new URL('../migrations/0033_market.sql',import.meta.url),'utf8'));
  const prepare=query=>{let args=[];const statement=sql.prepare(query);return{isWrite:/^\s*(INSERT|UPDATE|DELETE)/i.test(query),bind(...values){args=values;return this;},async first(){return statement.get(...args)||null;},async run(){return{meta:{changes:statement.run(...args).changes}};},async all(){return{results:statement.all(...args)};}}};
  return{sql,prepare,async batch(statements){sql.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(statement.isWrite?await statement.run():await statement.all());sql.exec('COMMIT');return results;}catch(error){sql.exec('ROLLBACK');throw error;}}};
}
const env=()=>({CONTENT_DB:database(),ADMIN_PASSWORD:'pw',ALLOW_LEGACY_ADMIN_AUTH:'true'});
const request=body=>new Request('https://x/api/admin/market',{method:body?'POST':'GET',headers:{'Content-Type':'application/json','x-admin-password':'pw'},...(body?{body:JSON.stringify(body)}:{})});
const id=()=>crypto.randomUUID();

test('valida categorias, itens e listas de Mercado',()=>{
  const categoryId=id(),itemId=id();
  assert.equal(validateMarketAction({type:'category',id:categoryId,name:' Hortifruti '}).name,'Hortifruti');
  const item=validateMarketAction({type:'item',id:itemId,name:'Maçã',quantity:3,categoryId,approximateValue:4.5});
  assert.equal(item.quantity,3);assert.equal(item.approximateValue,4.5);
  assert.deepEqual(validateMarketAction({type:'list',id:id(),listDate:'2026-10-12',itemIds:[itemId]}).itemIds,[itemId]);
  assert.throws(()=>validateMarketAction({type:'item',id:id(),name:'Arroz',quantity:0,categoryId,approximateValue:10}));
  assert.throws(()=>validateMarketAction({type:'list',id:id(),listDate:'2026-02-30',itemIds:[itemId]}));
});

test('cadastra, edita e exclui categorias, itens e listas',async()=>{
  const e=env(),category={type:'category',id:id(),name:'Mercado'};
  let response=await handleMarket(request(category),e);assert.equal(response.status,200);
  const rice={type:'item',id:id(),name:'Arroz',quantity:2,categoryId:category.id,approximateValue:24.9};
  const beans={type:'item',id:id(),name:'Feijão',quantity:3,categoryId:category.id,approximateValue:8.5};
  await handleMarket(request(rice),e);let data=await(await handleMarket(request(beans),e)).json();assert.equal(data.items.length,2);
  const list={type:'list',id:id(),listDate:'2026-10-12',itemIds:[rice.id,beans.id]};
  data=await(await handleMarket(request(list),e)).json();assert.equal(data.lists[0].itemIds.length,2);
  data=await(await handleMarket(request({...list,operation:'update',revision:0,listDate:'2026-10-13',itemIds:[rice.id]}),e)).json();assert.equal(data.lists[0].listDate,'2026-10-13');assert.deepEqual(data.lists[0].itemIds,[rice.id]);
  response=await handleMarket(request({type:'category',operation:'delete',id:category.id,revision:0}),e);assert.equal(response.status,409);
  response=await handleMarket(request({type:'item',operation:'delete',id:rice.id,revision:0}),e);assert.equal(response.status,409);
  data=await(await handleMarket(request({type:'list',operation:'delete',id:list.id,revision:1}),e)).json();assert.equal(data.lists.length,0);
  await handleMarket(request({type:'item',operation:'delete',id:rice.id,revision:0}),e);
  await handleMarket(request({type:'item',operation:'delete',id:beans.id,revision:0}),e);
  data=await(await handleMarket(request({type:'category',operation:'delete',id:category.id,revision:0}),e)).json();assert.equal(data.categories.length,0);
});

test('API de Mercado exige autenticação',async()=>{assert.equal((await handleMarket(new Request('https://x/api/admin/market'),{CONTENT_DB:database()})).status,401);});
