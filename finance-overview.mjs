export function financeOverviewTotals(assets = []) {
  let currentValueCents = 0, averageValueCents = 0, availableCurrentValueCents = 0, availableAverageValueCents = 0, stockMonthlyIncome = 0, fiiMonthlyIncome = 0;
  const currentByCategoryCents = { stocks: 0, fiis: 0, fixed: 0, others: 0 };
  const averageByCategoryCents = { stocks: 0, fiis: 0, fixed: 0, others: 0 };
  const countByCategory = { stocks: 0, fiis: 0, fixed: 0 };
  for (const asset of assets) {
    const quantity = Number(asset.quantity), averagePrice = Number(asset.averagePrice), currentPrice = Number(asset.currentPrice), income = Number(asset.currentIncome);
    const category = asset.assetType === 1 && asset.subType === 1 ? 'stocks' : asset.assetType === 1 && asset.subType === 2 ? 'fiis' : asset.assetType === 2 ? 'fixed' : 'others';
    if (category !== 'others') countByCategory[category]++;
    if (Number.isFinite(quantity) && Number.isFinite(currentPrice)) {
      const cents = Math.round(quantity * currentPrice * 100); currentValueCents += cents;
      currentByCategoryCents[category] += cents;
      if (asset.availableForPropertyEntry) availableCurrentValueCents += cents;
    }
    if (Number.isFinite(quantity) && Number.isFinite(averagePrice)) {
      const cents = Math.round(quantity * averagePrice * 100); averageValueCents += cents;
      averageByCategoryCents[category] += cents;
      if (asset.availableForPropertyEntry) availableAverageValueCents += cents;
    }
    if (asset.assetType === 1 && [1, 2].includes(asset.subType) && Number.isFinite(quantity) && Number.isFinite(income)) {
      if (asset.subType === 1) stockMonthlyIncome += quantity * income / 12;
      else fiiMonthlyIncome += quantity * income;
    }
  }
  stockMonthlyIncome = Math.round(stockMonthlyIncome * 100) / 100;
  fiiMonthlyIncome = Math.round(fiiMonthlyIncome * 100) / 100;
  const annualIncome = Math.round((stockMonthlyIncome + fiiMonthlyIncome) * 12 * 100) / 100;
  const currentVariableValue = (currentByCategoryCents.stocks + currentByCategoryCents.fiis) / 100;
  const averageVariableValue = (averageByCategoryCents.stocks + averageByCategoryCents.fiis) / 100;
  const dy = value => value > 0 ? Math.round(annualIncome / value * 100 * 100000) / 100000 : null;
  return {
    currentValue: currentValueCents / 100,
    averageValue: averageValueCents / 100,
    availableCurrentValue: availableCurrentValueCents / 100,
    availableAverageValue: availableAverageValueCents / 100,
    monthlyIncome: Math.round((stockMonthlyIncome + fiiMonthlyIncome) * 100) / 100,
    stockMonthlyIncome,
    fiiMonthlyIncome,
    currentVariableDy: dy(currentVariableValue),
    averageVariableDy: dy(averageVariableValue),
    currentByCategory: Object.fromEntries(Object.entries(currentByCategoryCents).map(([key, cents]) => [key, cents / 100])),
    averageByCategory: Object.fromEntries(Object.entries(averageByCategoryCents).map(([key, cents]) => [key, cents / 100])),
    countByCategory
  };
}
