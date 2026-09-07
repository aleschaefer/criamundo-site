import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseStatusInvestIncome, handleFinanceIncome } from '../finance-income-api.mjs';

test('prioriza próximo rendimento e usa último quando o próximo está vazio', () => {
  assert.deepEqual(parseStatusInvestIncome('<section>Último rendimento R$ 0,8000</section><section>Próximo Rendimento R$ 0,7500</section>'), { value: 0.75, source: 'Próximo Rendimento' });
  assert.deepEqual(parseStatusInvestIncome('<section>Próximo Rendimento -</section><section>Último rendimento R$ 0,8000</section>'), { value: 0.8, source: 'Último rendimento' });
  assert.throws(() => parseStatusInvestIncome('<section>Próximo Rendimento -</section><section>Último rendimento -</section>'));
});

test('em ações usa o próximo dividendo e aceita o último dividendo como fallback', () => {
  assert.deepEqual(parseStatusInvestIncome('<p>O último dividendo do BBAS3 foi de R$0,14 por cota</p>', 'stock'), { value: 0.14, source: 'Último dividendo' });
  assert.deepEqual(parseStatusInvestIncome('<section>Próximo Dividendo R$ 0,25</section><p>Último dividendo R$ 0,14</p>', 'stock'), { value: 0.25, source: 'Próximo Dividendo' });
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
