export function priceDifferencePercent(asset) {
  const { currentPrice, averagePrice } = asset;
  if (!Number.isFinite(currentPrice) || currentPrice < 0 || !Number.isFinite(averagePrice) || averagePrice <= 0) return null;
  return (currentPrice - averagePrice) / averagePrice * 100;
}

export function matchesPriceFilter(asset, filter) {
  if (!filter) return true;
  const difference = priceDifferencePercent(asset);
  return difference !== null && (filter === 'above' ? difference > 0 : filter === 'below' ? difference < 0 : true);
}
