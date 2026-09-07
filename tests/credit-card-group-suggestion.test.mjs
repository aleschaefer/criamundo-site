import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestTransactionGroup } from '../credit-card-group-suggestion.mjs';

const groups=[{id:'uber',name:'UBER'},{id:'health',name:'SAÚDE'},{id:'other',name:'OUTROS'}];
const periods=[
  {id:'aug',startDate:'2026-07-22',endDate:'2026-08-20'},
  {id:'sep',startDate:'2026-08-21',endDate:'2026-09-21'},
  {id:'oct',startDate:'2026-09-22',endDate:'2026-10-20'}
];

test('nome contendo o nome do grupo seleciona o grupo diretamente',()=>{
  assert.equal(suggestTransactionGroup({name:'DL *UberRides São Paulo BR',periodId:'sep',periods,transactions:[],groups}),'uber');
});

test('grupo é aprendido por nome semelhante na fatura imediatamente anterior',()=>{
  const transactions=[
    {periodId:'aug',name:'PANVEL FILIAL PARC 01/03 FLORIANOPOLIS BR',groupId:'health',payment:2},
    {periodId:'oct',name:'PANVEL OUTRA COMPRA',groupId:'other',payment:1}
  ];
  assert.equal(suggestTransactionGroup({name:'PANVEL FILIAL PARC 02/03 FLORIANOPOLIS BR',periodId:'sep',periods,transactions,groups}),'health');
});

test('usa transação à vista da fatura anterior como referência para uma compra parcelada',()=>{
  const transactions=[{periodId:'aug',name:'FARMACIA CENTRAL',groupId:'health',payment:1}];
  assert.equal(suggestTransactionGroup({name:'FARMACIA CENTRAL PARC 01/04',periodId:'sep',periods,transactions,groups}),'health');
});
