const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const axios = require('axios');
process.env.GATEWAY_CLIENT_KEY = 'local-client';
process.env.GATEWAY_CLIENT_SECRET = 'local-secret';
for (const service of ['PIN_BY_PIN', 'PIN_BY_ID', 'TCC']) {
  process.env[`KRA_${service}_CONSUMER_KEY`] = service;
  process.env[`KRA_${service}_CONSUMER_SECRET`] = 'upstream-secret';
}
const calls = [];
let failure;
const originalCreate = axios.create;
axios.create = options => originalCreate({ ...options, adapter: async config => {
  calls.push(config);
  if (failure) throw failure;
  if (config.url === '/v1/token/generate') {
    const pair = Buffer.from(config.headers.Authorization.slice(6), 'base64').toString();
    assert.equal(pair.split(':')[1], 'upstream-secret');
    return { status: 200, data: { access_token: `kra-${pair.split(':')[0]}`, expires_in: 3600 } };
  }
  return { status: 200, data: { Status: 'OK', payload: JSON.parse(config.data) } };
} });
const app = require('../src/app');
axios.create = originalCreate;
let server, base, token;
before(async () => {
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise(resolve => server.close(resolve)));
async function post(path, body, bearer) {
  const response = await fetch(base + '/api/kra/' + path, { method: 'POST', headers: {
    'Content-Type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {})
  }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}
test('gateway login creates one local session without contacting KRA', async () => {
  const response = await post('session', { key: 'local-client', secret: 'local-secret' });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.services, ['pin', 'pin-by-id', 'tcc']);
  assert.equal(response.body.expiresIn, 3600);
  assert.equal(calls.length, 0);
  token = response.body.token;
  assert.ok(!JSON.stringify(response.body).includes('secret'));
});
test('one session selects the matching KRA credentials for all routes and caches upstream tokens', async () => {
  const routes = [
    ['pin', 'PIN_BY_PIN', '/checker/v1/pinbypin', { KRAPIN: 'P318295670X' }],
    ['pin-by-id', 'PIN_BY_ID', '/checker/v1/pin', { TaxpayerType: 'COMP', TaxpayerID: '0000200S4304' }],
    ['tcc', 'TCC', '/v1/kra-tcc/validate', { kraPIN: 'A948312567Q', tccNumber: 'certificate' }]
  ];
  for (let round = 0; round < 2; round++) {
    const start = calls.length;
    for (const [route, service, path, body] of routes) {
      const response = await post(route, body, token);
      assert.equal(response.status, 200);
      assert.deepEqual(response.body, { Status: 'OK', payload: body });
      assert.equal(calls.at(-1).url, path);
      assert.equal(calls.at(-1).headers.Authorization, `Bearer kra-${service}`);
    }
    assert.equal(calls.length - start, round === 0 ? 6 : 3);
  }
});
test('missing and incorrect gateway credentials cannot access configured KRA credentials', async () => {
  const count = calls.length;
  for (const body of [{}, { service: 'pin' }, { consumerKey: 'PIN_BY_PIN', consumerSecret: 'upstream-secret' }]) {
    assert.equal((await post('session', body)).status, 400);
  }
  for (const body of [{ key: 'wrong', secret: 'local-secret' }, { key: 'local-client', secret: 'wrong' }]) {
    assert.equal((await post('session', body)).status, 401);
  }
  assert.equal(calls.length, count);
});
test('arbitrary, tampered, expired, and rotated sessions are rejected before KRA', async () => {
  const payload = Buffer.from(JSON.stringify({ sub: 'local-client', exp: Math.floor(Date.now() / 1000) - 1 })).toString('base64url');
  const expired = payload + '.' + crypto.createHmac('sha256', 'local-secret').update(payload).digest('base64url');
  const count = calls.length;
  for (const bearer of [undefined, 'kra-PIN_BY_PIN', token + 'x', expired]) {
    assert.equal((await post('pin', { KRAPIN: 'P318295670X' }, bearer)).status, 401);
  }
  process.env.GATEWAY_CLIENT_SECRET = 'rotated';
  try { assert.equal((await post('pin', {}, token)).status, 401); }
  finally { process.env.GATEWAY_CLIENT_SECRET = 'local-secret'; }
  assert.equal(calls.length, count);
});
test('missing gateway and KRA configuration fail safely', async () => {
  delete process.env.GATEWAY_CLIENT_SECRET;
  try { assert.equal((await post('session', { key: 'local-client', secret: 'local-secret' })).status, 503); }
  finally { process.env.GATEWAY_CLIENT_SECRET = 'local-secret'; }
  delete process.env.KRA_TCC_CONSUMER_KEY;
  try {
    const response = await post('tcc', { kraPIN: 'A948312567Q', tccNumber: 'certificate' }, token);
    assert.equal(response.status, 503);
    assert.equal(response.body.code, 'KRA_CREDENTIALS_MISSING');
  } finally { process.env.KRA_TCC_CONSUMER_KEY = 'TCC'; }
});
test('payload validation and upstream failures remain actionable', async () => {
  assert.equal((await post('pin', {}, token)).status, 400);
  assert.equal((await post('pin-by-id', { TaxpayerType: 'KE', TaxpayerID: 123 }, token)).status, 400);
  assert.equal((await post('tcc', {}, token)).status, 400);
  try {
    failure = { response: { status: 500, data: { fault: { detail: { errorcode: 'x.InvalidAPICallAsNoApiProductMatchFound' } } } } };
    assert.equal((await post('pin', { KRAPIN: 'P318295670X' }, token)).body.code, 'KRA_API_PRODUCT_MISMATCH');
    failure = { code: 'ECONNABORTED', request: {} };
    assert.equal((await post('pin', { KRAPIN: 'P318295670X' }, token)).status, 504);
  } finally { failure = undefined; }
});
test('security headers and health endpoint', async () => {
  const response = await fetch(base + '/health');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-powered-by'), null);
});

test('pin-by-pin alias uses the same authenticated PIN lookup', async () => {
  const response = await post('pin-by-pin', { KRAPIN: 'A744610021G' }, token);
  assert.equal(response.status, 200);
  assert.equal(calls.at(-1).url, '/checker/v1/pinbypin');
  assert.equal(calls.at(-1).headers.Authorization, 'Bearer kra-PIN_BY_PIN');
  assert.equal((await post('pin-by-pin', { kraPIN: 'A744610021G', tccNumber: 'certificate' }, token)).status, 400);
});
test('credential rejection identifies the failed service without exposing secrets', async () => {
  const original = process.env.KRA_TCC_CONSUMER_KEY;
  process.env.KRA_TCC_CONSUMER_KEY = 'uncached-rejected';
  failure = { response: { status: 401, data: {} } };
  try {
    const result = await post('tcc', { kraPIN: 'A948312567Q', tccNumber: 'certificate' }, token);
    assert.equal(result.status, 401);
    assert.equal(result.body.code, 'KRA_CREDENTIALS_REJECTED');
    assert.match(result.body.message, /KRA_TCC_CONSUMER_KEY and KRA_TCC_CONSUMER_SECRET/);
    assert.ok(!JSON.stringify(result.body).includes('upstream-secret'));
  } finally { failure = undefined; process.env.KRA_TCC_CONSUMER_KEY = original; }
});
