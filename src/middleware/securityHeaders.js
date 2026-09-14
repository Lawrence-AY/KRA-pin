function secureHeaders(req, res, next) {
  res.set({
    'Cache-Control': 'no-store',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Referrer-Policy': 'no-referrer'
  });
  return next();
}

module.exports = { secureHeaders };
