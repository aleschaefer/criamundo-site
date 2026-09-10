import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseStatusInvestIncome, parseStatusInvestCurrentPrice, handleFinanceIncome, handleFinanceCurrentPrice } from '../finance-income-api.mjs';

test('extrai o preço atual das páginas de FII e ações', () => {
  assert.deepEqual(parseStatusInvestCurrentPrice('<section>VALOR ATUAL R$ 9,15 Min. 52 semanas R$ 8,59</section>'), { value: 9.15, source: 'Valor atual' });
  assert.deepEqual(parseStatusInvestCurrentPrice('<section>Valor atual R$ 49,17 Dividend Yield 7,46%</section>'), { value: 49.17, source: 'Valor atual' });
  assert.throws(() => parseStatusInvestCurrentPrice('<section>Valor atual -</section>'));
});

test('endpoint de preço atual usa a página correspondente ao tipo do ativo', async () => {
  const env = { ADMIN_PASSWORD: 'test-password', ALLOW_LEGACY_ADMIN_AUTH: 'true' };
  const request = new Request('https://example.test/api/admin/finance/current-price?symbol=PETR4&category=stock', { headers: { 'x-admin-password': 'test-password' } });
  const fetcher = async url => { assert.equal(url, 'https://statusinvest.com.br/acoes/petr4'); return new Response('<div>VALOR ATUAL R$ 49,17</div>'); };
  const response = await handleFinanceCurrentPrice(request, env, fetcher);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { symbol: 'PETR4', category: 'stock', value: 49.17, source: 'Valor atual' });
});

test('prioriza próximo rendimento e usa último quando o próximo está vazio', () => {
  assert.deepEqual(parseStatusInvestIncome('<section>Último rendimento R$ 0,8000</section><section>Próximo Rendimento R$ 0,7500</section>'), { value: 0.75, source: 'Próximo Rendimento' });
  assert.deepEqual(parseStatusInvestIncome('<section>Próximo Rendimento -</section><section>Último rendimento R$ 0,8000</section>'), { value: 0.8, source: 'Último rendimento' });
  assert.throws(() => parseStatusInvestIncome('<section>Próximo Rendimento -</section><section>Último rendimento -</section>'));
});

test('em ações usa o próximo dividendo e aceita o último dividendo como fallback', () => {
  assert.deepEqual(parseStatusInvestIncome('<p>O último dividendo do BBAS3 foi de R$0,14 por cota</p>', 'stock'), { value: 0.14, source: 'Último dividendo' });
  assert.deepEqual(parseStatusInvestIncome('<section>Próximo Dividendo R$ 0,25</section><p>Último dividendo R$ 0,14</p>', 'stock'), { value: 0.25, source: 'Próximo Dividendo' });
});

test('em ações prioriza o rendimento anual publicado nos últimos 12 meses', () => {
  const html = '<section>Dividend Yield 8,50% Últimos 12 meses R$ 4,3725</section><section>Último dividendo R$ 0,5000</section>';
  assert.deepEqual(parseStatusInvestIncome(html, 'stock'), { value: 4.3725, source: 'Últimos 12 meses' });
});

test('endpoint valida sessão e sigla e devolve rendimento consultado', async () => {
  const env = { ADMIN_PASSWORD: 'test-password', ALLOW_LEGACY_ADMIN_AUTH: 'true' };
  const request = (symbol, password = 'test-password', category = 'fii') => new Request(`https://example.test/api/admin/finance/income?symbol=${symbol}&category=${category}`, { headers: { 'x-admin-password': password } });
  const fetcher = async url => { assert.equal(url, 'https://statusinvest.com.br/fundos-imobiliarios/bcri11'); return new Response('<div>Próximo Rendimento R$ 0,7500</div>'); };
  assert.equal((await handleFinanceIncome(request('bcri11', 'wrong'), env, fetcher)).status, 401);
  assert.equal((await handleFinanceIncome(request('../erro'), env, fetcher)).status, 400);
  const response = await handleFinanceIncome(request('BCRI11'), env, fetcher);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { symbol: 'BCRI11', category: 'fii', value: 0.75, source: 'Próximo Rendimento' });
});

test('endpoint consulta a página de ações e rejeita outras categorias', async () => {
  const env = { ADMIN_PASSWORD: 'test-password', ALLOW_LEGACY_ADMIN_AUTH: 'true' };
  const request = category => new Request(`https://example.test/api/admin/finance/income?symbol=BBAS3&category=${category}`, { headers: { 'x-admin-password': 'test-password' } });
  const fetcher = async url => { assert.equal(url, 'https://statusinvest.com.br/acoes/bbas3'); return new Response('<p>O último dividendo foi de R$ 0,14 por cota.</p>'); };
  assert.equal((await handleFinanceIncome(request('bdr'), env, fetcher)).status, 400);
  const response = await handleFinanceIncome(request('stock'), env, fetcher);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { symbol: 'BBAS3', category: 'stock', value: 0.14, source: 'Último dividendo' });
});

test('DCRA11 usa excepcionalmente a página de Fiagros', async () => {
  const env = { ADMIN_PASSWORD: 'test-password', ALLOW_LEGACY_ADMIN_AUTH: 'true' };
  const request = new Request('https://example.test/api/admin/finance/income?symbol=DCRA11&category=fii', { headers: { 'x-admin-password': 'test-password' } });
  const fetcher = async url => {
    assert.equal(url, 'https://statusinvest.com.br/fiagros/dcra11');
    return new Response('<section>Próximo Rendimento R$ 0,11</section>');
  };
  const response = await handleFinanceIncome(request, env, fetcher);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { symbol: 'DCRA11', category: 'fii', value: 0.11, source: 'Próximo Rendimento' });
});
