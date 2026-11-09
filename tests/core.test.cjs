const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const Core = require('../js/core.js');

function isolatedCore(fetch, storage = new Map(), cryptoImpl = crypto.webcrypto) {
  const context = vm.createContext({
    fetch, crypto: cryptoImpl, TextEncoder, TextDecoder, Uint8Array,
    atob, URL, URLSearchParams, AbortController,
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

test('menus expose only the configured sections and drop unknown paths', () => {
  const plates = Core.platesFromTabs({ plateList: [null, { plateVOList: [
    { plateId: '23', plateName: '更新名称', platePath: '/plate7' },
    { plateId: 4, plateName: '短视频', platePath: '/plate1' },
    { plateId: 6, plateName: 'AV', platePath: '/plate3' },
    { plateId: 7, plateName: '动漫', platePath: '/plate4' },
    { plateId: 99, plateName: '未支持分区', platePath: '/other' },
    { plateId: null, plateName: '无效', platePath: '/plate1' },
    { plateId: 8, plateName: '短剧合集', platePath: '/plate5' }
  ] }] });
  assert.deepEqual(plates.map(p => p.path), ['/plate7', '/plate1']);
  assert.equal(plates[0].id, 23);
  assert.equal(plates[0].name, '更新名称');
  assert.deepEqual(Core.platesFromTabs(null), Core.DEFAULT_PLATES);
  assert.deepEqual(Core.platesFromTabs({ plateList: {} }), Core.DEFAULT_PLATES);
  // Redirect-only hosts answer getNewTabList with a flat placeholder layout.
  assert.deepEqual(Core.platesFromTabs({ plateList: [
    { plateId: 10, platePath: '/plate1' },
    { plateId: 15, platePath: '/dynamic1' }
  ] }), []);
  // Upstream also serves AV/动漫/短剧合集, but they are intentionally hidden.
  assert.deepEqual(Core.DEFAULT_PLATES.map(p => p.path), ['/plate7', '/plate6', '/plate1', '/plate2']);
  assert.deepEqual(Core.DEFAULT_PLATES.map(p => p.id), [22, 19, 4, 5]);
});

test('playback uses exactly one line, best quality first', () => {
  assert.deepEqual(Core.pickVideoLine({ videoUrlOne: ' one ', videoUrlTwo: ' two ', videoUrlThree: ' three ' }),
    { url: 'three', name: '高清线路', field: 'videoUrlThree' });
  assert.deepEqual(Core.pickVideoLine({ videoUrlOne: 'one', videoUrlTwo: 'two', videoUrlThree: '' }),
    { url: 'two', name: '优化线路', field: 'videoUrlTwo' });
  assert.deepEqual(Core.pickVideoLine({ videoUrlOne: 'one', videoUrlTwo: null, videoUrlThree: '  ' }),
    { url: 'one', name: '线路1', field: 'videoUrlOne' });
  assert.equal(Core.pickVideoLine({ videoUrlOne: '', videoUrlTwo: '', videoUrlThree: null }), null);
  assert.equal(Core.pickVideoLine(null), null);
});

test('known-dead anime detail host is rewritten to the live list host', () => {
  assert.equal(Core.rewriteMediaUrl('https://st2dc.ybxzk33o1.top/dm/a.mp4?secure=1'),
    'https://v.hersav.me/dm/a.mp4?secure=1');
  assert.equal(Core.rewriteMediaUrl('https://ST2DC.ybxzk33o1.top/images/dm/a.jpg'),
    'https://v.hersav.me/images/dm/a.jpg');
  assert.equal(Core.rewriteMediaUrl('https://v.hersav.me/dm/a.mp4'), 'https://v.hersav.me/dm/a.mp4');
  assert.equal(Core.rewriteMediaUrl('https://4wxxd.ybxzk33o1.top/amplify_video/a.mp4'), 'https://4wxxd.ybxzk33o1.top/amplify_video/a.mp4');
  assert.equal(Core.rewriteMediaUrl('https://st2dc.ybxzk33o1.top/av/a.mp4'), 'https://st2dc.ybxzk33o1.top/av/a.mp4');
  assert.equal(Core.rewriteMediaUrl(null), null);
  assert.equal(Core.pickVideoLine({ videoUrlOne: 'https://st2dc.ybxzk33o1.top/dm/a.mp4' }).url,
    'https://v.hersav.me/dm/a.mp4');
});

test('HLS quality lock picks the tallest variant', () => {
  assert.equal(Core.highestLevelIndex([{ height: 270, bitrate: 1 }, { height: 1080, bitrate: 4 }, { height: 720, bitrate: 2 }]), 1);
  assert.equal(Core.highestLevelIndex([{ width: 1920, height: 1080, bitrate: 2 }, { width: 1920, height: 1080, bitrate: 5 }]), 1);
  assert.equal(Core.highestLevelIndex([{ width: 1080, height: 1920, bitrate: 2 }, { width: 1920, height: 1080, bitrate: 5 }]), 1);
  assert.equal(Core.highestLevelIndex([]), -1);
  assert.equal(Core.highestLevelIndex(null), -1);
  assert.equal(Core.levelQuality({ width: 1920, height: 1080 }), '1080p');
  assert.equal(Core.levelQuality({ width: 1080, height: 1920 }), '1080p');
  assert.equal(Core.levelQuality({ height: 720 }), '720p');
  assert.equal(Core.levelQuality(null), '');
});

test('detail routes preserve opaque and large source video IDs', () => {
  for (const [plate, video] of [['4', '6487809'], ['22', 'QGFsekHG-j_z-hEkwg8J6'], ['19', '1979561089231919255']]) {
    assert.deepEqual(Core.parseDetailRoute('#/detail?videoId=' + video + '&plateId=' + plate), { plateId: plate, videoId: video });
  }
  for (const hash of ['', '#/detail?plateId=22', '#/detail?plateId=x&videoId=test', '#/detail?plateId=22&videoId=%3Cscript%3E']) {
    assert.equal(Core.parseDetailRoute(hash), null);
  }
});

test('MD5 matches Node for UTF-8 text and binary salts/digests', () => {
  for (const value of ['', '中文 search', new Uint8Array([0, 127, 128, 255])]) {
    assert.equal(Core.md5(value), crypto.createHash('md5').update(value).digest('hex'));
  }
});

test('decrypts API payloads without WebCrypto, as on a plain-HTTP origin', async () => {
  const key = Buffer.from('mh_aes=19@#$@%@#');
  const iv = Buffer.from('5e1y6w452uqw9jq8');
  const plaintext = JSON.stringify({ videoList: [{ videoId: '6568297', videoTitle: '中文 标题' }] });
  const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
  const encoded = Buffer.concat([cipher.update(plaintext), cipher.final()]).toString('base64');
  for (const cryptoImpl of [{}, undefined]) {
    const core = isolatedCore(() => {}, new Map(), cryptoImpl);
    assert.equal(await core.aesDecryptB64(encoded), plaintext);
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
  const noSubtle = isolatedCore(() => {}, new Map(), {});
  assert.equal(await noSubtle.aesCryptoJsDecrypt(encoded, pass), expected);
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
  let probes = 0;
  const core = isolatedCore(async url => {
    if (url.includes('getNewTabList')) probes++;
    return reply(3);
  });
  await assert.rejects(core.apiGet('sp/getSearchList', {}), /3/);
  assert.equal(probes, 1);
});

test('host recovery rejects placeholder tenants and empty probe sections', async () => {
  const core = isolatedCore(async (url, options) => {
    const host = options.headers.url;
    if (url.includes('getNewTabList')) {
      if (host === 'good.example') {
        return reply(1, { plateList: [{ plateVOList: [{ plateId: 22, plateName: '成人视频', platePath: '/plate7' }] }] });
      }
      if (host === 'bad.example') {
        return reply(1, { plateList: [{ plateVOList: [{ plateId: 22, plateName: '成人视频', platePath: '/plate7' }] }] });
      }
      return reply(1, { plateList: [{ plateId: 10, platePath: '/plate1' }] });
    }
    if (url.includes('getPlateLabelList')) {
      return reply(1, { plateCenter: { plateLabelList: [{ exploreLabelId: 39 }] } });
    }
    if (url.includes('getLabelVideoList')) {
      return host === 'good.example' ? reply(1, { videoList: [{ videoId: '1' }] }) : reply(1, { videoList: [] });
    }
    return reply(3);
  });
  core.FRONT_HOSTS.push('bad.example', 'good.example');
  assert.equal(await core.rotateFrontHost(), true);
  assert.equal(core.getConfig().frontHost, 'good.example');
});

test('failed API rotation expires cached configuration', async () => {
  const storage = new Map();
  const core = isolatedCore(async () => new Response('', { status: 503 }), storage);
  assert.equal(await core.rotateApiBase(), false);
  assert.equal(JSON.parse(storage.get(Core.CONFIG_KEY)).ts, 0);
});

test('legacy config with a redirect-only front host is discarded', async () => {
  const storage = new Map([['zdplayer_config_v2', JSON.stringify({
    apiBase: Core.API_BASES[1], frontHost: 'zwfb.mmjvlook.top', publishPage: 'https://jvlook.top/', ts: Date.now()
  })]]);
  const core = isolatedCore(async url => reply(1, url.includes('getNewTabList') ? { plateList: [], publishPage: [] } : {}), storage);
  const runtime = await core.bootstrap(false);
  assert.equal(runtime.apiBase, Core.API_BASES[0]);
  assert.equal(runtime.frontHost, 'jvlook.com');
  const saved = JSON.parse(storage.get(Core.CONFIG_KEY));
  assert.equal(saved.frontHost, 'jvlook.com');
});
