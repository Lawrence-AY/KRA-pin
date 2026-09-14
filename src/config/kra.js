function getKraConfig(env = process.env) {
  const environment = env.KRA_ENV || 'sandbox';
  if (!['sandbox', 'production'].includes(environment)) throw new Error('KRA_ENV must be sandbox or production');
  const baseURL = environment === 'production' ? env.KRA_PRODUCTION_BASE_URL : (env.KRA_SANDBOX_BASE_URL || env.KRA_BASE_URL || 'https://sbx.kra.go.ke');
  if (!baseURL) throw new Error('Set KRA_PRODUCTION_BASE_URL to the HTTPS origin confirmed by KRA');
  let url;
  try { url = new URL(baseURL); } catch { throw new Error('KRA base URL must be a valid HTTPS origin'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('KRA base URL must be an HTTPS origin without credentials, path, query, or fragment');
  if (environment === 'production' && /(^|[.-])(sbx|sandbox)([.-]|$)/i.test(url.hostname)) throw new Error('Production cannot use a sandbox KRA host');
  return { environment, baseURL: url.origin };
}
function credentialNames(appName, env = process.env) {
  const prefix = 'KRA_';
  return { key: `${prefix}${appName}_CONSUMER_KEY`, secret: `${prefix}${appName}_CONSUMER_SECRET` };
}
function validateProductionConfig(env = process.env) {
  if (getKraConfig(env).environment !== 'production') return;
  const required = ['GATEWAY_CLIENT_KEY', 'GATEWAY_CLIENT_SECRET'];
  for (const app of ['PIN_BY_PIN', 'PIN_BY_ID', 'TCC']) required.push(...Object.values(credentialNames(app, env)));
  const missing = required.filter(name => !env[name]?.trim() || /^(YOUR_|REPLACE_|TODO|<)/i.test(env[name].trim()));
  if (missing.length) throw new Error(`Missing production configuration: ${missing.join(', ')}`);
  if (env.GATEWAY_CLIENT_SECRET.length < 32) throw new Error('Production GATEWAY_CLIENT_SECRET must contain at least 32 characters');
}
module.exports = { getKraConfig, credentialNames, validateProductionConfig };
