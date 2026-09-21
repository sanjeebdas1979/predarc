// Server ledger route control-flow tests with mocked auth, Binance and Supabase.
// Requires a Node release with node:module stripTypeScriptTypes (Node 22.13+).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const origin = 'http://localhost:3000';
const wallet = '0x' + '1'.repeat(40);
const requestId = '11111111-1111-4111-8111-111111111111';
const predictionId = '22222222-2222-4222-8222-222222222222';

function loadPostRoute(path) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const js = stripTypeScriptTypes(source)
    .replace(/import[\s\S]*?from\s+"[^"]+";/g, '')
    .replace(/export /g, '');

  return (options = {}) => {
    const calls = [];
    const reply = (body, status = 200) => ({ body, status });
    const client = () => ({
      rpc(name, args) {
        calls.push({ name, args });
        return {
          abortSignal: async () => {
            if (options.throwRpc) throw new Error('private rpc failure');
            return {
              data: options.data ?? {},
              error: options.error ?? null,
            };
          },
        };
      },
    });

    const handler = new Function(
      'authChainId',
      'authReply',
      'localAuthConfigured',
      'readAuthSession',
      'sessionHash',
      'getSupabaseAdmin',
      'process',
      js + '\nreturn POST;',
    )(
      5042002,
      reply,
      () => options.configured ?? true,
      async () => (options.session === false ? null : { wallet, chainId: 5042002 }),
      () => (options.cookie === false ? null : 'a'.repeat(64)),
      client,
      { env: { PREDARC_APP_ORIGIN: origin } },
    );

    const request = {
      headers: new Headers(options.origin === null ? {} : { origin: options.origin ?? origin }),
      nextUrl: { origin: options.urlOrigin ?? origin },
      json: async () => options.body ?? {},
    };

    return { run: () => handler(request), calls };
  };
}

async function withMockFetch(result, fn) {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url) => {
    requests.push(String(url));
    if (result instanceof Error) throw result;
    return {
      ok: result.ok ?? true,
      status: result.status ?? 200,
      json: async () => result.body ?? { price: '123.45' },
    };
  };
  try {
    return await fn(requests);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

const submitHarness = loadPostRoute('../src/app/api/predictions/submit/route.ts');
const settleHarness = loadPostRoute('../src/app/api/predictions/settle/route.ts');
const claimHarness = loadPostRoute('../src/app/api/predictions/claim/route.ts');

test('prediction POST routes block disallowed requests before any RPC', async () => {
  for (const makeHarness of [submitHarness, settleHarness, claimHarness]) {
    for (const [options, expected] of [
      [{ configured: false }, 503],
      [{ origin: null }, 403],
      [{ origin: 'https://evil.example' }, 403],
      [{ urlOrigin: 'https://predarc.xyz' }, 403],
      [{ cookie: false }, 401],
      [{ session: false }, 401],
    ]) {
      const h = makeHarness(options);
      const result = await h.run();
      assert.equal(result.status, expected);
      assert.equal(h.calls.length, 0);
    }
  }
});

test('submit route validates input, debits through RPC and whitelists response', async () => {
  const validBody = {
    requestId,
    market: 'BNB',
    direction: 'higher',
    points: 10,
    durationSeconds: 60,
  };

  assert.equal((await submitHarness({ body: { ...validBody, points: 9 } }).run()).status, 400);

  await withMockFetch({ body: { price: '750.44' } }, async (requests) => {
    const h = submitHarness({
      body: validBody,
      data: {
        balance: '990',
        replayed: false,
        prediction: { id: predictionId, status: 'pending', secret: 'must not leak through validation' },
      },
    });
    const result = await h.run();
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, {
      authenticated: true,
      wallet,
      chainId: 5042002,
      balance: '990',
      prediction: { id: predictionId, status: 'pending', secret: 'must not leak through validation' },
      replayed: false,
    });
    assert.equal(requests.length, 1);
    assert.equal(h.calls[0].name, 'predarc_submit_prediction_v1');
    assert.equal(h.calls[0].args.p_session_hash, 'a'.repeat(64));
    assert.equal(h.calls[0].args.p_market, 'BNB');
    assert.equal(h.calls[0].args.p_entry_price, 750.44);
  });
});

