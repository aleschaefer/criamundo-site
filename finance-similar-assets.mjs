const normalizedSymbol = value => String(value || '').trim().toUpperCase();

export const similarSymbolKey = value => normalizedSymbol(value).replace(/\d{1,2}$/, '');

export function preferredSimilarAssets(assets, candidates = assets) {
  const requestedFamilies = new Set((assets || []).map(asset => similarSymbolKey(asset.symbol)).filter(Boolean));
  const byFamily = new Map();
  for (const asset of candidates || []) {
    const key = similarSymbolKey(asset.symbol);
    if (!key || !requestedFamilies.has(key)) continue;
    const current = byFamily.get(key);
    if (!current || normalizedSymbol(asset.symbol).endsWith('11')) byFamily.set(key, asset);
  }
  for (const asset of assets || []) {
    const key = similarSymbolKey(asset.symbol);
    if (key && !byFamily.has(key)) byFamily.set(key, asset);
  }
  return [...byFamily.values()];
}

export function valuesForSimilarAssets(assets, valuesBySymbol) {
  const byFamily = new Map();
  const entries = [...valuesBySymbol.entries()].sort(([left], [right]) => Number(normalizedSymbol(right).endsWith('11')) - Number(normalizedSymbol(left).endsWith('11')));
  for (const [symbol, value] of entries) {
    const key = similarSymbolKey(symbol);
    if (key && !byFamily.has(key) && Number.isFinite(Number(value))) byFamily.set(key, Number(value));
  }
  const result = new Map();
  for (const asset of assets || []) {
    const value = byFamily.get(similarSymbolKey(asset.symbol));
    if (value !== undefined) result.set(asset.id, value);
  }
  return result;
}
