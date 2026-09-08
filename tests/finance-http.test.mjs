import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchJsonWithTimeout } from '../finance-http.mjs';

test('encerra a consulta mesmo quando o fetch não reage ao abort', async () => {
  const started = Date.now();
  await assert.rejects(fetchJsonWithTimeout('/pending', {}, 15, () => new Promise(() => {})), /tempo limite/i);
  assert.ok(Date.now() - started < 250);
});

test('devolve a resposta JSON quando a consulta finaliza', async () => {
  const answer = await fetchJsonWithTimeout('/ok', {}, 100, async () => new Response(JSON.stringify({ value: 1 })));
  assert.equal(answer.response.status, 200); assert.deepEqual(answer.result, { value: 1 });
});
