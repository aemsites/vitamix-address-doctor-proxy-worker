import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addressXml,
  buildSoapEnvelope,
  callAddressDoctor,
  escapeXml,
  parseAddressLines,
  stringsTag,
  tag,
} from '../src/soap.js';

const config = {
  endpoint: 'https://addressdoctor.test/soap',
  login: 'id&<',
  password: 'pw"\'',
  jobToken: 'job-1',
  processMode: 'INTERACTIVE',
  defaultCountryISO3: 'USA',
  countryType: 'ISO2',
  timeoutMs: 100,
  maxResultCount: 5,
};

test('escapeXml escapes XML-sensitive characters', () => {
  assert.equal(escapeXml(`a&b<c>d"e'f`), 'a&amp;b&lt;c&gt;d&quot;e&apos;f');
});

test('buildSoapEnvelope maps structured fields and escapes secrets/input', () => {
  const xml = buildSoapEnvelope({
    addressLines: ['100 <Park> St', 'New York, NY 10005'],
    regionCode: 'US',
    components: {
      street: '100 & Park St',
      addressLine2: 'Apt "2"',
      locality: 'New <York>',
      postalCode: '10005',
      province: 'NY',
      country: 'US',
    },
  }, config);
  assert.match(xml, /<login>id&amp;&lt;<\/login>/);
  assert.match(xml, /<password>pw&quot;&apos;<\/password>/);
  assert.match(xml, /<JobToken>job-1<\/JobToken>/);
  assert.match(xml, /<MaxResultCount>5<\/MaxResultCount>/);
  assert.match(xml, /<Street><string>100 &amp; Park St<\/string><\/Street>/);
  assert.match(xml, /<SubBuilding><string>Apt &quot;2&quot;<\/string><\/SubBuilding>/);
  assert.match(xml, /<AddressComplete>100 &lt;Park&gt; St;New York, NY 10005<\/AddressComplete>/);
});

test('buildSoapEnvelope omits empty optional fields and job token', () => {
  const xml = buildSoapEnvelope({ addressLines: ['Line 1'], regionCode: 'CA' }, { ...config, jobToken: '', maxResultCount: 0 });
  assert.doesNotMatch(xml, /ServiceParameters/);
  assert.match(xml, /<Street><string>Line 1<\/string><\/Street>/);
  assert.match(xml, /<Country><string>CA<\/string><\/Country>/);
  assert.match(xml, /<AddressComplete>Line 1<\/AddressComplete>/);
});

test('callAddressDoctor posts SOAP with required headers', async () => {
  let captured;
  const result = await callAddressDoctor({ addressLines: ['Line 1'], regionCode: 'US' }, config, async (url, init) => {
    captured = { url, init };
    return new Response('<ok/>', { status: 200 });
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.equal(result.text, '<ok/>');
  assert.equal(captured.url, config.endpoint);
  assert.equal(captured.init.method, 'POST');
  assert.equal(captured.init.headers['Content-Type'], 'text/xml; charset=utf-8');
  assert.equal(captured.init.headers.SOAPAction, '"http://validator5.AddressDoctor.com/Webservice5/v2/Process"');
  assert.match(captured.init.body, /soap:Envelope/);
});

test('callAddressDoctor returns non-ok upstream responses', async () => {
  const result = await callAddressDoctor({ addressLines: ['Line 1'] }, config, async () => new Response('bad', { status: 500 }));
  assert.equal(result.ok, false);
  assert.equal(result.status, 500);
  assert.equal(result.text, 'bad');
});

test('callAddressDoctor maps AbortError to timeout result', async () => {
  const result = await callAddressDoctor({ addressLines: ['Line 1'] }, config, async () => {
    const error = new Error('aborted');
    error.name = 'AbortError';
    throw error;
  });
  assert.deepEqual(result, { timeout: true, status: 504, text: '' });
});

test('callAddressDoctor rethrows non-timeout fetch errors', async () => {
  await assert.rejects(
    callAddressDoctor({ addressLines: ['Line 1'] }, config, async () => { throw new Error('network'); }),
    /network/,
  );
  await assert.rejects(
    callAddressDoctor({ addressLines: ['Line 1'] }, config, async () => { throw null; }),
    (error) => error === null,
  );
  await assert.rejects(
    callAddressDoctor({ addressLines: ['Line 1'] }, config, async () => { throw { name: 'OtherError' }; }),
    (error) => error.name === 'OtherError',
  );
});

test('SOAP helper edge cases are covered', () => {
  assert.equal(tag('A', undefined), '');
  assert.equal(tag('A', null), '');
  assert.equal(tag('A', ''), '');
  assert.equal(tag('A', 0), '<A>0</A>');
  assert.equal(stringsTag('A', 'x'), '<A><string>x</string></A>');
  assert.equal(stringsTag('A', ['x', '', null, undefined, 'y']), '<A><string>x</string><string>y</string></A>');
  assert.equal(stringsTag('A', ['', null]), '');
  assert.deepEqual(parseAddressLines({ addressLines: null }), { addressComplete: '', street: '', localityLine: '' });
  assert.deepEqual(parseAddressLines({ addressLines: ['a', '', 'b'] }), { addressComplete: 'a;b', street: 'a', localityLine: 'b' });
  assert.match(addressXml({ addressLines: [], components: { street: 'S' } }), /<Street><string>S<\/string><\/Street>/);
  assert.match(addressXml({ addressLines: ['S'], regionCode: 'US' }), /<Country><string>US<\/string><\/Country>/);
});
