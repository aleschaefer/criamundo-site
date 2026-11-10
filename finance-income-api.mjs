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
  return Number.isFinite(value) && value >= 0 ? value : null;
};

export function parseStatusInvestIncome(html, category = 'fii') {
  const text = textOnly(html);
  const labels = category === 'stock'
    ? ['Últimos 12 meses', 'Próximo Dividendo', 'Próximo Rendimento', 'Último dividendo', 'Último rendimento']
    : ['Próximo Rendimento', 'Último rendimento'];
  for (const label of labels) {
    const value = moneyAfter(text, label, labels.filter(item => item !== label));
    if (value !== null) return { value, source: label };
  }
  throw new Error('O Status Invest não informou um rendimento para este ativo.');
}

export function parseStatusInvestCurrentPrice(html) {
  const text = textOnly(html);
  const value = moneyAfter(text, 'Valor atual', ['Min. 52 semanas', 'Mín. 52 semanas', 'Máx. 52 semanas', 'Dividend Yield', 'Valorização']);
  if (value === null || value <= 0) throw new Error('O Status Invest não informou o preço atual deste ativo.');
  return { value, source: 'Valor atual' };
}

export function parseStatusInvestMinimumPrice(html) {
  const text = textOnly(html).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const match = text.match(/\bmin\.?\s*52\s+semanas\s*(?:R\$\s*)?([0-9]+(?:\.[0-9]{3})*,[0-9]{2})(?![0-9])/i);
  const value = match ? Number(match[1].replaceAll('.', '').replace(',', '.')) : null;
  if (!Number.isFinite(value) || value <= 0) throw new Error('O Status Invest não informou o mínimo de 52 semanas deste ativo.');
  return { value, source: 'Min. 52 semanas' };
}

const statusInvestUrl = (symbol, category) => {
  const paths = { fii: 'fundos-imobiliarios', stock: 'acoes' };
  const path = category === 'fii' && symbol === 'dcra11' ? 'fiagros' : paths[category];
  return path ? `https://statusinvest.com.br/${path}/${encodeURIComponent(symbol)}` : '';
};

async function readStatusInvest(request, env, fetcher, parser, unavailableMessage) {
  if (request.method !== 'GET') return reply({ error: 'Método não permitido.' }, 405);
  if (!await requireAdminSession(request, env)) return reply({ error: 'Sessão inválida. Entre novamente.' }, 401);
  const params = new URL(request.url).searchParams;
  const symbol = params.get('symbol')?.trim().toLowerCase() || '';
  const category = params.get('category') || '';
  if (!/^[a-z0-9]{4,7}$/.test(symbol)) return reply({ error: 'Sigla do ativo inválida.' }, 400);
  const url = statusInvestUrl(symbol, category);
  if (!url) return reply({ error: 'Categoria do ativo inválida.' }, 400);
  try {
    // As três etapas leem a mesma página. Reutiliza por três minutos somente HTML bem-sucedido.
    const cache = globalThis.caches?.default;
    const cacheKey = new Request(new URL(`/__status-invest-cache/${category}/${symbol}`, request.url));
    let response;
    try { response = await cache?.match(cacheKey); } catch { /* Cache indisponível: consulta a origem. */ }
    if (!response) {
      response = await fetcher(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CriamundoFinance/1.0)', Accept: 'text/html' },
        signal: AbortSignal.timeout(10000)
      });
      if (!response.ok) {
        if (response.status === 403) throw new Error('Status Invest bloqueou a consulta (HTTP 403).');
        if (response.status === 429) throw new Error('Status Invest limitou as consultas (HTTP 429). Tente novamente mais tarde.');
        throw new Error(`Status Invest respondeu HTTP ${response.status}.`);
      }
      const html = await response.text();
      // Confere se é uma página de ativo antes de armazenar, evitando páginas de bloqueio com HTTP 200.
      let cacheable = false;
      try { parseStatusInvestCurrentPrice(html); cacheable = true; } catch { /* O parser solicitado ainda pode encontrar o indicador. */ }
      response = new Response(html, { headers: { 'Content-Type': 'text/html', 'Cache-Control': 'public, max-age=180' } });
      try { if (cacheable) await cache?.put(cacheKey, response.clone()); } catch { /* Falha do cache não impede a importação. */ }
    }
    return reply({ symbol: symbol.toUpperCase(), category, ...parser(await response.text(), category) });
  } catch (error) {
    return reply({ error: error.message || unavailableMessage }, 502);
  }
}

export async function handleFinanceIncome(request, env, fetcher = fetch) {
  return readStatusInvest(request, env, fetcher, parseStatusInvestIncome, 'Não foi possível consultar o rendimento.');
}

export async function handleFinanceCurrentPrice(request, env, fetcher = fetch) {
  return readStatusInvest(request, env, fetcher, parseStatusInvestCurrentPrice, 'Não foi possível consultar o preço atual.');
}

export async function handleFinanceMinimumPrice(request, env, fetcher = fetch) {
  return readStatusInvest(request, env, fetcher, parseStatusInvestMinimumPrice, 'Não foi possível consultar o preço mínimo.');
}
