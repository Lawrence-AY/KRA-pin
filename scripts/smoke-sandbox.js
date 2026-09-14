require('dotenv').config();
if ((process.env.KRA_ENV || 'sandbox') !== 'sandbox') throw new Error('Sample smoke test is sandbox-only');
const app = require('../src/app');
(async () => {
  const server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  async function post(path, body, token) {
    const response = await fetch(base + '/api/kra/' + path, { method: 'POST', headers: {
      'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {})
    }, body: JSON.stringify(body) });
    return { status: response.status, data: await response.json() };
  }
  try {
    console.log('health', (await fetch(base + '/health')).status);
    const session = await post('session', { key: process.env.GATEWAY_CLIENT_KEY, secret: process.env.GATEWAY_CLIENT_SECRET });
    console.log('session', session.status);
    if (!session.data.token) { process.exitCode = 1; return; }
    for (const [route, body] of [
      ['pin', { KRAPIN: 'A744610021G' }], ['pin-by-pin', { KRAPIN: 'A744610021G' }],
      ['pin-by-id', { TaxpayerType: 'KE', TaxpayerID: '41789723' }],
      ['tcc', { kraPIN: 'A948312567Q', tccNumber: 'K92OR548W43A21N9' }]
    ]) {
      const r = await post(route, body, session.data.token);
      console.log(JSON.stringify({ route, status: r.status, code: r.data.code || r.data.ResponseCode || r.data.ErrorCode, message: r.data.message || r.data.Message || r.data.ErrorMessage, hasPIN: Boolean(r.data.TaxpayerPIN || r.data.PINDATA) }));
      if (r.status !== 200) process.exitCode = 1;
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
})().catch(() => { console.error('Smoke test failed; check configuration and connectivity.'); process.exitCode = 1; });
