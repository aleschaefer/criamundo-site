import { test } from 'node:test';
import assert from 'node:assert/strict';
import { financeOverviewTotals } from '../finance-overview.mjs';

test('calcula valor pelos preços médios e rendimento mensal de ações e FIIs', () => {
  const result = financeOverviewTotals([
    { assetType: 1, subType: 1, quantity: 120, averagePrice: 20, currentPrice: 22, currentIncome: 1.2 },
    { assetType: 1, subType: 2, quantity: 10, averagePrice: 100, currentPrice: 95, currentIncome: 0.8 },
    { assetType: 2, subType: 4, quantity: 2, averagePrice: 1000, currentPrice: 1100, currentIncome: 50 }
  ]);
  assert.deepEqual(result, { currentValue: 5790, averageValue: 5400, monthlyIncome: 20 });
});

test('ignora valores inválidos e arredonda o rendimento total em centavos', () => {
  assert.deepEqual(financeOverviewTotals([{ assetType: 1, subType: 2, quantity: 3, averagePrice: 10.01, currentPrice: 11.11, currentIncome: 0.33333 }]), { currentValue: 33.33, averageValue: 30.03, monthlyIncome: 1 });
});
