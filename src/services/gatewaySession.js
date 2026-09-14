const crypto = require('crypto');
const services = ['pin', 'pin-by-id', 'tcc'];
function equal(a, b) {
  return crypto.timingSafeEqual(crypto.createHash('sha256').update(a).digest(), crypto.createHash('sha256').update(b).digest());
}
function credentials() {
  const key = process.env.GATEWAY_CLIENT_KEY;
  const secret = process.env.GATEWAY_CLIENT_SECRET;
  if (!key || !secret) return null;
  return { key, secret };
}
function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}
function createGatewaySession() {
  const { key, secret } = credentials();
  const expiresIn = 3600;
  const payload = Buffer.from(JSON.stringify({ sub: key, exp: Math.floor(Date.now() / 1000) + expiresIn, nonce: crypto.randomBytes(24).toString('hex') })).toString('base64url');
  return { token: `${payload}.${sign(payload, secret)}`, tokenType: 'Bearer', expiresIn, services };
}
function verifySession(token) {
  const configured = credentials();
  if (!configured || typeof token !== 'string' || token.length > 4096) return false;
  const parts = token.split('.');
  if (parts.length !== 2 || !equal(sign(parts[0], configured.secret), parts[1])) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    return payload.sub === configured.key && Number.isInteger(payload.exp) && payload.exp > Math.floor(Date.now() / 1000);
  } catch { return false; }
}
module.exports = { credentials, equal, createGatewaySession, verifySession };
