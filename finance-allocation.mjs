// Soma em centavos para que a distribuição corresponda ao custo acumulado.
export function assetAllocation(assets) {
  const amounts = [0, 0, 0, 0, 0];
  for (const asset of assets) {
    if (Number.isInteger(asset.assetType) && asset.assetType >= 1 && asset.assetType <= 5 && Number.isFinite(asset.total) && asset.total >= 0) {
      amounts[asset.assetType - 1] += Math.round(asset.total * 100);
    }
  }
  const total = amounts.reduce((sum, value) => sum + value, 0);
  return amounts.map((cents, index) => ({ type: index + 1, amount: cents / 100, percent: total > 0 ? cents / total * 100 : 0 }));
}
