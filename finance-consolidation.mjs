import { calculateYields } from './finance-yield.mjs';

// Consolidação apenas para apresentação; os registros originais continuam separados.
export function consolidateAssets(assets) {
  const groups = new Map();
  for (const asset of assets) {
    const symbol = String(asset.symbol || '').trim().toUpperCase();
    const key = JSON.stringify([asset.assetType, asset.subType, symbol || asset.name]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(asset);
  }
  return [...groups.values()].map(members => {
    if (members.length === 1) return members[0];
    const quantity = members.reduce((sum, asset) => sum + asset.quantity, 0);
    const weighted = field => {
      if (members.some(asset => !Number.isFinite(asset[field]))) return null;
      return quantity ? members.reduce((sum, asset) => sum + asset.quantity * asset[field], 0) / quantity : members[0][field];
    };
    const averagePrice = weighted('averagePrice');
    const currentPrice = weighted('currentPrice');
    const currentIncome = weighted('currentIncome');
    const minima = members.map(asset => asset.minimumPrice).filter(Number.isFinite);
    return {
      ...members[0], members, quantity, averagePrice, currentPrice, currentIncome,
      minimumPrice: minima.length ? Math.min(...minima) : null,
      total: Math.round(members.reduce((sum, asset) => sum + asset.total, 0) * 100) / 100,
      exitDate: members.every(asset => asset.exitDate === members[0].exitDate) ? members[0].exitDate : null,
      ...calculateYields(currentIncome, currentPrice, averagePrice)
    };
  });
}
