export function financeOverviewTotals(assets = []) {
  let currentValueCents = 0, averageValueCents = 0, monthlyIncome = 0;
  for (const asset of assets) {
    const quantity = Number(asset.quantity), averagePrice = Number(asset.averagePrice), currentPrice = Number(asset.currentPrice), income = Number(asset.currentIncome);
    if (Number.isFinite(quantity) && Number.isFinite(currentPrice)) currentValueCents += Math.round(quantity * currentPrice * 100);
    if (Number.isFinite(quantity) && Number.isFinite(averagePrice)) averageValueCents += Math.round(quantity * averagePrice * 100);
    if (asset.assetType === 1 && [1, 2].includes(asset.subType) && Number.isFinite(quantity) && Number.isFinite(income)) {
      monthlyIncome += quantity * income / (asset.subType === 1 ? 12 : 1);
    }
  }
  return { currentValue: currentValueCents / 100, averageValue: averageValueCents / 100, monthlyIncome: Math.round(monthlyIncome * 100) / 100 };
}
