const DEFAULT_ENDPOINT = 'https://validator5.addressdoctor.com/webservice5/v2/addressvalidation.asmx';

export function loadConfig(env = {}) {
  const missing = ['ADDRESS_DOCTOR_LOGIN', 'ADDRESS_DOCTOR_PASSWORD']
    .filter((key) => !env[key]);
  if (missing.length) {
    throw new Error(`missing required secret(s): ${missing.join(', ')}`);
  }

  const timeoutMs = Number.parseInt(env.ADDRESS_DOCTOR_TIMEOUT_MS || '5000', 10);
  const maxResultCount = Number.parseInt(env.ADDRESS_DOCTOR_MAX_RESULT_COUNT || '0', 10);

  return {
    endpoint: env.ADDRESS_DOCTOR_ENDPOINT || DEFAULT_ENDPOINT,
    login: env.ADDRESS_DOCTOR_LOGIN,
    password: env.ADDRESS_DOCTOR_PASSWORD,
    jobToken: env.ADDRESS_DOCTOR_JOB_TOKEN || '',
    processMode: env.ADDRESS_DOCTOR_PROCESS_MODE || 'INTERACTIVE',
    defaultCountryISO3: env.ADDRESS_DOCTOR_DEFAULT_COUNTRY_ISO3 || 'USA',
    countryType: env.ADDRESS_DOCTOR_COUNTRY_TYPE || 'ISO2',
    matchingScope: env.ADDRESS_DOCTOR_MATCHING_SCOPE || 'DELIVERYPOINT_LEVEL',
    transactionPool: env.ADDRESS_DOCTOR_TRANSACTION_POOL || 'PRODUCTION',
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 5000,
    maxResultCount: Number.isFinite(maxResultCount) && maxResultCount >= 0 ? maxResultCount : 0,
  };
}
