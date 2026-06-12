export function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function tag(name, value) {
  if (value === undefined || value === null || value === '') return '';
  return `<${name}>${escapeXml(value)}</${name}>`;
}

export function stringsTag(name, values) {
  const arr = Array.isArray(values) ? values : [values];
  const strings = arr.filter((value) => value !== undefined && value !== null && value !== '')
    .map((value) => `<string>${escapeXml(value)}</string>`).join('');
  return strings ? `<${name}>${strings}</${name}>` : '';
}

export function parseAddressLines(address) {
  const lines = Array.isArray(address.addressLines) ? address.addressLines.filter(Boolean) : [];
  return {
    addressComplete: lines.join(';'),
    street: lines[0] || '',
    localityLine: lines[lines.length - 1] || '',
  };
}

export function addressXml(address) {
  const components = address.components || {};
  const parsed = parseAddressLines(address);
  const country = components.country || address.regionCode || '';
  return [
    stringsTag('Street', components.street || parsed.street),
    stringsTag('SubBuilding', components.addressLine2),
    stringsTag('Locality', components.locality),
    stringsTag('PostalCode', components.postalCode),
    stringsTag('Province', components.province),
    stringsTag('Country', country),
    tag('AddressComplete', parsed.addressComplete || parsed.localityLine),
  ].join('');
}

export function buildSoapEnvelope(address, config) {
  const serviceParameters = config.jobToken
    ? `<ServiceParameters>${tag('JobToken', config.jobToken)}</ServiceParameters>`
    : '';
  return `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">` +
    `<soap:Body>` +
    `<Process xmlns="http://validator5.AddressDoctor.com/Webservice5/v2">` +
    tag('login', config.login) +
    tag('password', config.password) +
    `<parameters>` +
    tag('ProcessMode', config.processMode) +
    serviceParameters +
    `<ValidationParameters>` +
    tag('DefaultCountryISO3', config.defaultCountryISO3) +
    tag('CountryType', config.countryType) +
    tag('StreetWithNumber', 'true') +
    tag('FormatWithCountry', 'false') +
    tag('ElementAbbreviation', 'false') +
    tag('GlobalCasing', 'MIXED') +
    tag('GlobalMaxLength', '0') +
    tag('GlobalPreferredDescriptor', 'SHORT') +
    tag('MatchingScope', 'DELIVERYPOINT_LEVEL') +
    tag('MaxResultCount', config.maxResultCount) +
    tag('DualAddressPriority', 'DELIVERY_SERVICE') +
    tag('StandardizeInvalidAddresses', 'true') +
    tag('RangesToExpand', 'ALL') +
    tag('FlexibleRangeExpansion', 'false') +
    tag('MatchingAlternatives', 'ALL') +
    tag('MatchingExtendedArchive', 'false') +
    tag('FormatMaxLines', '0') +
    `</ValidationParameters>` +
    `</parameters>` +
    `<addresses><Address>${addressXml(address)}</Address></addresses>` +
    `</Process>` +
    `</soap:Body>` +
    `</soap:Envelope>`;
}

export async function callAddressDoctor(address, config, fetchImpl = fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetchImpl(config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: '"http://validator5.AddressDoctor.com/Webservice5/v2/Process"',
      },
      body: buildSoapEnvelope(address, config),
      signal: controller.signal,
    });
    const text = await response.text();
    clearTimeout(timeout);
    return { ok: response.ok, status: response.status, text };
  } catch (error) {
    clearTimeout(timeout);
    if (error?.name === 'AbortError') return { timeout: true, status: 504, text: '' };
    throw error;
  }
}
