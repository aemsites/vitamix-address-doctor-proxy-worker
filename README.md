# Vitamix AddressDoctor proxy worker

Standalone Cloudflare Worker that lets Vitamix checkout call Informatica AddressDoctor without exposing AddressDoctor credentials in browser code.

## API

### `POST /places/validate`

Request:

```json
{
  "address": {
    "addressLines": ["100 Park St", "New York, NY 10005"],
    "regionCode": "US"
  }
}
```

Response:

```json
{
  "provider": "addressdoctor",
  "action": "CONFIRM",
  "formattedAddress": "100 Park St, New York NY 10013-4312",
  "addressComponents": [],
  "uspsDeliverable": true,
  "diagnostics": {}
}
```

## Secrets

Set real values only through Worker secrets:

```bash
wrangler secret put ADDRESS_DOCTOR_ENDPOINT
wrangler secret put ADDRESS_DOCTOR_LOGIN
wrangler secret put ADDRESS_DOCTOR_PASSWORD
wrangler secret put ADDRESS_DOCTOR_JOB_TOKEN
```

Do not commit real credentials or SOAP payloads containing credentials.

## Development

```bash
npm install
npm test
npm run lint
```

Tests are configured with c8 `--100` to require 100% coverage.
