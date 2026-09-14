const DEFAULT_WINDOW_MS = 60 * 1000;
const DEFAULT_MAX_REQUESTS = 100;
const clients = new Map();

function rateLimit(options = {}) {
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const maxRequests = options.maxRequests ?? DEFAULT_MAX_REQUESTS;

  return function limitRequests(req, res, next) {
    const now = Date.now();
    if (clients.size > 10000) {
      clients.delete(clients.keys().next().value);
    }

    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    let record = clients.get(key);

    if (!record || record.resetAt <= now) {
      record = { count: 0, resetAt: now + windowMs };
      clients.set(key, record);
    }

    record.count += 1;
    const remaining = Math.max(maxRequests - record.count, 0);
    res.set('X-RateLimit-Limit', String(maxRequests));
    res.set('X-RateLimit-Remaining', String(remaining));
    res.set('X-RateLimit-Reset', new Date(record.resetAt).toISOString());

    if (record.count > maxRequests) {
      const retryAfter = Math.ceil((record.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ message: 'Too many requests' });
    }

    return next();
  };
}

function resetRateLimitStore() {
  clients.clear();
}

module.exports = { rateLimit, resetRateLimitStore };
