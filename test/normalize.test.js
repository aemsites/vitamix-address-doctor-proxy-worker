import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { normalizeAddressDoctorResponse, testInternals } from '../src/normalize.js';

const fixture = readFileSync(new URL('./fixtures/process-response-ok.xml', import.meta.url), 'utf8');

test('normalizes sample I3 response to CONFIRM with Google-compatible components', () => {
  const result = normalizeAddressDoctorResponse(fixture);
  assert.equal(result.provider, 'addressdoctor');
  assert.equal(result.action, 'CONFIRM');
  assert.equal(result.formattedAddress, '100 Park St, New York NY 10013-4312');
  assert.equal(result.uspsDeliverable, true);
  assert.deepEqual(result.addressComponents, [
    { longText: '100', shortText: '100', types: ['street_number'] },
    { longText: 'Park St', shortText: 'Park St', types: ['route'] },
    { longText: 'New York', shortText: 'New York', types: ['locality'] },
    { longText: 'New York', shortText: 'NY', types: ['administrative_area_level_1'] },
    { longText: '10013-4312', shortText: '10013-4312', types: ['postal_code'] },
    { longText: 'US', shortText: 'US', types: ['country'] },
  ]);
  assert.deepEqual(result.diagnostics, {
    statusCode: 100,
    statusMessage: 'OK',
    processStatus: 'I3',
    countryISO3: 'USA',
    mailabilityScore: 4,
    resultPercentage: 64.07,
    addressType: 'H',
    elementInputStatus: '40606050000000000060',
    elementResultStatus: '78F0F8E08000000000E0',
    elementRelevance: '11101010100000000010',
    extElementStatus: '00000000000000000000',
    addressResolutionCode: '00000000000000000000',
  });
});

test('throws when ProcessResult is missing', () => {
  assert.throws(() => normalizeAddressDoctorResponse('<xml/>'), /missing ProcessResult/);
});

test('falls back to AddressComplete and handles absent components', () => {
  const xml = '<ProcessResult><StatusCode>100</StatusCode><StatusMessage>OK</StatusMessage><Result><ProcessStatus>V4</ProcessStatus><ResultDataSet><ResultData><MailabilityScore>5</MailabilityScore><ResultPercentage>100</ResultPercentage><Address><AddressComplete>A;B</AddressComplete></Address></ResultData></ResultDataSet></Result></ProcessResult>';
  const result = normalizeAddressDoctorResponse(xml);
  assert.equal(result.action, 'FIX');
  assert.equal(result.formattedAddress, 'A, B');
  assert.equal(result.addressComponents, null);
});

test('returns null formattedAddress when no formatted or complete address exists', () => {
  const xml = '<ProcessResult><Result><ProcessStatus>C4</ProcessStatus><ResultDataSet><ResultData><MailabilityScore>5</MailabilityScore><ResultPercentage>90</ResultPercentage><Address><Street><string>Main St</string></Street></Address></ResultData></ResultDataSet></Result></ProcessResult>';
  const result = normalizeAddressDoctorResponse(xml);
  assert.equal(result.formattedAddress, null);
  assert.equal(result.action, 'FIX');
});

test('defaults missing numeric diagnostics to zero', () => {
  const xml = '<ProcessResult><Result><ProcessStatus>C4</ProcessStatus><ResultDataSet><ResultData><Address><Street><string>Main St</string></Street><FormattedAddress><string>Main St</string></FormattedAddress></Address></ResultData></ResultDataSet></Result></ProcessResult>';
  const result = normalizeAddressDoctorResponse(xml);
  assert.equal(result.diagnostics.mailabilityScore, 0);
  assert.equal(result.diagnostics.resultPercentage, 0);
  assert.equal(result.action, 'FIX');
});

