(function () {
  'use strict';
  var PLATES = [
    { id: 4, name: '短视频1', path: '/plate1' },
    { id: 19, name: '短视频2', path: '/plate6' },
    { id: 5, name: '长视频', path: '/plate2' }
  ];
  var PAGE_SIZE = 25;
  var MAX_INITIAL_ITEMS = 125;
  var state = {
    plateId: 4,
    keyword: '',
    revision: 0,
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
  var detailRevision = 0;
  var playbackRevision = 0;
  var hlsPromise = null;
  var videoEl = document.getElementById('player');
  var sentinel = document.getElementById('loadMoreSentinel');
  var sentinelIO = null;
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
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
  var HLS_CDNS = [
    'https://cdn.jsdelivr.net/npm/hls.js@1.7.3/dist/hls.min.js',
    'https://unpkg.com/hls.js@1.7.3/dist/hls.min.js'
  ];
  function loadScript(src) {
    return new Promise(function (resolve) {
      var s = document.createElement('script');
      var timer = setTimeout(function () { finish(false); }, 8000);
      function finish(ok) {
        clearTimeout(timer);
        s.onload = s.onerror = null;
        if (!ok) s.remove();
        resolve(ok);
      }
      s.src = src;
      s.onload = function () { finish(true); };
      s.onerror = function () { finish(false); };
      document.head.appendChild(s);
    });
  }
  function ensureHls() {
    if (window.Hls) return Promise.resolve(true);
    if (hlsPromise) return hlsPromise;
    hlsPromise = (async function () {
      for (var i = 0; i < HLS_CDNS.length; i++) {
        if (await loadScript(HLS_CDNS[i]) && window.Hls) return true;
      }
      return false;
    })().finally(function () { hlsPromise = null; });
    return hlsPromise;
  }
  function fmtDur(d) {
    if (!d) return '';
    return String(d).replace(/^0+:0?/, '');
  }
  function cardHtml(v) {
    return '<div class="card" role="button" tabindex="0" data-plate="' + esc(v.plateId) + '" data-video="' + esc(v.videoId) + '">' +
      '<div class="thumb"><img loading="lazy" src="' + esc(v.videoCover || '') + '" alt="" onerror="this.parentNode.classList.add(&quot;noimg&quot;);this.style.display=&quot;none&quot;">' +
      (v.duration ? '<span class="dur">' + esc(fmtDur(v.duration)) + '</span>' : '') + '</div>' +
      '<div class="info"><div class="t">' + esc(v.videoTitle) + '</div>' +
      '<div class="u"><span class="u-name">' + esc(v.nickName || '') + '</span></div></div></div>';
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
    if (state.keyword || state.labels.length <= 1) { hide('labelBar'); return; }
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
  function resetList() {
    state.revision += 1;
    state.loading = false;
    state.page = 0;
    state.seen = {};
    state.exhausted = false;
    state.items = [];
    state.failCount = 0;
    document.getElementById('grid').innerHTML = '';
    document.getElementById('listStatus').textContent = '加载中…';
    hide('retryList');
  }
  async function loadLabels() {
    resetList();
    var revision = state.revision;
    var plateId = state.plateId;
    state.labelId = null;
    state.labels = [];
    renderLabelBar();
    if (state.keyword) { loadVideos(true); return; }
    try {
      var data = await Core.apiGet('sp/getPlateLabelList', { plateId: plateId });
      if (revision !== state.revision) return;
      state.labels = (data.plateCenter && data.plateCenter.plateLabelList) || [];
      if (!state.labels.length) throw new Error('该分区暂时没有分类');
      state.labelId = state.labels[0].exploreLabelId;
      renderLabelBar();
      await loadVideos(true);
    } catch (e) {
      if (revision !== state.revision) return;
      document.getElementById('listStatus').textContent = '分类加载失败：' + e.message;
      show('retryList');
    }
  }
  async function loadVideos(reset) {
    if (!state.keyword && state.labelId == null) return;
    if (reset) resetList();
    else if (state.loading || state.exhausted || state.failCount) return;
    var revision = state.revision;
    var plateId = state.plateId;
    var keyword = state.keyword;
    var labelId = state.labelId;
    state.loading = true;
    document.getElementById('listStatus').textContent = keyword ? '正在搜索“' + keyword + '”…' : '加载中…';
    hide('retryList');
    try {
      var pages = reset ? Math.max(1, Math.ceil(initialFillCount() / PAGE_SIZE)) : 2;
      var startPage = state.page + 1;
      var fetched = await Promise.all(Array.from({ length: pages }, function (_, i) {
        var params = { plateId: plateId, page: startPage + i, size: PAGE_SIZE };
        if (keyword) params.searchName = keyword;
        else params.labelId = labelId;
        return Core.apiGet(keyword ? 'sp/getSearchList' : 'sp/getLabelVideoList', params)
          .then(function (data) { return { data: data }; }, function (error) { return { error: error }; });
      }));
      if (revision !== state.revision) return;
      // Only commit consecutive successful pages, so failed pages are never skipped.
      for (var i = 0; i < fetched.length; i++) {
        if (fetched[i].error) throw fetched[i].error;
        var videos = fetched[i].data && fetched[i].data.videoList;
        if (!Array.isArray(videos)) throw new Error('视频列表格式异常');
        var list = videos.filter(function (v) {
          if (!v || v.isAd || v.videoId == null) return false;
          var id = String(v.plateId || plateId) + ':' + String(v.videoId);
          if (state.seen[id]) return false;
          state.seen[id] = true;
          if (v.plateId == null) v.plateId = plateId;
          return true;
        });
        state.page = startPage + i;
        state.items = state.items.concat(list);
        if (list.length) document.getElementById('grid').insertAdjacentHTML('beforeend', list.map(cardHtml).join(''));
        if (!videos.length || (!list.length && videos.some(function (v) { return v && !v.isAd; }))) {
          state.exhausted = true;
          break;
        }
      }
      state.failCount = 0;
      var prefix = keyword ? '“' + keyword + '” · ' : '';
      document.getElementById('listStatus').textContent = prefix + (!state.items.length && state.exhausted
        ? (keyword ? '没有找到相关视频' : '暂无视频')
        : (state.exhausted ? '已全部加载 ' : '已加载 ') + state.items.length + ' 条');
      if (!state.exhausted && isSentinelNear()) {
        setTimeout(function () { if (revision === state.revision) loadVideos(false); }, 100);
      }
    } catch (e) {
      if (revision !== state.revision) return;
      state.failCount += 1;
      document.getElementById('listStatus').textContent = '加载失败：' + e.message;
      show('retryList');
    } finally {
      if (revision === state.revision) state.loading = false;
    }
  }
  function search(keyword) {
    state.keyword = keyword.trim();
    document.getElementById('searchInput').value = state.keyword;
    document.getElementById('clearSearch').classList.toggle('hidden', !state.keyword);
    document.getElementById('searchToggle').classList.toggle('searching', !!state.keyword);
    window.scrollTo(0, 0);
    loadLabels();
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
    var revision = playbackRevision;
    var p = v.play();
    if (p === undefined) return;
    p.catch(function () {
      if (revision !== playbackRevision) return;
      v.muted = true;
      var q = v.play();
      if (q !== undefined) q.catch(function () {});
      toast('自动播放被浏览器限制，已静音播放；点播放器可开启声音');
    });
  }
  function destroyHls() {
    playbackRevision += 1;
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
    var revision = playbackRevision;
    var url = state.lines[i].url;
    videoEl.poster = (state.detail && state.detail.videoCover) || '';
    if (!/\.m3u8/i.test(url)) {
      videoEl.src = url;
      autoplay(videoEl);
      return;
    }
    if (!videoEl.canPlayType('application/vnd.apple.mpegurl')) await ensureHls();
    if (revision !== playbackRevision) return;
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
    var revision = ++detailRevision;
    hide('playerHint');
    show('detailView');
    document.body.classList.add('noScroll');
    destroyHls();
    try {
      var data = await Core.apiGet('sp/getVideoDetail', { plateId: plateId, videoId: videoId });
      if (revision !== detailRevision) return;
      var vd = data.videoDetail;
      if (!vd) throw new Error('视频详情为空');
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
      if (revision !== detailRevision) return;
      toast('获取视频失败：' + e.message);
      backToList();
    }
  }
  function backToList() {
    detailRevision += 1;
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
  function closeSearch(restoreFocus) {
    hide('searchForm');
    document.getElementById('searchToggle').setAttribute('aria-expanded', 'false');
    if (restoreFocus) document.getElementById('searchToggle').focus();
  }
  document.getElementById('searchToggle').addEventListener('click', function () {
    if (this.getAttribute('aria-expanded') === 'true') { closeSearch(true); return; }
    show('searchForm');
    this.setAttribute('aria-expanded', 'true');
    var input = document.getElementById('searchInput');
    input.value = state.keyword;
    input.focus();
    input.select();
  });
  function dismissSearch(e) {
    if (!e.target.closest('#searchForm, #searchToggle')) closeSearch(false);
  }
  document.addEventListener('click', dismissSearch);
  document.addEventListener('focusin', dismissSearch);
  document.getElementById('searchForm').addEventListener('submit', function (e) {
    e.preventDefault();
    search(document.getElementById('searchInput').value);
    closeSearch(true);
  });
  document.getElementById('clearSearch').addEventListener('click', function () { search(''); closeSearch(true); });
  document.getElementById('searchInput').addEventListener('search', function () {
    if (!this.value && state.keyword) search('');
  });
  document.getElementById('retryList').addEventListener('click', function () {
    state.failCount = 0;
    if (!state.keyword && state.labelId == null) loadLabels();
    else loadVideos(false);
  });
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
    if (e.key !== 'Escape') return;
    if (document.getElementById('searchToggle').getAttribute('aria-expanded') === 'true') {
      e.preventDefault();
      closeSearch(true);
    } else backToList();
  });
  window.addEventListener('hashchange', route);
  async function init() {
    renderTabs();
    backToList();
    setupInfiniteScroll();
    setLoading(true, '初始化…');
    try { await Core.bootstrap(false); } catch (e) { console.warn('[boot] 配置自愈失败，使用默认配置', e); }
    try { await Core.ensureLogin(); } catch (e) {}
    var m = (location.hash || '').match(/^#\/detail\?plateId=(\d+)&videoId=(\d+)$/);
    setLoading(false);
    loadLabels();
    if (m) openDetail(m[1], m[2]);
  }
  init();
})();
