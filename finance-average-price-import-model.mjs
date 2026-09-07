const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
const brMoney = value => Number(String(value).replaceAll('.', '').replace(',', '.'));

export function parseRicoAveragePrices(items, page = 1) {
  const rows = [];
  for (const item of items || []) {
    const y = Math.round((item.transform?.[5] || 0) * 2) / 2;
    const x = item.transform?.[4] || 0;
    let row = rows.find(entry => Math.abs(entry.y - y) <= 2);
    if (!row) { row = { y, items: [] }; rows.push(row); }
    row.items.push({ x, text: String(item.str || '').trim() });
  }
  rows.sort((a, b) => b.y - a.y).forEach(row => row.items.sort((a, b) => a.x - b.x));
  const output = []; let symbol = '';
  for (const row of rows) {
    const text = normalize(row.items.map(item => item.text).join(' '));
    const header = text.match(/^([A-Z0-9]{4,7})\s+Ultimo preco\b/i);
    if (header) { symbol = header[1].toUpperCase(); continue; }
    if (!symbol) continue;
    if (/\bIndefinido\b/i.test(text)) { symbol = ''; continue; }
    const prices = [...text.matchAll(/R\$\s*(\d+(?:\.\d{3})*,\d{2})/gi)].map(match => brMoney(match[1]));
    if (prices.length >= 2 && Number.isFinite(prices[1])) {
      output.push({ page, symbol, averagePrice: Math.round(prices[1] * 100) / 100 }); symbol = '';
    }
  }
  return output;
}
