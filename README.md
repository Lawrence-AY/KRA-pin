# KRA API Gateway

For the full integration flow, field definitions, confirmed response examples, and troubleshooting, see the [KRA API Integration Guide](docs/KRA-API-Integration-Guide.md).

Create one gateway session and reuse its token for PIN, taxpayer ID, and TCC searches. The gateway uses each service's KRA credentials internally; clients receive a gateway token, not a KRA access token.

## Environment configuration

The `.env` configuration includes both environments:

```env
KRA_ENV=sandbox
KRA_BASE_URL=https://sbx.kra.go.ke
KRA_PRODUCTION_BASE_URL=https://api.kra.go.ke
```

To go live, set `KRA_ENV=production` and restart the server. To return to sandbox, set `KRA_ENV=sandbox` and restart. Store only the origin in these URL values, without an API path. `KRA_SANDBOX_BASE_URL`, if set, overrides the legacy sandbox setting `KRA_BASE_URL`.

Both environments use the same configured credential pairs:

- `KRA_PIN_BY_PIN_CONSUMER_KEY` and `KRA_PIN_BY_PIN_CONSUMER_SECRET`
- `KRA_PIN_BY_ID_CONSUMER_KEY` and `KRA_PIN_BY_ID_CONSUMER_SECRET`
- `KRA_TCC_CONSUMER_KEY` and `KRA_TCC_CONSUMER_SECRET`

Clients authenticate with `GATEWAY_CLIENT_KEY` and `GATEWAY_CLIENT_SECRET`. Keep `.env` private. Production startup checks that all credentials are configured, the gateway secret has at least 32 characters, and the upstream URL is HTTPS and is not a sandbox host.

Install with `npm.cmd install`. Start development with `npm.cmd run dev`, or use `npm.cmd start` for deployment. Set `NODE_ENV=production` in the production deployment and serve the gateway behind HTTPS.

## Postman endpoints and payloads

For local testing, use `http://localhost:3000` (or your configured `PORT`). After deploying, replace this origin with your gateway's public HTTPS origin. Changing `KRA_ENV` changes the upstream destination; the gateway routes and request bodies stay the same.

For every POST request, select **Body > raw > JSON**, which sets `Content-Type: application/json`.

### 1. Create a session

**POST** `http://localhost:3000/api/kra/session`

Select **Authorization > No Auth**. Copy the values from your `.env` into this body:

```json
{
  "key": "<GATEWAY_CLIENT_KEY>",
  "secret": "<GATEWAY_CLIENT_SECRET>"
}
```

Successful response:

```json
{
  "token": "<gateway-session-token>",
  "tokenType": "Bearer",
  "expiresIn": 3600,
  "services": ["pin", "pin-by-id", "tcc"]
}
```

For all searches below, select **Authorization > Bearer Token** and paste only the returned `token` value, without quotes or the word `Bearer`. Postman sends:

```http
Authorization: Bearer <gateway-session-token>
Content-Type: application/json
```

No service selection is needed at login. Sessions last one hour; create another when yours expires. Rotating either gateway credential invalidates existing sessions. Session creation authenticates locally and does not confirm KRA connectivity or API permissions.

### 2. Search by PIN

**POST** `http://localhost:3000/api/kra/pin-by-pin`

```json
{
  "KRAPIN": "A744610021G"
}
```

**POST** `http://localhost:3000/api/kra/pin` is an alias with the same payload and authorization.

### 3. Search by taxpayer ID

**POST** `http://localhost:3000/api/kra/pin-by-id`

```json
{
  "TaxpayerType": "KE",
  "TaxpayerID": "41789723"
}
```

Keep IDs as strings to preserve leading zeros and letters.

### 4. Validate a Tax Compliance Certificate

**POST** `http://localhost:3000/api/kra/tcc`

```json
{
  "kraPIN": "A948312567Q",
  "tccNumber": "K92OR548W43A21N9"
}
```

Field names are case-sensitive: PIN lookup uses `KRAPIN`; TCC uses `kraPIN`. The identifiers above are samples; replace them with the details you intend to check. Inspect KRA's response fields as well as HTTP status: HTTP 200 can contain a negative business result.

### 5. Health check

**GET** `http://localhost:3000/health`

No authorization or body is required. This checks the gateway process, not KRA availability.

## Upstream endpoint mapping

These are the destinations constructed by the gateway. Clients should call the gateway routes above using their gateway session token. The gateway obtains a separate KRA token internally for each service.

| Gateway route (POST) | Sandbox destination (POST) | Production destination (POST) |
| --- | --- | --- |
| `/api/kra/pin-by-pin` or `/api/kra/pin` | `https://sbx.kra.go.ke/checker/v1/pinbypin` | `https://api.kra.go.ke/checker/v1/pinbypin` |
| `/api/kra/pin-by-id` | `https://sbx.kra.go.ke/checker/v1/pin` | `https://api.kra.go.ke/checker/v1/pin` |
| `/api/kra/tcc` | `https://sbx.kra.go.ke/v1/kra-tcc/validate` | `https://api.kra.go.ke/v1/kra-tcc/validate` |

The configured KRA token exchange is **GET** `/v1/token/generate?grant_type=client_credentials` on the selected upstream origin, using HTTP Basic authentication with the matching KRA key and secret. Search requests use that KRA token internally. Do not send your gateway session token directly to KRA.

The production TCC URL above is the endpoint supplied for this project. Production connectivity and API permissions have not been tested; the table documents configured routing rather than verified live availability.

## Errors and verification

- `400`: missing or invalid request fields.
- `401` with a gateway authentication message: invalid credentials or invalid/expired gateway session.
- `KRA_CREDENTIALS_REJECTED` (`401`): KRA rejected the indicated service's credentials. Check the named environment variables and restart after editing `.env`.
- `KRA_CREDENTIALS_MISSING` (`503`): required KRA service credentials are missing.
- `KRA_API_PRODUCT_MISMATCH` (`403`): the KRA app lacks access to the requested API product.
- `KRA_INVALID_TOKEN_RESPONSE` (`502`): token exchange returned no access token.
- `KRA_UNAVAILABLE` (`502`) or `KRA_TIMEOUT` (`504`): connection or timeout failure.

Run `npm.cmd test` for local integration tests with mocked KRA transport. Run `node scripts/smoke-sandbox.js` for real sandbox requests using the credentials and sample identifiers in the script. The smoke test starts a temporary local instance, tests all routes, and prints status/result codes without tokens, secrets, or taxpayer names. It refuses production mode and exits unsuccessfully on HTTP failures.

Helmet, no-store response headers, a 10 KB JSON limit, and a per-IP limit of 100 requests per minute are enabled. CORS is disabled. The IP rate limiter and KRA token cache are per-process; configure deployment proxy behavior and shared rate limiting as needed before scaling. There is no individual session revocation endpoint.
