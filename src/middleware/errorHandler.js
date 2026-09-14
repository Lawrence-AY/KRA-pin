function notFoundHandler(req, res) {
  return res.status(404).json({ message: 'Route not found' });
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  if (error.expose === true && error.code?.startsWith('KRA_')) {
    return res.status(error.status).json({
      code: error.code,
      message: error.message,
      ...(error.fault ? { fault: error.fault } : {})
    });
  }

  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Request body must be valid JSON' });
  }

  if (error.type === 'entity.too.large') {
    return res.status(413).json({ message: 'Request body exceeds the 10 KB limit' });
  }

  if (error.request && !error.response) {
    const timeout = ['ECONNABORTED', 'ETIMEDOUT'].includes(error.code);
    return res.status(timeout ? 504 : 502).json({
      code: timeout ? 'KRA_TIMEOUT' : 'KRA_UNAVAILABLE',
      message: timeout ? 'KRA did not respond within the timeout. Try again later.'
        : 'Unable to connect to KRA. Check connectivity and KRA_BASE_URL.'
    });
  }

  const upstreamStatus = error.response?.status;
  const requestStatus = error.status || error.statusCode;
  const isUpstreamError = Boolean(error.response || error.request);
  const status = isUpstreamError
    ? (upstreamStatus >= 400 && upstreamStatus < 500 ? upstreamStatus : 502)
    : (requestStatus >= 400 && requestStatus < 500 ? requestStatus : 500);
  const upstreamData = error.response?.data;
  const data = isUpstreamError && upstreamData && typeof upstreamData === 'object'
    ? upstreamData
    : { message: status === 500 ? 'Internal server error' : 'Request failed' };

  if (!isUpstreamError && status === 500) {
    console.error(error);
  }

  return res.status(status).json(data);
}

module.exports = { errorHandler, notFoundHandler };
