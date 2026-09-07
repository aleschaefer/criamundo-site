import { requireAdminSession } from './admin-auth.mjs';

const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const textOnly = html => String(html || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim();
const moneyAfter = (text, label, stopLabels = []) => {
  const start = text.toLocaleLowerCase('pt-BR').indexOf(label.toLocaleLowerCase('pt-BR'));
  if (start < 0) return null;
  let section = text.slice(start, start + 600);
  for (const stopLabel of stopLabels) {
    const stop = section.toLocaleLowerCase('pt-BR').indexOf(stopLabel.toLocaleLowerCase('pt-BR'), label.length);
    if (stop >= 0) section = section.slice(0, stop);
  }
  const match = section.match(/R\$\s*([0-9]+(?:[.,][0-9]+)?)/i);
  if (!match) return null;
  const value = Number(match[1].replaceAll('.', '').replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : null;
};

export function parseStatusInvestIncome(html, category = 'fii') {
  const text = textOnly(html);
  const labels = category === 'stock'
    ? ['Próximo Dividendo', 'Próximo Rendimento', 'Último dividendo', 'Último rendimento']
    : ['Próximo Rendimento', 'Último rendimento'];
  for (const label of labels) {
    const value = moneyAfter(text, label, labels.filter(item => item !== label));
    if (value !== null) return { value, source: label };
  }
  throw new Error('O Status Invest não informou um rendimento para este ativo.');
}

export async function handleFinanceIncome(request, env, fetcher = fetch) {
  if (request.method !== 'GET') return reply({ error: 'Método não permitido.' }, 405);
  if (!await requireAdminSession(request, env)) return reply({ error: 'Sessão inválida. Entre novamente.' }, 401);
  const params = new URL(request.url).searchParams;
  const symbol = params.get('symbol')?.trim().toLowerCase() || '';
  const category = params.get('category') || '';
  const paths = { fii: 'fundos-imobiliarios', stock: 'acoes' };
  if (!/^[a-z0-9]{4,7}$/.test(symbol)) return reply({ error: 'Sigla do ativo inválida.' }, 400);
  if (!paths[category]) return reply({ error: 'Categoria do ativo inválida.' }, 400);
  try {
    const response = await fetcher(`https://statusinvest.com.br/${paths[category]}/${encodeURIComponent(symbol)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CriamundoFinance/1.0)', Accept: 'text/html' },
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error(`Status Invest respondeu ${response.status}.`);
    return reply({ symbol: symbol.toUpperCase(), category, ...parseStatusInvestIncome(await response.text(), category) });
  } catch (error) {
    return reply({ error: error.message || 'Não foi possível consultar o rendimento.' }, 502);
  }
}
