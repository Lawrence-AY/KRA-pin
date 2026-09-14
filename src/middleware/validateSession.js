const { credentials, equal } = require('../services/gatewaySession');
function validateSession(req, res, next) {
  const { key, secret } = req.body || {};
  if (typeof key !== 'string' || typeof secret !== 'string' || !key.trim() || !secret.trim()) {
    return res.status(400).json({ message: 'key and secret are required (gateway client credentials)' });
  }
  const configured = credentials();
  if (!configured) return res.status(503).json({ message: 'Configure GATEWAY_CLIENT_KEY and GATEWAY_CLIENT_SECRET' });
  const validKey = equal(key, configured.key);
  const validSecret = equal(secret, configured.secret);
  if (!validKey || !validSecret) return res.status(401).json({ message: 'Invalid gateway credentials' });
  return next();
}
module.exports = { validateSession };
