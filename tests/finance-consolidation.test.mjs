import { test } from 'node:test';
import assert from 'node:assert/strict';
import { consolidateAssets } from '../finance-consolidation.mjs';
const asset = { id: 'a', owner: 'Ale', symbol: 'BCRI11', assetType: 1, subType: 2, quantity: 10, averagePrice: 20, currentPrice: 15, currentIncome: 1, total: 200, minimumPrice: 12 };
test('consolida quantidades, custos e valores atuais sem alterar os registros', () => {
  const other = { ...asset, id: 'b', owner: 'Ana', quantity: 30, averagePrice: 40, currentPrice: 25, currentIncome: 2, total: 1200 };
  const [result] = consolidateAssets([asset, other]);
  assert.equal(result.quantity, 40);
  assert.equal(result.averagePrice, 35);
  assert.equal(result.currentPrice, 22.5);
  assert.equal(result.currentIncome, 1.75);
  assert.equal(result.averageDy, 5);
  assert.equal(result.total, 1400);
  assert.equal(result.quantity * result.currentPrice, 900);
  assert.deepEqual(result.members, [asset, other]);
  assert.equal(asset.quantity, 10);
});
test('mantém siglas e tipos distintos separados e trata quantidade zero', () => {
  assert.equal(consolidateAssets([asset, { ...asset, symbol: 'BCRI12' }, { ...asset, subType: 1 }]).length, 3);
  const [result] = consolidateAssets([{ ...asset, quantity: 0 }, { ...asset, quantity: 0, owner: 'Ana' }]);
  assert.equal(result.quantity, 0);
  assert.equal(result.averagePrice, 20);
});
test('mínimos ausentes não viram zero e datas distintas não são atribuídas a todo o grupo', () => {
  const [result] = consolidateAssets([{ ...asset, minimumPrice: null, exitDate: '2027-01-01' }, { ...asset, owner: 'Ana', minimumPrice: null, exitDate: '2028-01-01' }]);
  assert.equal(result.minimumPrice, null);
  assert.equal(result.exitDate, null);
});
