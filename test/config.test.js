const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getKraConfig, credentialNames, validateProductionConfig } = require('../src/config/kra');
test('sandbox remains compatible and production requires an explicit origin', () => {
  assert.equal(getKraConfig({}).baseURL, 'https://sbx.kra.go.ke');
  assert.equal(credentialNames('TCC', {}).key, 'KRA_TCC_CONSUMER_KEY');
  assert.throws(() => getKraConfig({ KRA_ENV: 'prod' }), /KRA_ENV/);
  assert.throws(() => getKraConfig({ KRA_ENV: 'production', KRA_BASE_URL: 'https://sbx.kra.go.ke' }), /KRA_PRODUCTION_BASE_URL/);
  for (const url of ['http://example.com', 'https://user:secret@example.com', 'https://example.com/path', 'https://sbx.kra.go.ke']) {
    assert.throws(() => getKraConfig({ KRA_ENV: 'production', KRA_PRODUCTION_BASE_URL: url }));
  }
});
test('production configuration shares credentials and checks all services', () => {
  const env = { KRA_ENV: 'production', KRA_PRODUCTION_BASE_URL: 'https://production.example.com', GATEWAY_CLIENT_KEY: 'client', GATEWAY_CLIENT_SECRET: 's'.repeat(32) };
  assert.throws(() => validateProductionConfig(env), /KRA_PIN_BY_PIN_CONSUMER_KEY/);
  for (const service of ['PIN_BY_PIN', 'PIN_BY_ID', 'TCC']) {
    const names = credentialNames(service, env);
    assert.equal(names.key, `KRA_${service}_CONSUMER_KEY`);
    env[names.key] = 'key'; env[names.secret] = 'secret';
  }
  assert.doesNotThrow(() => validateProductionConfig(env));
  env.KRA_TCC_CONSUMER_SECRET = '';
  assert.throws(() => validateProductionConfig(env), /KRA_TCC_CONSUMER_SECRET/);
});
