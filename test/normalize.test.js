import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { normalizeAddressDoctorResponse, testInternals } from '../src/normalize.js';

const fixture = readFileSync(new URL('./fixtures/process-response-ok.xml', import.meta.url), 'utf8');

test('normalizes sample single-result I3 response to CONFIRM_UNVALIDATED', () => {
  const result = normalizeAddressDoctorResponse(fixture);
  assert.equal(result.provider, 'addressdoctor');
  assert.equal(result.action, 'CONFIRM_UNVALIDATED');
  assert.equal(result.formattedAddress, null);
  assert.equal(result.uspsDeliverable, false);
  assert.equal(result.addressComponents, null);
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

test('maps I2 invalid results without suggestions to CONFIRM_UNVALIDATED', () => {
  const xml = '<ProcessResult><StatusCode>100</StatusCode><StatusMessage>OK</StatusMessage><Result><ProcessStatus>I2</ProcessStatus><ResultDataSet><ResultData><MailabilityScore>0</MailabilityScore><ResultPercentage>0</ResultPercentage><AddressType>U</AddressType><Address><AddressComplete>999 New Development Rd;Bolivia NC 28422</AddressComplete></Address></ResultData></ResultDataSet></Result></ProcessResult>';
  const result = normalizeAddressDoctorResponse(xml);
  assert.equal(result.action, 'CONFIRM_UNVALIDATED');
  assert.equal(result.formattedAddress, null);
  assert.equal(result.addressComponents, null);
  assert.equal(result.uspsDeliverable, false);
  assert.equal(result.diagnostics.processStatus, 'I2');
  assert.equal(result.diagnostics.mailabilityScore, 0);
  assert.equal(result.diagnostics.resultPercentage, 0);
  assert.equal(result.diagnostics.addressType, 'U');
});

test('maps I3 low-confidence alternatives with usable suggestions to CONFIRM', () => {
  const xml = '<ProcessResult><StatusCode>100</StatusCode><StatusMessage>OK</StatusMessage><Result><ProcessStatus>I3</ProcessStatus><ResultDataSet><ResultData><MailabilityScore>1</MailabilityScore><ResultPercentage>75.09</ResultPercentage><Address><HouseNumber><string>999999</string></HouseNumber><Street><string>999999 William St</string></Street><Locality><string>New York</string></Locality><Province><string>NY</string></Province><PostalCode><string>10038</string></PostalCode><Country><string>US</string></Country><FormattedAddress><string>999999 William St, New York NY 10038</string></FormattedAddress></Address></ResultData><ResultData><MailabilityScore>1</MailabilityScore><ResultPercentage>72.5</ResultPercentage><Address><Street><string>999 William St</string></Street><FormattedAddress><string>999 William St, New York NY 10038</string></FormattedAddress></Address></ResultData></ResultDataSet></Result></ProcessResult>';
  const result = normalizeAddressDoctorResponse(xml);
  assert.equal(result.action, 'CONFIRM');
  assert.equal(result.formattedAddress, '999999 William St, New York NY 10038');
  assert.equal(result.uspsDeliverable, false);
  assert.equal(result.diagnostics.processStatus, 'I3');
  assert.equal(result.diagnostics.resultPercentage, 75.09);
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

test('maps not processed, web service, incomplete suggestions, and unknown statuses to FIX', () => {
  const base = (status, score = 5) => `<ProcessResult><Result><ProcessStatus>${status}</ProcessStatus><ResultDataSet><ResultData><MailabilityScore>${score}</MailabilityScore><ResultPercentage>90</ResultPercentage><Address><Street><string>Main St</string></Street><FormattedAddress><string>Main St</string></FormattedAddress></Address></ResultData></ResultDataSet></Result></ProcessResult>`;
  assert.equal(normalizeAddressDoctorResponse(base('N1')).action, 'FIX');
  assert.equal(normalizeAddressDoctorResponse(base('W8')).action, 'FIX');
  assert.equal(normalizeAddressDoctorResponse(base('Q0', 5)).action, 'CONFIRM');
  assert.equal(normalizeAddressDoctorResponse(base('Q1', 5)).action, 'CONFIRM');
  assert.equal(normalizeAddressDoctorResponse('<ProcessResult><Result><ProcessStatus>Q0</ProcessStatus><ResultDataSet><ResultData><MailabilityScore>5</MailabilityScore><ResultPercentage>90</ResultPercentage><Address></Address></ResultData></ResultDataSet></Result></ProcessResult>').action, 'FIX');
  assert.equal(normalizeAddressDoctorResponse('<ProcessResult><Result><ProcessStatus>Q1</ProcessStatus><ResultDataSet><ResultData><MailabilityScore>5</MailabilityScore><ResultPercentage>90</ResultPercentage><Address></Address></ResultData></ResultDataSet></Result></ProcessResult>').action, 'FIX');
  assert.equal(normalizeAddressDoctorResponse(base('Z9')).action, 'FIX');
});

test('maps corrected and suggestion statuses to CONFIRM when deliverability is fair or better', () => {
  const base = (status) => `<ProcessResult><Result><ProcessStatus>${status}</ProcessStatus><ResultDataSet><ResultData><MailabilityScore>2</MailabilityScore><ResultPercentage>80</ResultPercentage><Address><Street><string>Main St</string></Street><FormattedAddress><string>Main St</string></FormattedAddress></Address></ResultData></ResultDataSet></Result></ProcessResult>`;
  assert.equal(normalizeAddressDoctorResponse(base('C4')).action, 'CONFIRM');
  assert.equal(normalizeAddressDoctorResponse(base('Q3')).action, 'CONFIRM');
});

test('test internals cover XML helpers and edge cases', () => {
  const {
    actionFor,
    block,
    blockCount,
    component,
    decodeXml,
    first,
    numberValue,
    stripHouseNumber,
    strings,
  } = testInternals;
  assert.equal(decodeXml('&lt;&gt;&quot;&apos;&amp;'), '<>"\'&');
  assert.equal(first('<A x="1"> hi&amp;bye </A>', 'A'), 'hi&bye');
  assert.equal(first('<B/>', 'A'), null);
  assert.equal(block('<A>inside</A>', 'A'), 'inside');
  assert.equal(block('<B/>', 'A'), '');
  assert.equal(blockCount('<A>1</A><A>2</A>', 'A'), 2);
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
  assert.equal(actionFor('I3', 0, 0, [], null), 'CONFIRM_UNVALIDATED');
  assert.equal(actionFor('I3', 0, 0, [{ types: ['route'] }], 'Main St'), 'CONFIRM_UNVALIDATED');
  assert.equal(actionFor('I3', 0, 0, [{ types: ['route'] }], 'Main St', true), 'CONFIRM');
  assert.equal(actionFor(null, 5, 100, [{ types: ['route'] }], 'Main St'), 'FIX');
  assert.equal(actionFor('V4', 5, 100, [{ types: ['route'] }], null), 'FIX');
  assert.deepEqual(component('', 'short', 'country'), { longText: 'short', shortText: 'short', types: ['country'] });
  assert.deepEqual(component('long', '', 'country'), { longText: 'long', shortText: 'long', types: ['country'] });
  assert.equal(component('', '', 'country'), null);
});
