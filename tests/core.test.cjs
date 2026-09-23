const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const Core = require('../js/core.js');

function isolatedCore(fetch, storage = new Map()) {
  const context = vm.createContext({
    fetch, crypto: crypto.webcrypto, TextEncoder, TextDecoder, Uint8Array,
    atob, URL, AbortController,
    setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, 10)), clearTimeout,
    localStorage: {
      getItem: key => storage.get(key),
      setItem: (key, value) => storage.set(key, value)
    }
  });
  vm.runInContext(fs.readFileSync(require.resolve('../js/core.js'), 'utf8'), context);
  return context.Core;
}
const reply = (returnValue, returnData = {}) => new Response(JSON.stringify({ returnValue, returnData }));

test('MD5 matches Node for UTF-8 text and binary salts/digests', () => {
  for (const value of ['', '中文 search', new Uint8Array([0, 127, 128, 255])]) {
    assert.equal(Core.md5(value), crypto.createHash('md5').update(value).digest('hex'));
  }
});

test('decrypts CryptoJS publication addresses with binary EVP_BytesToKey', async () => {
  const pass = 'zdzd#@%@#';
  const salt = Buffer.from('80ff017fcc90ab22', 'hex');
  let digest = Buffer.alloc(0), material = Buffer.alloc(0);
  while (material.length < 48) {
    digest = crypto.createHash('md5').update(Buffer.concat([digest, Buffer.from(pass), salt])).digest();
    material = Buffer.concat([material, digest]);
  }
  const cipher = crypto.createCipheriv('aes-256-cbc', material.subarray(0, 32), material.subarray(32, 48));
  const expected = 'https://example.com/?name=中文';
  const encoded = Buffer.concat([Buffer.from('Salted__'), salt, cipher.update(expected), cipher.final()]).toString('base64');
  assert.equal(await Core.aesCryptoJsDecrypt(encoded, pass), expected);
});

test('blocked localStorage still yields a stable device identity', () => {
  const core = isolatedCore(() => {}, { get() { throw new Error('storage denied'); } });
  assert.match(core.getGuid(), /^[0-9a-f-]{36}$/);
  assert.equal(core.getGuid(), core.getGuid());
});

test('persistent authentication failure retries login only once', async () => {
  let requests = 0, logins = 0;
  const core = isolatedCore(async url => {
    if (url.includes('userLogin')) { logins++; return reply(1); }
    requests++;
    return reply(998);
  });
  await assert.rejects(core.apiGet('sp/getSearchList', { searchName: '旅行' }), /998/);
  assert.equal(requests, 2);
  assert.equal(logins, 1);
});

test('server failure retries the same query against a healthy backup', async () => {
  const calls = [];
  const core = isolatedCore(async url => {
    calls.push(url);
    if (url.startsWith(Core.API_BASE)) return new Response('', { status: 503 });
    return reply(1, url.includes('getNewTabList') ? {} : { videoList: [{ videoId: '1' }] });
  });
  const result = await core.apiGet('sp/getSearchList', { plateId: 19, searchName: '旅行 & test', page: 2 });
  assert.equal(result.videoList[0].videoId, '1');
  assert.equal(calls.filter(url => url.startsWith(Core.API_BASE)).length, 3);
  const last = new URL(calls.at(-1));
  assert.equal(last.host, 'zdapi.421573.top');
  assert.equal(last.searchParams.get('searchName'), '旅行 & test');
  assert.equal(last.searchParams.get('page'), '2');
});

test('rejected host recovery is bounded even if the target keeps rejecting', async () => {
  let requests = 0;
  const core = isolatedCore(async url => {
    if (url.includes('getPlateLabelList')) return reply(1, { plateCenter: { plateLabelList: [{ exploreLabelId: 1 }] } });
    if (url.includes('getLabelVideoList')) return reply(1);
    requests++;
    return reply(3);
  });
  await assert.rejects(core.apiGet('sp/getSearchList', {}), /3/);
  assert.equal(requests, 2);
});

test('failed API rotation expires cached configuration', async () => {
  const storage = new Map();
  const core = isolatedCore(async () => new Response('', { status: 503 }), storage);
  assert.equal(await core.rotateApiBase(), false);
  assert.equal(JSON.parse(storage.get('zdplayer_config_v1')).ts, 0);
});
