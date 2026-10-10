import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchTextHead, fetchText, fetchJson, isRetryableError } from '../../providers/_http.mjs';

function streamed(t, chunks, init = {}) {
  let cancelled = false;
  t.mock.method(globalThis, 'fetch', async () => new Response(new ReadableStream({
    start(controller) { for (const chunk of chunks) controller.enqueue(Buffer.from(chunk)); },
    cancel() { cancelled = true; },
  }), init));
  return () => cancelled;
}

test('bounded success slices oversized chunks and cancels unread data', async t => {
  const cancelled = streamed(t, ['x'.repeat(6_000_000)]);
  const body = await fetchTextHead('https://example.test', { maxBytes: 2_000_000 });
  assert.equal(Buffer.byteLength(body), 2_000_000);
  assert.equal(cancelled(), true);
});

test('bounded errors preserve HTTP metadata with at most 8 KiB of diagnostics', async t => {
  const cancelled = streamed(t, ['x'.repeat(6_000_000)], { status: 503, headers: { 'retry-after': '2', location: '/retry' } });
  await assert.rejects(() => fetchTextHead('https://example.test', { maxBytes: 2_000_000 }), e => {
    assert.equal(e.status, 503);
    assert.equal(e.body.length, 8192);
    assert.equal(e.retryAfter, '2');
    assert.equal(e.location, '/retry');
    assert.equal(isRetryableError(e), true);
    return true;
  });
  assert.equal(cancelled(), true);
});

test('short error diagnostics remain intact without appearing in the error message', async t => {
  const body = '<html>Security Check — Support ID: example</html>';
  t.mock.method(globalThis, 'fetch', async () => new Response(body, { status: 429, statusText: 'Too Many Requests' }));
  await assert.rejects(() => fetchJson('https://example.test'), e => {
    assert.equal(e.body, body);
    assert.equal(e.message, 'HTTP 429 Too Many Requests');
    return true;
  });
});

test('UTF-8 truncation does not invent a replacement character', async t => {
  const cancelled = streamed(t, [Buffer.from('Aé').subarray(0, 2), Buffer.from('éZ').subarray(1)]);
  const body = await fetchTextHead('https://example.test', { maxBytes: 2 });
  assert.equal(body, 'A');
  assert.equal(cancelled(), true);
});

test('complete multibyte characters survive across stream chunks', async t => {
  const bytes = Buffer.from('AéZ');
  streamed(t, [bytes.subarray(0, 2), bytes.subarray(2)]);
  assert.equal(await fetchTextHead('https://example.test', { maxBytes: 4 }), 'AéZ');
});

test('bounded readers never fall back to an unbounded text implementation', async t => {
  let textCalls = 0;
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, text: async () => { textCalls++; return 'unbounded'; } }));
  await assert.rejects(() => fetchTextHead('https://example.test'), /body stream/);
  assert.equal(textCalls, 0);
});

test('bounded reads retain the timeout through body consumption', async t => {
  t.mock.method(globalThis, 'fetch', async (_url, options) => new Response(new ReadableStream({
    start(controller) { options.signal.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')), { once: true }); },
  })));
  await assert.rejects(() => fetchTextHead('https://example.test', { timeoutMs: 25 }), { name: 'AbortError' });
});

test('null bodies and invalid byte limits are handled without a buffering fallback', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return new Response(null, { status: 204 }); });
  assert.equal(await fetchTextHead('https://example.test'), '');
  for (const maxBytes of [-1, 0.5, Infinity, NaN]) await assert.rejects(() => fetchTextHead('https://example.test', { maxBytes }), /byte limit/);
  assert.equal(calls, 1);
});

test('ordinary successful text and JSON readers keep their full-response contract', async t => {
  const body = 'x'.repeat(10_000);
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ body })));
  assert.equal((await fetchJson('https://example.test')).body, body);
  assert.equal(await fetchText('https://example.test'), JSON.stringify({ body }));
});
