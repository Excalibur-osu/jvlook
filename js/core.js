(function (global) {
  'use strict';
  var API_BASE = 'https://zdap.gkquu.cn:4438/zd/';
  var SALT = '@1243asd31**21#';
  var AES_KEY = 'mh_aes=19@#$@%@#';
  var AES_IV = '5e1y6w452uqw9jq8';
  var NONCE_CHARS = 'ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz2345678';
  var API_BASES = [
    'https://zdap.gkquu.cn:4438/zd/',
    'https://zdapi.421573.top/zd/'
  ];
  var FRONT_HOSTS = ['kklwqis10.jvlookzw04.cn', 'dwkkjs4.jvlookzw04.cn', 'jvlook.com'];
  var DEFAULT_PLATES = [
    { id: 4, name: '短视频', path: '/plate1' },
    { id: 22, name: '成人视频', path: '/plate7' },
    { id: 19, name: '成人天堂', path: '/plate6' },
    { id: 5, name: '长视频', path: '/plate2' }
  ];
  var PUBLISH_PAGES = ['https://jvlook.top/'];
  var CONFIG_KEY = 'zdplayer_config_v1';
  var CONFIG_TTL_MS = 24 * 3600 * 1000;
  var runtime = {
    apiBase: API_BASES[0],
    frontHost: FRONT_HOSTS[0],
    publishPage: PUBLISH_PAGES[0],
    configTs: 0
  };
  function md5(input) {
    function safeAdd(x, y) { var lsw = (x & 0xffff) + (y & 0xffff); var msw = (x >> 16) + (y >> 16) + (lsw >> 16); return (msw << 16) | (lsw & 0xffff); }
    function bitRotateLeft(num, cnt) { return (num << cnt) | (num >>> (32 - cnt)); }
    function md5cmn(q, a, b, x, s, t) { return safeAdd(bitRotateLeft(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b); }
    function md5ff(a, b, c, d, x, s, t) { return md5cmn((b & c) | (~b & d), a, b, x, s, t); }
    function md5gg(a, b, c, d, x, s, t) { return md5cmn((b & d) | (c & ~d), a, b, x, s, t); }
    function md5hh(a, b, c, d, x, s, t) { return md5cmn(b ^ c ^ d, a, b, x, s, t); }
    function md5ii(a, b, c, d, x, s, t) { return md5cmn(c ^ (b | ~d), a, b, x, s, t); }
    function binlMD5(x, len) {
      x[len >> 5] |= 0x80 << (len % 32);
      x[(((len + 64) >>> 9) << 4) + 14] = len;
      var a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
      for (var i = 0; i < x.length; i += 16) {
        var olda = a, oldb = b, oldc = c, oldd = d;
        a = md5ff(a, b, c, d, x[i], 7, -680876936);
        d = md5ff(d, a, b, c, x[i + 1], 12, -389564586);
        c = md5ff(c, d, a, b, x[i + 2], 17, 606105819);
        b = md5ff(b, c, d, a, x[i + 3], 22, -1044525330);
        a = md5ff(a, b, c, d, x[i + 4], 7, -176418897);
        d = md5ff(d, a, b, c, x[i + 5], 12, 1200080426);
        c = md5ff(c, d, a, b, x[i + 6], 17, -1473231341);
        b = md5ff(b, c, d, a, x[i + 7], 22, -45705983);
        a = md5ff(a, b, c, d, x[i + 8], 7, 1770035416);
        d = md5ff(d, a, b, c, x[i + 9], 12, -1958414417);
        c = md5ff(c, d, a, b, x[i + 10], 17, -42063);
        b = md5ff(b, c, d, a, x[i + 11], 22, -1990404162);
        a = md5ff(a, b, c, d, x[i + 12], 7, 1804603682);
        d = md5ff(d, a, b, c, x[i + 13], 12, -40341101);
        c = md5ff(c, d, a, b, x[i + 14], 17, -1502002290);
        b = md5ff(b, c, d, a, x[i + 15], 22, 1236535329);
        a = md5gg(a, b, c, d, x[i + 1], 5, -165796510);
        d = md5gg(d, a, b, c, x[i + 6], 9, -1069501632);
        c = md5gg(c, d, a, b, x[i + 11], 14, 643717713);
        b = md5gg(b, c, d, a, x[i], 20, -373897302);
        a = md5gg(a, b, c, d, x[i + 5], 5, -701558691);
        d = md5gg(d, a, b, c, x[i + 10], 9, 38016083);
        c = md5gg(c, d, a, b, x[i + 15], 14, -660478335);
        b = md5gg(b, c, d, a, x[i + 4], 20, -405537848);
        a = md5gg(a, b, c, d, x[i + 9], 5, 568446438);
        d = md5gg(d, a, b, c, x[i + 14], 9, -1019803690);
        c = md5gg(c, d, a, b, x[i + 3], 14, -187363961);
        b = md5gg(b, c, d, a, x[i + 8], 20, 1163531501);
        a = md5gg(a, b, c, d, x[i + 13], 5, -1444681467);
        d = md5gg(d, a, b, c, x[i + 2], 9, -51403784);
        c = md5gg(c, d, a, b, x[i + 7], 14, 1735328473);
        b = md5gg(b, c, d, a, x[i + 12], 20, -1926607734);
        a = md5hh(a, b, c, d, x[i + 5], 4, -378558);
        d = md5hh(d, a, b, c, x[i + 8], 11, -2022574463);
        c = md5hh(c, d, a, b, x[i + 11], 16, 1839030562);
        b = md5hh(b, c, d, a, x[i + 14], 23, -35309556);
        a = md5hh(a, b, c, d, x[i + 1], 4, -1530992060);
        d = md5hh(d, a, b, c, x[i + 4], 11, 1272893353);
        c = md5hh(c, d, a, b, x[i + 7], 16, -155497632);
        b = md5hh(b, c, d, a, x[i + 10], 23, -1094730640);
        a = md5hh(a, b, c, d, x[i + 13], 4, 681279174);
        d = md5hh(d, a, b, c, x[i], 11, -358537222);
        c = md5hh(c, d, a, b, x[i + 3], 16, -722521979);
        b = md5hh(b, c, d, a, x[i + 6], 23, 76029189);
        a = md5hh(a, b, c, d, x[i + 9], 4, -640364487);
        d = md5hh(d, a, b, c, x[i + 12], 11, -421815835);
        c = md5hh(c, d, a, b, x[i + 15], 16, 530742520);
        b = md5hh(b, c, d, a, x[i + 2], 23, -995338651);
        a = md5ii(a, b, c, d, x[i], 6, -198630844);
        d = md5ii(d, a, b, c, x[i + 7], 10, 1126891415);
        c = md5ii(c, d, a, b, x[i + 14], 15, -1416354905);
        b = md5ii(b, c, d, a, x[i + 5], 21, -57434055);
        a = md5ii(a, b, c, d, x[i + 12], 6, 1700485571);
        d = md5ii(d, a, b, c, x[i + 3], 10, -1894986606);
        c = md5ii(c, d, a, b, x[i + 10], 15, -1051523);
        b = md5ii(b, c, d, a, x[i + 1], 21, -2054922799);
        a = md5ii(a, b, c, d, x[i + 8], 6, 1873313359);
        d = md5ii(d, a, b, c, x[i + 15], 10, -30611744);
        c = md5ii(c, d, a, b, x[i + 6], 15, -1560198380);
        b = md5ii(b, c, d, a, x[i + 13], 21, 1309151649);
        a = md5ii(a, b, c, d, x[i + 4], 6, -145523070);
        d = md5ii(d, a, b, c, x[i + 11], 10, -1120210379);
        c = md5ii(c, d, a, b, x[i + 2], 15, 718787259);
        b = md5ii(b, c, d, a, x[i + 9], 21, -343485551);
        a = safeAdd(a, olda); b = safeAdd(b, oldb); c = safeAdd(c, oldc); d = safeAdd(d, oldd);
      }
      return [a, b, c, d];
    }
    function binl2hex(binarray) {
      var hexTab = '0123456789abcdef', str = '';
      for (var i = 0; i < binarray.length * 4; i++) {
        str += hexTab.charAt((binarray[i >> 2] >> ((i % 4) * 8 + 4)) & 0xf) + hexTab.charAt((binarray[i >> 2] >> ((i % 4) * 8)) & 0xf);
      }
      return str;
    }
    function str2binl(str) {
      var bin = [], mask = (1 << 8) - 1;
      for (var i = 0; i < str.length * 8; i += 8) bin[i >> 5] |= (str.charCodeAt(i / 8) & mask) << (i % 32);
      return bin;
    }
    // EVP_BytesToKey hashes raw binary digests, without UTF-8 re-encoding.
    var data = input instanceof Uint8Array
      ? Array.from(input, function (b) { return String.fromCharCode(b); }).join('')
      : unescape(encodeURIComponent(String(input)));
    return binl2hex(binlMD5(str2binl(data), data.length * 8));
  }
  function nonce16() {
    var s = '';
    for (var i = 0; i < 16; i++) s += NONCE_CHARS.charAt(Math.floor(Math.random() * NONCE_CHARS.length));
    return s;
  }
  function newGuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === 'x' ? r : ((r & 0x3) | 0x8);
      return v.toString(16);
    });
  }
  var _memGuid = null;
  function getGuid() {
    try {
      var g = localStorage.getItem('guid');
      if (!g) { g = newGuid(); localStorage.setItem('guid', g); }
      return g;
    } catch (e) {}
    if (!_memGuid) _memGuid = newGuid();
    return _memGuid;
  }
  function deviceType() {
    if (typeof navigator === 'undefined') return '1';
    var ua = navigator.userAgent || '';
    if (/iPad|iPhone|iPod/.test(ua)) return '3';
    if (/Android/.test(ua)) return '2';
    return '1';
  }
  function hostHeader() {
    return runtime.frontHost;
  }
  function platesFromTabs(data) {
    var byPath = {};
    var groups = data && Array.isArray(data.plateList) ? data.plateList : [];
    groups.forEach(function (group) {
      var entries = group && Array.isArray(group.plateVOList) ? group.plateVOList : [];
      entries.forEach(function (p) {
        if (!p || !/^\d+$/.test(String(p.plateId)) || Number(p.plateId) <= 0 || !p.plateName) return;
        byPath[p.platePath] = { id: Number(p.plateId), name: String(p.plateName), path: p.platePath };
      });
    });
    return DEFAULT_PLATES.map(function (p) { return byPath[p.path] || { id: p.id, name: p.name, path: p.path }; });
  }
  function parseDetailRoute(hash) {
    if (!/^#\/detail\?/.test(hash || '')) return null;
    var params = new URLSearchParams(hash.slice(hash.indexOf('?') + 1));
    var plateId = params.get('plateId'), videoId = params.get('videoId');
    if (!/^[1-9]\d*$/.test(plateId || '') || !/^[A-Za-z0-9_-]+$/.test(videoId || '')) return null;
    return { plateId: plateId, videoId: videoId };
  }
  function signParams(obj) {
    var keys = Object.keys(obj).sort();
    var out = '';
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var v = obj[k];
      if (v !== null && typeof v === 'object') v = JSON.stringify(v).split('"').join('');
      else if (/[一-龥]+/g.test(String(v))) v = encodeURIComponent(v);
      else if (/[^a-zA-Z0-9]+/g.test(String(v))) v = decodeURIComponent(encodeURIComponent(v));
      out += '&' + k + '=' + v;
    }
    return out.slice(1);
  }
  function b64ToBytes(b64) {
    var bin = atob(b64);
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }
  async function aesDecryptB64(b64) {
    var keyBytes = new TextEncoder().encode(AES_KEY);
    var ivBytes = new TextEncoder().encode(AES_IV);
    var key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-CBC' }, false, ['decrypt']);
    var pt = await crypto.subtle.decrypt({ name: 'AES-CBC', iv: ivBytes }, key, b64ToBytes(b64));
    return new TextDecoder().decode(pt);
  }
  async function parseReturn(j) {
    var d = j.returnData;
    if (typeof d === 'string') {
      try { var t = JSON.parse(d); if (t && typeof t === 'object') return t; } catch (e) {}
      var plain = await aesDecryptB64(d);
      return JSON.parse(plain);
    }
    return d;
  }
  function baseHeaders(g, sign, ts, nc, hostOverride) {
    return {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
      'token': g,
      'sign': sign,
      'timestamp': ts,
      'nonce': nc,
      'url': hostOverride || hostHeader()
    };
  }
  async function apiGet(path, params, recovery) {
    recovery = recovery || { login: false, host: false, api: false };
    var g = getGuid();
    var ts = String(Date.now());
    var nc = nonce16();
    var sign = md5(ts + g + nc + SALT).toUpperCase();
    var qs = Object.keys(params || {}).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
    var resp;
    try {
      resp = await requestWithRetry(runtime.apiBase + path + (qs ? '?' + qs : ''), { headers: baseHeaders(g, sign, ts, nc) });
    } catch (e) {
      if (!recovery.api) {
        recovery.api = true;
        if (await rotateApiBase()) return apiGet(path, params, recovery);
      }
      throw e;
    }
    var j = await resp.json();
    if (j.returnValue !== 1) {
      if ((j.returnValue === 998 || j.returnValue === 1000) && !recovery.login) {
        recovery.login = true;
        await ensureLogin(true);
        return apiGet(path, params, recovery);
      }
      if (j.returnValue === 3 && !recovery.host) {
        recovery.host = true;
        if (await rotateFrontHost()) return apiGet(path, params, recovery);
      }
      throw new Error(j.msg || ('API 错误 ' + j.returnValue));
    }
    return parseReturn(j);
  }
  async function apiPost(path, body) {
    var g = getGuid();
    var ts = String(Date.now());
    var nc = nonce16();
    var sign = md5(signParams(body) + ts + g + nc + SALT).toUpperCase();
    var h = baseHeaders(g, sign, ts, nc);
    h['Content-Type'] = 'application/json';
    var resp = await requestWithRetry(runtime.apiBase + path, { method: 'POST', headers: h, body: JSON.stringify(body) });
    var j = await resp.json();
    if (j.returnValue !== 1) throw new Error(j.msg || ('API 错误 ' + j.returnValue));
    return parseReturn(j);
  }
  var _loginPromise = null;
  function ensureLogin(force) {
    var today = new Date().toLocaleDateString();
    if (!force) {
      try { if (localStorage.getItem('loginDate') === today) return Promise.resolve(); } catch (e) {}
    }
    if (_loginPromise) return _loginPromise;
    _loginPromise = apiPost('user/userLogin', { deviceCode: getGuid(), source: deviceType() })
      .then(function () {
        try { localStorage.setItem('loginDate', today); } catch (e) {}
      })
      .finally(function () { _loginPromise = null; });
    return _loginPromise;
  }
  function sleepMs(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }
  function fetchWithTimeout(url, options, ms) {
    var opts = options || {};
    if (typeof AbortController !== 'undefined') {
      var ctrl = new AbortController();
      var timer = setTimeout(function () { ctrl.abort(); }, ms);
      var merged = {};
      for (var k in opts) merged[k] = opts[k];
      merged.signal = ctrl.signal;
      return fetch(url, merged).finally(function () { clearTimeout(timer); });
    }
    return fetch(url, opts);
  }
  async function requestWithRetry(url, options, maxAttempts) {
    var attempts = maxAttempts || 3;
    for (var attempt = 1; attempt <= attempts; attempt++) {
      try {
        var resp = await fetchWithTimeout(url, options, 15000);
        if (resp.status >= 500 && attempt < attempts) {
          await sleepMs(500 * Math.pow(2, attempt - 1) + Math.random() * 400);
          continue;
        }
        if (!resp.ok) {
          var error = new Error('HTTP ' + resp.status);
          error.status = resp.status;
          throw error;
        }
        return resp;
      } catch (e) {
        if (attempt >= attempts || (e.status && e.status < 500)) throw e;
        await sleepMs(500 * Math.pow(2, attempt - 1) + Math.random() * 400);
      }
    }
    throw new Error('request failed');
  }
  function loadCachedConfig() {
    try {
      var raw = localStorage.getItem(CONFIG_KEY);
      if (!raw) return null;
      var c = JSON.parse(raw);
      if (!c || !c.apiBase || !c.ts) return null;
      return c;
    } catch (e) { return null; }
  }
  function saveConfig() {
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify({
        apiBase: runtime.apiBase,
        frontHost: runtime.frontHost,
        publishPage: runtime.publishPage,
        ts: runtime.configTs
      }));
    } catch (e) {}
  }
  function signedProbe(apiBase) {
    var g = getGuid();
    var ts = String(Date.now());
    var nc = nonce16();
    var sign = md5(ts + g + nc + SALT).toUpperCase();
    return fetchWithTimeout(apiBase + 'sp/getNewTabList', { headers: baseHeaders(g, sign, ts, nc) }, 6000)
      .then(async function (resp) {
        if (!resp.ok) return { ok: false };
        var j = await resp.json();
        if (j.returnValue !== 1) return { ok: false, rv: j.returnValue };
        var data = await parseReturn(j);
        var pages = (data && data.publishPage) || [];
        for (var i = 0; i < pages.length; i++) {
          if (pages[i] && pages[i].publishName && pages[i].publishUrl && pages[i].publishName.indexOf('防走丢') !== -1) {
            runtime.publishPage = String(pages[i].publishUrl).replace(/\/$/, '') + '/';
          }
        }
        return { ok: true, data: data };
      })
      .catch(function () { return { ok: false }; });
  }
  function uniqueCandidates() {
    var out = [];
    var seen = {};
    var all = [runtime.apiBase].concat(API_BASES);
    for (var i = 0; i < all.length; i++) {
      if (all[i] && !seen[all[i]]) { seen[all[i]] = true; out.push(all[i]); }
    }
    return out;
  }
  async function settleApiBase() {
    var candidates = uniqueCandidates();
    for (var i = 0; i < candidates.length; i++) {
      var probe = await signedProbe(candidates[i]);
      if (probe.ok) {
        runtime.apiBase = candidates[i];
        runtime.configTs = Date.now();
        saveConfig();
        return true;
      }
    }
    return false;
  }
  function loadScriptNoCors(src, timeoutMs) {
    return new Promise(function (resolve) {
      if (typeof document === 'undefined' || !document.head) { resolve(false); return; }
      var s = document.createElement('script');
      var finished = false;
      var timer = setTimeout(function () { finish(false); }, timeoutMs || 8000);
      function finish(ok) {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        s.onload = s.onerror = null;
        s.remove();
        resolve(ok);
      }
      s.onload = function () { finish(true); };
      s.onerror = function () { finish(false); };
      s.src = src;
      document.head.appendChild(s);
    });
  }
  function md5Bytes(bytes) {
    var hex = md5(bytes);
    var out = new Uint8Array(16);
    for (var j = 0; j < 16; j++) out[j] = parseInt(hex.substr(j * 2, 2), 16);
    return out;
  }
  function concatBytes() {
    var parts = [];
    var total = 0;
    for (var i = 0; i < arguments.length; i++) { parts.push(arguments[i]); total += arguments[i].length; }
    var out = new Uint8Array(total);
    var offset = 0;
    for (var j = 0; j < parts.length; j++) { out.set(parts[j], offset); offset += parts[j].length; }
    return out;
  }
  async function aesCryptoJsDecrypt(b64, pass) {
    var raw = b64ToBytes(b64);
    if (raw.length < 16) return b64;
    var prefix = '';
    for (var i = 0; i < 8; i++) prefix += String.fromCharCode(raw[i]);
    if (prefix !== 'Salted__') return b64;
    var salt = raw.slice(8, 16);
    var ct = raw.slice(16);
    var p = new TextEncoder().encode(pass);
    var d1 = md5Bytes(concatBytes(p, salt));
    var d2 = md5Bytes(concatBytes(d1, p, salt));
    var d3 = md5Bytes(concatBytes(d2, p, salt));
    var key = await crypto.subtle.importKey('raw', concatBytes(d1, d2), { name: 'AES-CBC' }, false, ['decrypt']);
    var pt = await crypto.subtle.decrypt({ name: 'AES-CBC', iv: d3 }, key, ct);
    return new TextDecoder().decode(pt);
  }
  function parsePublishDomains(list) {
    var found = [];
    if (!list) return found;
    for (var g = 0; g < list.length; g++) {
      var group = list[g];
      if (!group) continue;
      for (var i = 0; i < group.length; i++) {
        var item = group[i];
        if (!item || !item.url || !item.name || item.name.indexOf('中文大全') === -1) continue;
        found.push({ name: item.name, url: item.url });
      }
    }
    return found;
  }
  var _verifyLabelId = null;
  async function verifyFrontHost(host) {
    var g = getGuid();
    var ts = String(Date.now());
    var nc = nonce16();
    var sign = md5(ts + g + nc + SALT).toUpperCase();
    try {
      if (_verifyLabelId === null) {
        var r1 = await fetchWithTimeout(runtime.apiBase + 'sp/getPlateLabelList?plateId=4', { headers: baseHeaders(g, sign, ts, nc, host) }, 6000);
        if (!r1.ok) return false;
        var j1 = await r1.json();
        if (j1.returnValue !== 1) return false;
        var d1 = await parseReturn(j1);
        var ls = (d1.plateCenter && d1.plateCenter.plateLabelList) || [];
        if (!ls.length) return false;
        _verifyLabelId = ls[0].exploreLabelId;
      }
      var g2 = getGuid();
      var ts2 = String(Date.now());
      var nc2 = nonce16();
      var sign2 = md5(ts2 + g2 + nc2 + SALT).toUpperCase();
      var r2 = await fetchWithTimeout(runtime.apiBase + 'sp/getLabelVideoList?plateId=4&labelId=' + encodeURIComponent(_verifyLabelId) + '&page=1&size=25', { headers: baseHeaders(g2, sign2, ts2, nc2, host) }, 6000);
      if (!r2.ok) return false;
      var j2 = await r2.json();
      return j2.returnValue === 1;
    } catch (e) { return false; }
  }
  var _frontRotation = null;
  function rotateFrontHost() {
    if (!_frontRotation) _frontRotation = findFrontHost().finally(function () { _frontRotation = null; });
    return _frontRotation;
  }
  async function findFrontHost() {
    var candidates = FRONT_HOSTS.filter(function (h) { return h !== runtime.frontHost; });
    for (var i = 0; i < candidates.length; i++) {
      if (await verifyFrontHost(candidates[i])) {
        runtime.frontHost = candidates[i];
        saveConfig();
        return true;
      }
    }
    return discoverFrontHost();
  }
  async function discoverFrontHost() {
    if (!runtime.__aesLoaded) {
      var loaded = await loadScriptNoCors(new URL('js/aes.js', runtime.publishPage).href, 5000);
      if (!loaded) return false;
      runtime.__aesLoaded = true;
    }
    var key = null;
    try { key = (typeof aesKey !== 'undefined') ? aesKey : null; } catch (e) { key = null; }
    var list = (typeof window !== 'undefined' && window.address) ? window.address : null;
    if (!key || !list) return false;
    var entries = parsePublishDomains(list);
    var ranked = [];
    for (var i = 0; i < entries.length; i++) {
      var plain;
      try { plain = await aesCryptoJsDecrypt(entries[i].url, key); } catch (e) { continue; }
      var m = plain.match(/^https?:\/\/([^\/]+)/);
      if (!m) continue;
      var isLatest = entries[i].name.indexOf('最新') !== -1;
      var needsVpn = entries[i].name.indexOf('科学上网') !== -1;
      ranked.push({ host: m[1], rank: (isLatest ? 0 : 1) + (needsVpn ? 2 : 0) });
    }
    ranked.sort(function (a, b) { return a.rank - b.rank; });
    for (var j = 0; j < ranked.length; j++) {
      if (FRONT_HOSTS.indexOf(ranked[j].host) === -1) FRONT_HOSTS.push(ranked[j].host);
    }
    for (var k = 0; k < ranked.length; k++) {
      if (await verifyFrontHost(ranked[k].host)) {
        runtime.frontHost = ranked[k].host;
        saveConfig();
        return true;
      }
    }
    return false;
  }
  async function bootstrap(force) {
    var cached = loadCachedConfig();
    if (cached && cached.apiBase) {
      runtime.apiBase = cached.apiBase;
      if (cached.frontHost) runtime.frontHost = cached.frontHost;
      if (cached.publishPage) runtime.publishPage = cached.publishPage;
      runtime.configTs = cached.ts || 0;
    }
    var fresh = cached && (Date.now() - runtime.configTs) < CONFIG_TTL_MS;
    if (!force && fresh) {
      discoverFrontHost().catch(function () {});
      return runtime;
    }
    var ok = await settleApiBase();
    if (!ok && !cached) runtime.apiBase = API_BASES[0];
    await discoverFrontHost().catch(function () {});
    saveConfig();
    return runtime;
  }
  var _apiRotation = null;
  function rotateApiBase() {
    if (!_apiRotation) _apiRotation = findApiBase().finally(function () { _apiRotation = null; });
    return _apiRotation;
  }
  async function findApiBase() {
    var candidates = uniqueCandidates().filter(function (b) { return b !== runtime.apiBase; });
    for (var i = 0; i < candidates.length; i++) {
      var probe = await signedProbe(candidates[i]);
      if (probe.ok) {
        runtime.apiBase = candidates[i];
        runtime.configTs = Date.now();
        saveConfig();
        return true;
      }
    }
    runtime.configTs = 0;
    saveConfig();
    return false;
  }
  function getConfig() {
    return { apiBase: runtime.apiBase, frontHost: runtime.frontHost, publishPage: runtime.publishPage };
  }
  var Core = {
    API_BASE: API_BASE, SALT: SALT, AES_KEY: AES_KEY, AES_IV: AES_IV, NONCE_CHARS: NONCE_CHARS,
    API_BASES: API_BASES, FRONT_HOSTS: FRONT_HOSTS, DEFAULT_PLATES: DEFAULT_PLATES,
    platesFromTabs: platesFromTabs, parseDetailRoute: parseDetailRoute,
    md5: md5, nonce16: nonce16, newGuid: newGuid, getGuid: getGuid, deviceType: deviceType,
    hostHeader: hostHeader, signParams: signParams, aesDecryptB64: aesDecryptB64,
    apiGet: apiGet, apiPost: apiPost, ensureLogin: ensureLogin,
    bootstrap: bootstrap, rotateApiBase: rotateApiBase, rotateFrontHost: rotateFrontHost, getConfig: getConfig,
    aesCryptoJsDecrypt: aesCryptoJsDecrypt
  };
  global.Core = Core;
  if (typeof module !== 'undefined' && module.exports) module.exports = Core;
})(typeof window !== 'undefined' ? window : globalThis);
