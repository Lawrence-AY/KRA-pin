const axios = require('axios');
const crypto = require('crypto');
const { getKraConfig, credentialNames } = require('../config/kra');

const kra = axios.create({
  baseURL: getKraConfig().baseURL,
  timeout: 15000,
  maxRedirects: 0,
  headers: { 'Content-Type': 'application/json' }
});

const tokenCache = new Map();
const serviceNames = { PIN_BY_PIN: 'pin', PIN_BY_ID: 'pin-by-id', TCC: 'tcc' };

function gatewayError(status, code, message) {
  return Object.assign(new Error(message), { status, code, expose: true });
}
const endpointConfig = {
  PIN_BY_PIN: {
    appName: 'PIN_BY_PIN',
    path: '/checker/v1/pinbypin'
  },
  PIN_BY_ID: {
    appName: 'PIN_BY_ID',
    path: '/checker/v1/pin'
  },
  TCC: {
    appName: 'TCC',
    path: '/v1/kra-tcc/validate'
  }
};

function normalizeCredentials(credentials) {
  const key = credentials?.key ?? credentials?.consumerKey ?? credentials?.CONSUMER_KEY;
  const secret = credentials?.secret ?? credentials?.consumerSecret ?? credentials?.CONSUMER_SECRET;

  if (typeof key !== 'string' || typeof secret !== 'string' || !key.trim() || !secret.trim()) {
    throw new Error('Consumer key and consumer secret are required');
  }

  return { key: key.trim(), secret: secret.trim() };
}

function getAppCredentials(appName, credentials) {
  if (credentials) {
    return normalizeCredentials(credentials);
  }

  const names = credentialNames(appName);
  const key = process.env[names.key];
  const secret = process.env[names.secret];

  if (!key?.trim() || !secret?.trim()
    || [key, secret].some(value => /^(YOUR_|REPLACE_|TODO|<)/i.test(value.trim()))) {
    throw gatewayError(503, 'KRA_CREDENTIALS_MISSING', `Configure ${names.key} and ${names.secret} for service ${serviceNames[appName]}.`);
  }

  return normalizeCredentials({ key, secret });
}

function getCacheKey(appName, credentials) {
  const credentialHash = crypto
    .createHash('sha256')
    .update(`${credentials.key}\0${credentials.secret}`)
    .digest('hex');

  return `${appName}:${credentialHash}`;
}

async function getAccessToken(appName, credentials) {
  const resolvedCredentials = getAppCredentials(appName, credentials);
  const cacheKey = getCacheKey(appName, resolvedCredentials);
  const cached = tokenCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.value;
  }

  const basicCredentials = Buffer.from(
    `${resolvedCredentials.key}:${resolvedCredentials.secret}`
  ).toString('base64');

  let response;
  try {
    response = await kra.get('/v1/token/generate', {
      params: { grant_type: 'client_credentials' },
      headers: { Authorization: `Basic ${basicCredentials}` }
    });
  } catch (error) {
    if ([400, 401, 403].includes(error.response?.status)) {
      throw gatewayError(401, 'KRA_CREDENTIALS_REJECTED', `KRA rejected the credentials for service ${serviceNames[appName]}. Check ${credentialNames(appName).key} and ${credentialNames(appName).secret} in .env for the configured KRA environment, then restart the gateway. Creating another gateway session will not fix upstream credentials.`);
    }
    throw error;
  }

  const accessToken = response.data?.access_token || response.data?.token;
  if (typeof accessToken !== 'string' || !accessToken) {
    throw gatewayError(502, 'KRA_INVALID_TOKEN_RESPONSE', 'KRA token response did not include an access token.');
  }

  const expiresIn = Number(response.data?.expires_in);
  const cacheTtl = Number.isFinite(expiresIn) && expiresIn > 0
    ? Math.max(expiresIn - 60, 1)
    : 3540;
  const cachedToken = {
    value: accessToken,
    expiresAt: Date.now() + cacheTtl * 1000
  };
  for (const [key, entry] of tokenCache) {
    if (entry.expiresAt <= Date.now()) tokenCache.delete(key);
  }
  tokenCache.set(cacheKey, cachedToken);
  return cachedToken.value;
}

async function postToKra(endpointName, payload) {
  const endpoint = endpointConfig[endpointName];
  const accessToken = await getAccessToken(endpoint.appName);

  try {
    return await kra.post(endpoint.path, payload, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
  } catch (error) {
    if (error.response?.data?.fault?.detail?.errorcode?.endsWith('InvalidAPICallAsNoApiProductMatchFound')) {
      const mismatch = gatewayError(403, 'KRA_API_PRODUCT_MISMATCH', `KRA does not authorize this token for POST ${endpoint.path}. Confirm the app has an approved API product covering this path and environment in the KRA portal. The gateway uses the configured credentials for this service.`);
      mismatch.fault = error.response.data.fault;
      throw mismatch;
    }

    const fault = error.response?.data?.fault;
    const errorCode = fault?.detail?.errorcode || fault?.faultcode;
    if (errorCode === 'messaging.adaptors.http.flow.UnexpectedEOFAtTarget' || fault?.faultstring?.includes('Unexpected EOF')) {
      throw gatewayError(502, 'KRA_UPSTREAM_UNAVAILABLE', 'KRA API gateway could not reach the upstream service. This is a temporary KRA infrastructure issue. Please retry later.');
    }

    throw error;
  }
}

async function validatePinByPin(kraPIN) {
  const response = await postToKra('PIN_BY_PIN', { KRAPIN: kraPIN });
  return response.data;
}

async function validatePinById(taxpayerType, taxpayerId) {
  const response = await postToKra('PIN_BY_ID', {
    TaxpayerType: taxpayerType,
    TaxpayerID: taxpayerId
  });
  return response.data;
}

async function validateTcc(kraPIN, tccNumber) {
  const response = await postToKra('TCC', { kraPIN, tccNumber });
  return response.data;
}

module.exports = {
  validatePinByPin,
  validatePinById,
  validateTcc
};
