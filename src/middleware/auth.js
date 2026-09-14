const { verifySession } = require('../services/gatewaySession');
function requireBearerToken(req, res, next) {
  const match = (req.get('authorization') || '').match(/^Bearer[ \t]+([A-Za-z0-9._-]+)$/i);
  if (!match || !verifySession(match[1])) {
    res.set('WWW-Authenticate', 'Bearer');
    return res.status(401).json({ message: 'Use a valid, unexpired gateway session: Authorization: Bearer <token>' });
  }
  return next();
}
module.exports = { requireBearerToken };
