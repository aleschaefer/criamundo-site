const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();

export function parseRicoQuantities(items, page = 1) {
  const rows = [];
  for (const item of items || []) {
    const y = item.transform?.[5] || 0;
    let row = rows.find(entry => Math.abs(entry.y - y) <= 2);
    if (!row) { row = { y, items: [] }; rows.push(row); }
    row.items.push({ x: item.transform?.[4] || 0, text: String(item.str || '').trim() });
  }
  rows.sort((a, b) => b.y - a.y);
  const result = []; let symbol = '';
  for (const row of rows) {
    row.items.sort((a, b) => a.x - b.x);
    const text = normalize(row.items.map(item => item.text).join(' '));
    const header = text.match(/^([A-Z]{4}\d{1,2})\s+Ultimo preco\b.*\bQuantidade\b.*\bPosicao\b/i);
    if (header) { symbol = header[1].toUpperCase(); continue; }
    if (!symbol) continue;
    // A quantidade é o inteiro imediatamente anterior ao valor monetário da posição.
    // O preço médio pode estar indefinido e não interfere nesta leitura.
    const match = text.match(/(?:%|Indefinida)\s+(\d+(?:\.\d{3})*)\s+R\$\s*\d+(?:\.\d{3})*,\d{2}\s*$/i);
    if (!match) continue;
    const quantity = Number(match[1].replaceAll('.', ''));
    if (Number.isSafeInteger(quantity) && quantity >= 0 && quantity <= 2147483647) result.push({ symbol, quantity, page });
    symbol = '';
  }
  return result;
}

export function quantityUpdatesForAssets(assets, recognized) {
  const bySymbol = new Map();
  for (const item of recognized) {
    if (bySymbol.has(item.symbol)) throw new Error(`Sigla repetida no PDF: ${item.symbol}. Confira o documento antes de importar.`);
    bySymbol.set(item.symbol, item.quantity);
  }
  const matched = new Set();
  return assets.filter(asset => bySymbol.has(asset.symbol)).map(asset => {
    if (matched.has(asset.symbol)) throw new Error(`Há mais de um ativo cadastrado com a sigla ${asset.symbol} neste agrupamento.`);
    matched.add(asset.symbol);
    return { id: asset.id, revision: asset.revision, quantity: bySymbol.get(asset.symbol) };
  });
}
