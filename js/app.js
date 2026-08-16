(function () {
  'use strict';
  var PLATES = [
    { id: 4, name: '短视频', path: '/plate1' },
    { id: 5, name: '长视频', path: '/plate2' }
  ];
  var PAGE_SIZE = 25;
  var MAX_INITIAL_ITEMS = 125;
  var state = {
    plateId: 4,
    labels: [],
    labelId: null,
    page: 0,
    seen: {},
    exhausted: false,
    items: [],
    loading: false,
    failCount: 0,
    detail: null,
    lines: [],
    activeLine: 0
  };
  var hlsInstance = null;
  var videoEl = document.getElementById('player');
  var sentinel = document.getElementById('loadMoreSentinel');
  var sentinelIO = null;
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function show(id) { document.getElementById(id).classList.remove('hidden'); }
  function hide(id) { document.getElementById(id).classList.add('hidden'); }
  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(t._tm);
    t._tm = setTimeout(function () { t.classList.add('hidden'); }, 2800);
  }
  function setLoading(on, text) {
    document.getElementById('loading').classList.toggle('hidden', !on);
    document.getElementById('loadingText').textContent = text || '加载中…';
  }
  function fmtDur(d) {
    if (!d) return '';
    return String(d).replace(/^0+:0?/, '');
  }
  function timeAgo(sec) {
    if (!sec) return '';
    var diff = Date.now() - sec * 1000;
    if (diff < 0) return '';
    var m = Math.floor(diff / 60000), h = Math.floor(m / 60), d2 = Math.floor(h / 24);
    if (d2 > 0) return d2 + ' 天前';
    if (h > 0) return h + ' 小时前';
    if (m > 0) return m + ' 分钟前';
    return '刚刚';
  }
  var HLS_CDNS = [
    'https://cdn.jsdelivr.net/npm/hls.js@1.5.20/dist/hls.min.js',
    'https://unpkg.com/hls.js@1.5.20/dist/hls.min.js'
  ];
  function loadScript(src) {
    return new Promise(function (res) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = function () { res(true); };
      s.onerror = function () { res(false); };
      document.head.appendChild(s);
    });
  }
  async function ensureHls() {
    if (window.Hls) return true;
    for (var i = 0; i < HLS_CDNS.length; i++) {
      if (await loadScript(HLS_CDNS[i]) && window.Hls) return true;
    }
    return false;
  }
  function cardHtml(v) {
    return '<div class="card" role="button" tabindex="0" data-plate="' + esc(v.plateId) + '" data-video="' + esc(v.videoId) + '">' +
      '<div class="thumb"><img loading="lazy" src="' + esc(v.videoCover || '') + '" alt="" onerror="this.parentNode.classList.add(&quot;noimg&quot;);this.style.display=&quot;none&quot;">' +
      '<span class="dur">' + esc(fmtDur(v.duration)) + '</span></div>' +
      '<div class="info"><div class="t">' + esc(v.videoTitle) + '</div>' +
      '<div class="u"><span class="u-name">' + esc(v.nickName || '') + '</span><span class="u-time">' + (v.updatedTime ? timeAgo(v.updatedTime) : '') + '</span></div></div></div>';
  }
  function renderTabs() {
    var box = document.getElementById('plateTabs');
    box.innerHTML = '';
    PLATES.forEach(function (p) {
      var b = document.createElement('button');
      b.className = 'tab' + (p.id === state.plateId ? ' active' : '');
      b.textContent = p.name;
      b.addEventListener('click', function () {
        if (state.plateId === p.id) return;
        state.plateId = p.id;
        renderTabs();
        loadLabels();
      });
      box.appendChild(b);
    });
  }
  function renderLabelBar() {
    var box = document.getElementById('labelBar');
    box.innerHTML = '';
    if (state.labels.length <= 1) { hide('labelBar'); return; }
    show('labelBar');
    state.labels.forEach(function (l) {
      var b = document.createElement('button');
      b.className = 'chip' + (l.exploreLabelId === state.labelId ? ' active' : '');
      b.textContent = ((l.exploreLabel || l.exploreLabelName || '') + '').trim() || ('分类 ' + l.exploreLabelId);
      b.addEventListener('click', function () {
        if (state.labelId === l.exploreLabelId) return;
        state.labelId = l.exploreLabelId;
        renderLabelBar();
        loadVideos(true);
      });
      box.appendChild(b);
    });
  }
  async function loadLabels() {
    state.labelId = null;
    setLoading(true, '获取分类…');
    try {
      var data = await Core.apiGet('sp/getPlateLabelList', { plateId: state.plateId });
      var ls = (data.plateCenter && data.plateCenter.plateLabelList) || [];
      state.labels = ls;
    } catch (e) {
      state.labels = [];
    }
    if (!state.labels.length) state.labels = [{ exploreLabelId: state.plateId, exploreLabelName: '全部' }];
    state.labelId = state.labels[0].exploreLabelId;
    renderLabelBar();
    await loadVideos(true);
    setLoading(false);
  }
  async function loadVideos(reset) {
    if (state.loading) return;
    if (state.labelId === null || state.labelId === undefined) return;
    if (reset) {
      state.page = 0; state.seen = {}; state.exhausted = false; state.items = [];
      state.failCount = 0;
      document.getElementById('grid').innerHTML = '';
      document.getElementById('listStatus').textContent = '';
    } else if (state.exhausted) {
      return;
    }
    state.loading = true;
    if (document.getElementById('loading').classList.contains('hidden')) {
      document.getElementById('listStatus').textContent = '加载中…';
    }
    try {
      var pages = reset ? Math.max(1, Math.ceil(initialFillCount() / PAGE_SIZE)) : 2;
      var startPage = reset ? 1 : state.page + 1;
      var firstError = null;
      var fetched = await Promise.all(Array.from({ length: pages }, function (_, i) {
        return Core.apiGet('sp/getLabelVideoList', {
          plateId: state.plateId,
          labelId: state.labelId,
          page: startPage + i,
          size: PAGE_SIZE
        }).catch(function (e) { if (firstError === null) firstError = e; return null; });
      }));
      var first = fetched[0];
      if (first === null) throw firstError || new Error('请求失败');
      var list = [];
      for (var i = 0; i < fetched.length; i++) {
        if (fetched[i] === null) continue;
        list = list.concat((fetched[i].videoList || []).filter(function (v) { return v && !v.isAd; }));
      }
      var fresh = [];
      for (var j = 0; j < list.length; j++) {
        var id = String(list[j].videoId);
        if (state.seen[id]) continue;
        state.seen[id] = true;
        fresh.push(list[j]);
      }
      list = fresh;
      if (list.length === 0) state.exhausted = true;
      state.page = startPage + pages - 1;
      state.items = state.items.concat(list);
      if (list.length) {
        document.getElementById('grid').insertAdjacentHTML('beforeend', list.map(cardHtml).join(''));
      }
      state.failCount = 0;
      document.getElementById('listStatus').textContent = state.exhausted
        ? '已全部加载 ' + state.items.length + ' 条'
        : '已加载 ' + state.items.length + ' 条';
      if (!state.exhausted && isSentinelNear()) {
        setTimeout(function () { loadVideos(false); }, 100);
      }
    } catch (e) {
      state.failCount += 1;
      if (state.failCount === 1) { Core.rotateApiBase().catch(function () {}); }
      toast('列表加载失败：' + e.message);
      document.getElementById('listStatus').textContent = '加载失败，滚动后自动重试';
      if (state.failCount <= 3) setTimeout(retriggerSentinel, 2500);
      else document.getElementById('listStatus').textContent = '多次加载失败，请稍后刷新页面重试';
    } finally {
      state.loading = false;
    }
  }
  function isSentinelNear() {
    var rect = sentinel.getBoundingClientRect();
    var vh = window.innerHeight || document.documentElement.clientHeight || 800;
    return rect.top <= vh + 800;
  }
  function initialFillCount() {
    var grid = document.getElementById('grid');
    var width = (grid && grid.clientWidth) || document.documentElement.clientWidth || 1280;
    var gap = 12, min = 150;
    var cols = Math.max(2, Math.floor((width + gap) / (min + gap)));
    var colWidth = (width - (cols - 1) * gap) / cols;
    var cardHeight = colWidth * 4 / 3 + 62;
    var vh = window.innerHeight || document.documentElement.clientHeight || 800;
    var rows = Math.ceil(vh / Math.max(cardHeight, 180)) + 1;
    return Math.min(MAX_INITIAL_ITEMS, Math.max(PAGE_SIZE, cols * rows));
  }
  function retriggerSentinel() {
    if (sentinelIO) { sentinelIO.unobserve(sentinel); sentinelIO.observe(sentinel); }
  }
  function setupInfiniteScroll() {
    if (typeof IntersectionObserver !== 'undefined') {
      sentinelIO = new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].isIntersecting) loadVideos(false);
        }
      }, { rootMargin: '800px 0px' });
      sentinelIO.observe(sentinel);
    } else {
      window.addEventListener('scroll', function () {
        if (isSentinelNear()) loadVideos(false);
      }, { passive: true });
    }
  }
  function autoplay(v) {
    var p = v.play();
    if (p === undefined) return;
    p.catch(function () {
      v.muted = true;
      var q = v.play();
      if (q !== undefined) q.catch(function () {});
      toast('自动播放被浏览器限制，已静音播放；点播放器可开启声音');
    });
  }
  function destroyHls() {
    if (hlsInstance) { try { hlsInstance.destroy(); } catch (e) {} hlsInstance = null; }
    videoEl.pause();
    videoEl.muted = false;
    videoEl.removeAttribute('src');
    videoEl.load();
  }
  function buildLines(vd) {
    var lines = [];
    if (vd.videoUrlOne) lines.push({ n: 1, url: vd.videoUrlOne, name: (vd.videoUrlOne && vd.videoUrlTwo) ? '全球线路' : '线路1' });
    if (vd.videoUrlTwo) lines.push({ n: 2, url: vd.videoUrlTwo, name: (vd.videoUrlOne && vd.videoUrlTwo) ? '优化线路' : '线路2' });
    if (vd.videoUrlThree) lines.push({ n: 3, url: vd.videoUrlThree, name: '高清' });
    return lines;
  }
  async function playLine(i) {
    if (!state.lines.length) return;
    state.activeLine = i;
    hide('playerHint');
    destroyHls();
    var url = state.lines[i].url;
    videoEl.poster = (state.detail && state.detail.videoCover) || '';
    if (!/\.m3u8/i.test(url)) {
      videoEl.src = url;
      autoplay(videoEl);
      return;
    }
    await ensureHls();
    if (window.Hls && window.Hls.isSupported()) {
      var h = new window.Hls({ enableWorker: true });
      h.loadSource(url);
      h.attachMedia(videoEl);
      h.on(window.Hls.Events.ERROR, function (evt, data) {
        if (!data.fatal) return;
        if (data.type === 'networkError') toast('HLS 网络错误，可尝试切换线路');
        else if (data.type === 'mediaError') h.recoverMediaError();
        else { destroyHls(); toast('播放失败，可尝试切换线路'); }
      });
      h.on(window.Hls.Events.MANIFEST_PARSED, function () { autoplay(videoEl); });
      hlsInstance = h;
    } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
      videoEl.src = url;
      autoplay(videoEl);
    } else {
      var mp4 = state.lines.find(function (l) { return !/\.m3u8/i.test(l.url); });
      if (mp4) {
        toast('HLS 组件加载失败，已自动切换 MP4 线路');
        playLine(state.lines.indexOf(mp4));
        return;
      }
      show('playerHint');
    }
  }
  async function openDetail(plateId, videoId) {
    show('detailView');
    document.body.classList.add('noScroll');
    destroyHls();
    try {
      var data = await Core.apiGet('sp/getVideoDetail', { plateId: plateId, videoId: videoId });
      var vd = data.videoDetail;
      state.detail = vd;
      state.lines = buildLines(vd);
      document.title = (vd.videoTitle || '播放') + ' · jvlook';
      if (state.lines.length) {
        var hdIndex = -1;
        for (var i = 0; i < state.lines.length; i++) {
          if (state.lines[i].n === 3) { hdIndex = i; break; }
        }
        playLine(hdIndex >= 0 ? hdIndex : 0);
      } else toast('该视频没有可用线路');
    } catch (e) {
      toast('获取视频失败：' + e.message);
      backToList();
    }
  }
  function backToList() {
    document.title = 'jvlook';
    document.body.classList.remove('noScroll');
    destroyHls();
    hide('detailView');
  }
  function route() {
    var m = (location.hash || '').match(/^#\/detail\?plateId=(\d+)&videoId=(\d+)$/);
    if (m) { openDetail(m[1], m[2]); return; }
    backToList();
  }
  function openCard(e) {
    var card = e.target.closest('.card');
    if (!card) return;
    openDetail(card.getAttribute('data-plate'), card.getAttribute('data-video'));
  }
  document.getElementById('grid').addEventListener('click', openCard);
  document.getElementById('grid').addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var card = e.target.closest('.card');
    if (card) { e.preventDefault(); openDetail(card.getAttribute('data-plate'), card.getAttribute('data-video')); }
  });
  document.getElementById('detailView').addEventListener('click', function (e) {
    if (e.target === document.getElementById('detailView')) backToList();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') backToList();
  });
  window.addEventListener('hashchange', route);
  async function init() {
    renderTabs();
    backToList();
    setupInfiniteScroll();
    ensureHls();
    setLoading(true, '初始化…');
    try { await Core.bootstrap(false); } catch (e) { console.warn('[boot] 配置自愈失败，使用默认配置', e); }
    try { await Core.ensureLogin(); } catch (e) {}
    var m = (location.hash || '').match(/^#\/detail\?plateId=(\d+)&videoId=(\d+)$/);
    if (m) openDetail(m[1], m[2]);
    else loadLabels();
  }
  init();
})();