test('submit route maps expected failures without leaking private details', async () => {
  const body = { requestId, market: 'BNB', direction: 'higher', points: 10, durationSeconds: 60 };
  for (const [options, expected] of [
    [{ error: { code: '28000', message: 'AUTH_REQUIRED private' } }, 401],
    [{ error: { code: 'P0001', message: 'INSUFFICIENT_POINTS private' } }, 409],
    [{ error: { code: 'P0001', message: 'INVALID_OR_STALE_PRICE private' } }, 503],
    [{ error: { code: 'PGRST202', message: 'private database detail' } }, 503],
    [{ throwRpc: true }, 503],
    [{ data: { balance: -1, prediction: { id: predictionId } } }, 503],
  ]) {
    await withMockFetch({ body: { price: '123.45' } }, async () => {
      const result = await submitHarness({ ...options, body }).run();
      assert.equal(result.status, expected);
      assert.equal(JSON.stringify(result).includes('private'), false);
    });
  }

  await withMockFetch(new Error('binance private failure'), async () => {
    const result = await submitHarness({ body }).run();
    assert.equal(result.status, 503);
    assert.equal(JSON.stringify(result).includes('private'), false);
  });
});

test('settle route settles through RPC and maps domain failures', async () => {
  const body = { predictionId, market: 'XRP' };

  assert.equal((await settleHarness({ body: { predictionId, market: 'DOGE' } }).run()).status, 400);

  await withMockFetch({ body: { price: '1.37' } }, async () => {
    const h = settleHarness({
      body,
      data: {
        replayed: false,
        prediction: { id: predictionId, status: 'won' },
      },
    });
    const result = await h.run();
    assert.equal(result.status, 200);
    assert.equal(result.body.prediction.status, 'won');
    assert.equal(h.calls[0].name, 'predarc_settle_prediction_v1');
    assert.equal(h.calls[0].args.p_prediction_id, predictionId);
    assert.equal(h.calls[0].args.p_exit_price, 1.37);
  });

  for (const [options, expected] of [
    [{ error: { code: '28000', message: 'AUTH_REQUIRED private' } }, 401],
    [{ error: { code: 'P0001', message: 'PREDICTION_NOT_CLOSED private' } }, 409],
    [{ error: { code: 'P0001', message: 'PREDICTION_NOT_FOUND private' } }, 404],
    [{ error: { code: 'PGRST202', message: 'private database detail' } }, 503],
    [{ throwRpc: true }, 503],
    [{ data: { prediction: null } }, 503],
  ]) {
    await withMockFetch({ body: { price: '1.37' } }, async () => {
      const result = await settleHarness({ ...options, body }).run();
      assert.equal(result.status, expected);
      assert.equal(JSON.stringify(result).includes('private'), false);
    });
  }
});

test('claim route claims through RPC and maps domain failures', async () => {
  const body = { predictionId };

  assert.equal((await claimHarness({ body: { predictionId: 'bad-id' } }).run()).status, 400);

  const h = claimHarness({
    body,
    data: {
      balance: '1220',
      reward: '200',
      replayed: false,
      prediction: { id: predictionId, status: 'claimed' },
    },
  });
  const result = await h.run();
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    authenticated: true,
    wallet,
    chainId: 5042002,
    balance: '1220',
    reward: '200',
    prediction: { id: predictionId, status: 'claimed' },
    replayed: false,
  });
  assert.deepEqual(h.calls, [{
    name: 'predarc_claim_prediction_v1',
    args: { p_session_hash: 'a'.repeat(64), p_prediction_id: predictionId },
  }]);

  for (const [options, expected] of [
    [{ error: { code: '28000', message: 'AUTH_REQUIRED private' } }, 401],
    [{ error: { code: 'P0001', message: 'PREDICTION_NOT_FOUND private' } }, 404],
    [{ error: { code: 'P0001', message: 'PREDICTION_NOT_SETTLED private' } }, 409],
    [{ error: { code: 'P0001', message: 'PREDICTION_NOT_WON private' } }, 409],
    [{ error: { code: 'PGRST202', message: 'private database detail' } }, 503],
    [{ throwRpc: true }, 503],
    [{ data: { balance: '1220', reward: 200, prediction: { id: predictionId } } }, 503],
  ]) {
    const claimResult = await claimHarness({ ...options, body }).run();
    assert.equal(claimResult.status, expected);
    assert.equal(JSON.stringify(claimResult).includes('private'), false);
  }
});
