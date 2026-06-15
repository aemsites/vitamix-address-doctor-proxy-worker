function decodeXml(value = '') {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

function first(xml, name) {
  const match = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return match ? decodeXml(match[1].trim()) : null;
}

function block(xml, name) {
  const match = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return match ? match[1] : '';
}

function strings(addressXml, name) {
  const section = block(addressXml, name);
  if (!section) return [];
  return [...section.matchAll(/<string(?:\s[^>]*)?>([\s\S]*?)<\/string>/gi)]
    .map((match) => decodeXml(match[1].trim()))
    .filter((value) => value !== '');
}

function numberValue(value) {
  if (value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stripHouseNumber(street, houseNumber) {
  if (!street || !houseNumber) return street || '';
  const trimmed = street.trim();
  const house = houseNumber.trim();
  if (trimmed.toLowerCase() === house.toLowerCase()) return '';
  if (trimmed.toLowerCase().startsWith(`${house.toLowerCase()} `)) {
    return trimmed.slice(house.length).trim();
  }
  return trimmed;
}

function component(longText, shortText, type) {
  if (!longText && !shortText) return null;
  return { longText: longText || shortText, shortText: shortText || longText, types: [type] };
}

function buildComponents(addressXml) {
  const street = strings(addressXml, 'Street')[0] || '';
  const houseNumber = strings(addressXml, 'HouseNumber')[0] || '';
  const route = stripHouseNumber(street, houseNumber);
  const subBuilding = strings(addressXml, 'SubBuilding')[0] || '';
  const locality = strings(addressXml, 'Locality')[0] || '';
  const postalCode = strings(addressXml, 'PostalCode')[0] || '';
  const provinces = strings(addressXml, 'Province');
  const country = strings(addressXml, 'Country')[0] || '';

  return [
    component(houseNumber, houseNumber, 'street_number'),
    component(route, route, 'route'),
    component(subBuilding, subBuilding, 'subpremise'),
    component(locality, locality, 'locality'),
    component(provinces[1] || provinces[0] || '', provinces[0] || provinces[1] || '', 'administrative_area_level_1'),
    component(postalCode, postalCode, 'postal_code'),
    component(country, country, 'country'),
  ].filter(Boolean);
}

function formattedAddress(addressXml) {
  const formatted = strings(addressXml, 'FormattedAddress');
  if (formatted.length) return formatted.join(', ');
  const complete = first(addressXml, 'AddressComplete');
  return complete ? complete.replaceAll(';', ', ') : null;
}

function actionFor(processStatus, mailabilityScore, resultPercentage, components, formatted) {
  const category = processStatus?.[0] || '';
  if (['N', 'W'].includes(category)) return 'FIX';
  if (category === 'I') {
    return formatted && components.length ? 'CONFIRM' : 'CONFIRM_UNVALIDATED';
  }
  if (!formatted || !components.length) return 'FIX';
  if (category === 'V' && processStatus === 'V4' && resultPercentage >= 99) return 'ACCEPT';
  if (['V', 'C', 'Q'].includes(category) && mailabilityScore >= 2) return 'CONFIRM';
  return 'FIX';
}

export function normalizeAddressDoctorResponse(xml) {
  const result = block(xml, 'ProcessResult');
  if (!result) throw new Error('missing ProcessResult');

  const statusCode = numberValue(first(result, 'StatusCode'));
  const statusMessage = first(result, 'StatusMessage');
  const processStatus = first(result, 'ProcessStatus');
  const countryISO3 = first(result, 'CountryISO3');
  const resultData = block(result, 'ResultData');
  const address = block(resultData, 'Address');
  const mailabilityScore = numberValue(first(resultData, 'MailabilityScore')) ?? 0;
  const resultPercentage = numberValue(first(resultData, 'ResultPercentage')) ?? 0;
  const components = buildComponents(address);
  const formatted = formattedAddress(address);
  const action = actionFor(processStatus, mailabilityScore, resultPercentage, components, formatted);

  const unvalidated = action === 'CONFIRM_UNVALIDATED';

  return {
    provider: 'addressdoctor',
    action,
    formattedAddress: unvalidated ? null : formatted,
    addressComponents: unvalidated ? null : (components.length ? components : null),
    uspsDeliverable: unvalidated ? false : mailabilityScore >= 4,
    diagnostics: {
      statusCode,
      statusMessage,
      processStatus,
      countryISO3,
      mailabilityScore,
      resultPercentage,
      addressType: first(resultData, 'AddressType'),
      elementInputStatus: first(resultData, 'ElementInputStatus'),
      elementResultStatus: first(resultData, 'ElementResultStatus'),
      elementRelevance: first(resultData, 'ElementRelevance'),
      extElementStatus: first(resultData, 'ExtElementStatus'),
      addressResolutionCode: first(resultData, 'AddressResolutionCode'),
    },
  };
}

export const testInternals = {
  decodeXml,
  first,
  block,
  strings,
  numberValue,
  stripHouseNumber,
  actionFor,
  component,
};