test('maps V4 perfect match to ACCEPT', () => {
  const xml = '<ProcessResult><StatusCode>100</StatusCode><Result><ProcessStatus>V4</ProcessStatus><ResultDataSet><ResultData><MailabilityScore>5</MailabilityScore><ResultPercentage>100</ResultPercentage><Address><Street><string>Main St</string></Street><HouseNumber><string>1</string></HouseNumber><FormattedAddress><string>1 Main St</string></FormattedAddress></Address></ResultData></ResultDataSet></Result></ProcessResult>';
  assert.equal(normalizeAddressDoctorResponse(xml).action, 'ACCEPT');
});

test('maps not processed, web service, low I score, and unknown statuses to FIX', () => {
  const base = (status, score = 5) => `<ProcessResult><Result><ProcessStatus>${status}</ProcessStatus><ResultDataSet><ResultData><MailabilityScore>${score}</MailabilityScore><ResultPercentage>90</ResultPercentage><Address><Street><string>Main St</string></Street><FormattedAddress><string>Main St</string></FormattedAddress></Address></ResultData></ResultDataSet></Result></ProcessResult>`;
  assert.equal(normalizeAddressDoctorResponse(base('N1')).action, 'FIX');
  assert.equal(normalizeAddressDoctorResponse(base('W8')).action, 'FIX');
  assert.equal(normalizeAddressDoctorResponse(base('I3', 3)).action, 'FIX');
  assert.equal(normalizeAddressDoctorResponse(base('Z9')).action, 'FIX');
});

test('maps corrected and suggestion statuses to CONFIRM when deliverability is fair or better', () => {
  const base = (status) => `<ProcessResult><Result><ProcessStatus>${status}</ProcessStatus><ResultDataSet><ResultData><MailabilityScore>2</MailabilityScore><ResultPercentage>80</ResultPercentage><Address><Street><string>Main St</string></Street><FormattedAddress><string>Main St</string></FormattedAddress></Address></ResultData></ResultDataSet></Result></ProcessResult>`;
  assert.equal(normalizeAddressDoctorResponse(base('C4')).action, 'CONFIRM');
  assert.equal(normalizeAddressDoctorResponse(base('Q3')).action, 'CONFIRM');
});

test('test internals cover XML helpers and edge cases', () => {
  const { actionFor, block, component, decodeXml, first, numberValue, stripHouseNumber, strings } = testInternals;
  assert.equal(decodeXml('&lt;&gt;&quot;&apos;&amp;'), '<>"\'&');
  assert.equal(first('<A x="1"> hi&amp;bye </A>', 'A'), 'hi&bye');
  assert.equal(first('<B/>', 'A'), null);
  assert.equal(block('<A>inside</A>', 'A'), 'inside');
  assert.equal(block('<B/>', 'A'), '');
  assert.deepEqual(strings('<X><string> a </string><string></string></X>', 'X'), ['a']);
  assert.deepEqual(strings('<Y/>', 'X'), []);
  assert.equal(numberValue(null), null);
  assert.equal(numberValue(''), null);
  assert.equal(numberValue('x'), null);
  assert.equal(numberValue('4.2'), 4.2);
  assert.equal(stripHouseNumber('', '100'), '');
  assert.equal(stripHouseNumber('100', '100'), '');
  assert.equal(stripHouseNumber('Park St', '100'), 'Park St');
  assert.equal(actionFor('V3', 5, 100, [{ types: ['route'] }], 'Main St'), 'CONFIRM');
  assert.equal(actionFor('C4', 1, 100, [{ types: ['route'] }], 'Main St'), 'FIX');
  assert.equal(actionFor(null, 5, 100, [{ types: ['route'] }], 'Main St'), 'FIX');
  assert.equal(actionFor('V4', 5, 100, [{ types: ['route'] }], null), 'FIX');
  assert.deepEqual(component('', 'short', 'country'), { longText: 'short', shortText: 'short', types: ['country'] });
  assert.deepEqual(component('long', '', 'country'), { longText: 'long', shortText: 'long', types: ['country'] });
  assert.equal(component('', '', 'country'), null);
});
