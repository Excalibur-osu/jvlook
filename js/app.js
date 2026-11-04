(function () {
  'use strict';
  var PLATES = Core.platesFromTabs(null);
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
    failedLines: {},
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
  var labelCache = {};
  var labelPending = {};
  var menuPlateId = null;
  var menuOpenedByHover = false;
  var menuHoverOpen = null;
  var menuHoverClose = null;

  function labelName(l) {
    return ((l && (l.exploreLabel || l.exploreLabelName)) + '').trim() || ('分类 ' + (l && l.exploreLabelId));
  }
  function labelsFor(plateId) {
    return labelCache[plateId] || null;
  }
  // Categories are cached per section. Switching sections loads them once; the
  // dropdown is only rendered for sections that actually have several.
  function loadPlateLabels(plateId) {
    if (labelCache[plateId]) return Promise.resolve(labelCache[plateId]);
    if (labelPending[plateId]) return labelPending[plateId];
    var promise = Core.apiGet('sp/getPlateLabelList', { plateId: plateId }).then(function (data) {
      var labels = (data.plateCenter && data.plateCenter.plateLabelList) || [];
      labelCache[plateId] = labels;
      return labels;
    });
    labelPending[plateId] = promise;
    promise.then(function () {}, function () {}).then(function () {
      if (labelPending[plateId] === promise) labelPending[plateId] = null;
    });
    return promise;
  }
  function currentLabel(plateId) {
    var labels = labelsFor(plateId);
    if (!labels || plateId !== state.plateId || state.labelId == null) return null;
    for (var i = 0; i < labels.length; i++) {
      if (labels[i].exploreLabelId === state.labelId) return labels[i];
    }
    return null;
  }
  function updateTabAria() {
    var tabs = document.querySelectorAll('#plateTabs .tab');
    for (var i = 0; i < tabs.length; i++) {
      var plate = Number(tabs[i].parentNode.getAttribute('data-plate'));
      tabs[i].setAttribute('aria-expanded', String(menuPlateId === plate));
      var labels = labelsFor(plate);
      var selected = currentLabel(plate);
      var plateName = '';
      for (var j = 0; j < PLATES.length; j++) if (PLATES[j].id === plate) plateName = PLATES[j].name;
      var hasMenu = !!(labels && labels.length > 1);
      tabs[i].setAttribute('aria-haspopup', hasMenu ? 'true' : 'false');
      tabs[i].setAttribute('aria-label', (plateName || tabs[i].textContent) + (hasMenu && selected ? '，当前分类 ' + labelName(selected) : '') + (hasMenu ? '，可展开分类菜单' : ''));
    }
  }
  function renderTabs() {
    // Rebuilding the tabs detaches any open popover's anchor.
    closeTabMenu();
    var box = document.getElementById('plateTabs');
    box.innerHTML = '';
    PLATES.forEach(function (p) {
      var item = document.createElement('div');
      item.className = 'tab-item';
      item.setAttribute('data-plate', String(p.id));
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tab' + (p.id === state.plateId ? ' active' : '');
      b.setAttribute('aria-pressed', String(p.id === state.plateId));
      b.setAttribute('aria-haspopup', 'true');
      b.setAttribute('aria-controls', 'tabMenu');
      b.appendChild(document.createTextNode(p.name));
      var labels = labelsFor(p.id);
      var selected = currentLabel(p.id);
      // Only sections with more than one category get a dropdown; the rest
      // would just repeat their single category name.
      var hasMenu = !!(labels && labels.length > 1);
      if (selected && hasMenu) {
        var sub = document.createElement('span');
        sub.className = 'tab-sub';
        sub.textContent = labelName(selected);
        b.appendChild(sub);
      }
      if (hasMenu) {
        var caret = document.createElement('span');
        caret.className = 'tab-caret';
        caret.setAttribute('aria-hidden', 'true');
        b.appendChild(caret);
      }
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        if (state.plateId === p.id) {
          if (!hasMenu) { closeTabMenu(); return; }
          if (menuPlateId === p.id && !menuOpenedByHover) closeTabMenu();
          else openTabMenu(p.id, false);
          return;
        }
        closeTabMenu();
        state.plateId = p.id;
        renderTabs();
        loadLabels();
      });
      if (hasMenu) {
        b.addEventListener('keydown', function (e) {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            openTabMenu(p.id, false);
            focusTabMenuItem(0);
          } else if (e.key === 'Escape' && menuPlateId === p.id) {
            e.preventDefault();
            closeTabMenu();
          }
        });
        b.addEventListener('pointerenter', function (e) {
          if (e.pointerType && e.pointerType !== 'mouse') return;
          clearTimeout(menuHoverClose);
          clearTimeout(menuHoverOpen);
          menuHoverOpen = setTimeout(function () { openTabMenu(p.id, true); }, 140);
        });
        b.addEventListener('pointerleave', function (e) {
          if (e.pointerType && e.pointerType !== 'mouse') return;
          clearTimeout(menuHoverOpen);
          clearTimeout(menuHoverClose);
          menuHoverClose = setTimeout(closeTabMenu, 260);
        });
      }
      item.appendChild(b);
      box.appendChild(item);
    });
    updateTabAria();
  }
  function fillTabMenu(plateId) {
    var menu = document.getElementById('tabMenu');
    var labels = labelsFor(plateId) || [];
    menu.innerHTML = '';
    if (!labels.length) {
      var note = document.createElement('div');
      note.className = 'tabmenu-note';
      note.textContent = '暂无分类';
      menu.appendChild(note);
      return;
    }
    labels.forEach(function (l) {
      var checked = plateId === state.plateId && l.exploreLabelId === state.labelId;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tabmenu-item' + (checked ? ' active' : '');
      b.setAttribute('role', 'menuitemradio');
      b.setAttribute('aria-checked', String(checked));
      b.textContent = labelName(l);
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        selectLabel(plateId, l.exploreLabelId);
      });
      menu.appendChild(b);
    });
  }
  function positionTabMenu() {
    var menu = document.getElementById('tabMenu');
    var item = menuPlateId == null ? null : document.querySelector('#plateTabs .tab-item[data-plate="' + menuPlateId + '"]');
    if (!item) return;
    var rect = item.getBoundingClientRect();
    var viewportW = window.innerWidth || document.documentElement.clientWidth || 360;
    var viewportH = window.innerHeight || document.documentElement.clientHeight || 640;
    menu.style.visibility = 'hidden';
    menu.style.left = '0px';
    menu.style.top = '0px';
    var width = menu.offsetWidth, height = menu.offsetHeight;
    var left = rect.left + rect.width / 2 - width / 2;
    left = Math.max(8, Math.min(left, viewportW - width - 8));
    var top = rect.bottom + 8;
    if (top + height > viewportH - 8) top = Math.max(8, rect.top - height - 8);
    menu.style.left = Math.round(left) + 'px';
    menu.style.top = Math.round(top) + 'px';
    menu.style.visibility = '';
  }
  function openTabMenu(plateId, byHover) {
    var labels = labelsFor(plateId);
    if (!labels || labels.length <= 1) return;
    clearTimeout(menuHoverOpen);
    clearTimeout(menuHoverClose);
    menuPlateId = plateId;
    menuOpenedByHover = !!byHover;
    var menu = document.getElementById('tabMenu');
    menu.classList.remove('hidden');
    fillTabMenu(plateId);
    positionTabMenu();
    updateTabAria();
  }
  function closeTabMenu() {
    clearTimeout(menuHoverOpen);
    clearTimeout(menuHoverClose);
    if (menuPlateId == null) return;
    menuPlateId = null;
    menuOpenedByHover = false;
    var menu = document.getElementById('tabMenu');
    menu.classList.add('hidden');
    menu.innerHTML = '';
    updateTabAria();
  }
  function focusTabMenuItem(index) {
    var items = document.querySelectorAll('#tabMenu .tabmenu-item');
    if (!items.length) return;
    items[Math.max(0, Math.min(index, items.length - 1))].focus();
  }
  function selectLabel(plateId, labelId) {
    closeTabMenu();
    closeSearch(false);
    if (state.keyword) {
      state.keyword = '';
      document.getElementById('searchInput').value = '';
      document.getElementById('clearSearch').classList.add('hidden');
      document.getElementById('searchToggle').classList.remove('searching');
    }
    state.plateId = plateId;
    state.labels = labelsFor(plateId) || state.labels;
    state.labelId = labelId;
    renderTabs();
    loadVideos(true);
    // The tab button is rebuilt by renderTabs, so focus the new node.
    var trigger = document.querySelector('#plateTabs .tab-item[data-plate="' + plateId + '"] .tab');
    if (trigger) trigger.focus({ preventScroll: true });
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
    renderTabs();
    if (state.keyword) { loadVideos(true); return; }
    try {
      var labels = await loadPlateLabels(plateId);
      if (revision !== state.revision) return;
      if (!labels.length) throw new Error('该分区暂时没有分类');
      state.labels = labels;
      state.labelId = labels[0].exploreLabelId;
      renderTabs();
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
      // Commit every page that arrived before the first failure, so one stalled
      // request cannot discard the pages that already succeeded. The failed page
      // stays uncommitted and is fetched again on the next scroll or retry.
      var pageError = null, committed = 0;
      for (var i = 0; i < fetched.length; i++) {
        if (fetched[i].error) { pageError = fetched[i].error; break; }
        var videos = fetched[i].data && fetched[i].data.videoList;
        if (!Array.isArray(videos)) { pageError = new Error('视频列表格式异常'); break; }
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
        committed += 1;
        if (list.length) document.getElementById('grid').insertAdjacentHTML('beforeend', list.map(cardHtml).join(''));
        if (!videos.length || (!list.length && videos.some(function (v) { return v && !v.isAd; }))) {
          state.exhausted = true;
          break;
        }
      }
      if (pageError && !committed) throw pageError;
      state.failCount = 0;
      var prefix = keyword ? '“' + keyword + '” · ' : '';
      if (pageError) {
        document.getElementById('listStatus').textContent = prefix + '已加载 ' + state.items.length + ' 条（部分请求超时，可点重新加载）';
        show('retryList');
      } else {
        document.getElementById('listStatus').textContent = prefix + (!state.items.length && state.exhausted
          ? (keyword ? '没有找到相关视频' : '暂无视频')
          : (state.exhausted ? '已全部加载 ' : '已加载 ') + state.items.length + ' 条');
        if (!state.exhausted && isSentinelNear()) {
          setTimeout(function () { if (revision === state.revision) loadVideos(false); }, 100);
        }
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
  var hotSearchLoaded = false;
  var hotSearchPromise = null;
  function renderHotSearch(items) {
    var box = document.getElementById('hotSearch');
    box.innerHTML = '';
    if (!items.length) { hide('hotSearch'); return; }
    var label = document.createElement('span');
    label.className = 'hotsearch-label';
    label.textContent = '热搜';
    box.appendChild(label);
    items.forEach(function (item) {
      var name = String((item && item.searchName) || '').trim();
      if (!name) return;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'hot-chip';
      b.textContent = name;
      b.title = name;
      b.addEventListener('click', function () {
        document.getElementById('searchInput').value = name;
        search(name);
        closeSearch(true);
      });
      box.appendChild(b);
    });
    show('hotSearch');
  }
  function loadHotSearch() {
    if (hotSearchLoaded || hotSearchPromise) return;
    hotSearchPromise = Core.apiGet('sp/getSearchWord', {}).then(function (data) {
      hotSearchLoaded = true;
      var list = (data && data.hotSearchList) || [];
      var seen = {};
      var picked = [];
      for (var i = 0; i < list.length && picked.length < 10; i++) {
        var name = String((list[i] && list[i].searchName) || '').trim();
        if (!name || seen[name]) continue;
        seen[name] = true;
        picked.push({ searchName: name });
      }
      renderHotSearch(picked);
    }).catch(function () {
      hide('hotSearch');
    }).finally(function () { hotSearchPromise = null; });
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
      if (v.error) { playbackFailed('播放失败'); return; }
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
  function preferredLine() {
    for (var n = 3; n >= 1; n--) {
      for (var i = 0; i < state.lines.length; i++) {
        if (state.lines[i].n === n && !state.failedLines[i]) return i;
      }
    }
    return -1;
  }
  function playbackFailed(message) {
    if (document.getElementById('detailView').classList.contains('hidden') || !state.lines.length) return;
    state.failedLines[state.activeLine] = true;
    var next = preferredLine();
    if (next >= 0) {
      toast(message + '，已切换至' + state.lines[next].name);
      playLine(next);
    } else {
      destroyHls();
      toast(message + '，所有线路均不可用');
    }
  }
  async function playLine(i) {
    if (!state.lines[i]) return;
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
        if (revision !== playbackRevision || !data.fatal) return;
        playbackFailed('HLS 播放失败');
      });
      h.on(window.Hls.Events.MANIFEST_PARSED, function () { if (revision === playbackRevision) autoplay(videoEl); });
      hlsInstance = h;
    } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
      videoEl.src = url;
      autoplay(videoEl);
    } else {
      playbackFailed('HLS 组件加载失败');
    }
  }
  async function openDetail(plateId, videoId) {
    var revision = ++detailRevision;
    hide('playerHint');
    show('detailView');
    document.body.classList.add('noScroll');
    destroyHls();
    state.detail = null;
    state.lines = [];
    state.failedLines = {};
    try {
      var data = await Core.apiGet('sp/getVideoDetail', { plateId: plateId, videoId: videoId });
      if (revision !== detailRevision) return;
      var vd = data.videoDetail;
      if (!vd) throw new Error('视频详情为空');
      state.detail = vd;
      state.lines = buildLines(vd);
      document.title = (vd.videoTitle || '播放') + ' · jvlook';
      if (state.lines.length) {
        playLine(preferredLine());
      } else toast('该视频没有可用线路');
    } catch (e) {
      if (revision !== detailRevision) return;
      toast('获取视频失败：' + e.message);
      backToList();
    }
  }
  function detailHash(plateId, videoId) {
    return '#/detail?plateId=' + encodeURIComponent(plateId) + '&videoId=' + encodeURIComponent(videoId);
  }
  function clearDetailHash() {
    if (!/^#\/detail\?/.test(location.hash || '')) return;
    try { history.replaceState(null, '', location.pathname + location.search); }
    catch (e) { location.hash = ''; }
  }
  function backToList(keepHash) {
    detailRevision += 1;
    document.title = 'jvlook';
    document.body.classList.remove('noScroll');
    destroyHls();
    hide('detailView');
    if (!keepHash) clearDetailHash();
  }
  function route() {
    var detail = Core.parseDetailRoute(location.hash);
    if (detail) { openDetail(detail.plateId, detail.videoId); return; }
    backToList();
  }
  function openCardById(plateId, videoId) {
    if (!plateId || !videoId) return;
    var hash = detailHash(plateId, videoId);
    if (location.hash === hash) { openDetail(plateId, videoId); return; }
    location.hash = hash;
  }
  function openCard(e) {
    var card = e.target.closest('.card');
    if (!card) return;
    openCardById(card.getAttribute('data-plate'), card.getAttribute('data-video'));
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
    loadHotSearch();
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
  var tabMenuEl = document.getElementById('tabMenu');
  tabMenuEl.addEventListener('pointerenter', function (e) {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    clearTimeout(menuHoverClose);
  });
  tabMenuEl.addEventListener('pointerleave', function (e) {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    clearTimeout(menuHoverClose);
    menuHoverClose = setTimeout(closeTabMenu, 200);
  });
  tabMenuEl.addEventListener('keydown', function (e) {
    var items = Array.prototype.slice.call(tabMenuEl.querySelectorAll('.tabmenu-item'));
    var index = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!items.length) return;
      e.preventDefault();
      var step = e.key === 'ArrowDown' ? 1 : -1;
      items[(index + step + items.length) % items.length].focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      var plate = menuPlateId;
      closeTabMenu();
      var trigger = plate == null ? null : document.querySelector('#plateTabs .tab-item[data-plate="' + plate + '"] .tab');
      if (trigger) trigger.focus();
    } else if (e.key === 'Tab') {
      closeTabMenu();
    }
  });
  document.addEventListener('click', function (e) {
    if (!e.target.closest('#tabMenu, #plateTabs .tab-item')) closeTabMenu();
  });
  document.getElementById('plateTabs').addEventListener('scroll', closeTabMenu, { passive: true });
  window.addEventListener('resize', function () { if (menuPlateId != null) positionTabMenu(); });
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
  videoEl.addEventListener('error', function () { playbackFailed('视频加载失败'); });
  document.getElementById('grid').addEventListener('click', openCard);
  document.getElementById('grid').addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var card = e.target.closest('.card');
    if (card) { e.preventDefault(); openCardById(card.getAttribute('data-plate'), card.getAttribute('data-video')); }
  });
  document.getElementById('detailView').addEventListener('click', function (e) {
    if (e.target === document.getElementById('detailView')) backToList();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (menuPlateId != null) {
      e.preventDefault();
      closeTabMenu();
      return;
    }
    if (document.getElementById('searchToggle').getAttribute('aria-expanded') === 'true') {
      e.preventDefault();
      closeSearch(true);
    } else backToList();
  });
  window.addEventListener('hashchange', route);
  async function init() {
    renderTabs();
    backToList(true);
    setupInfiniteScroll();
    setLoading(true, '初始化…');
    try { await Core.bootstrap(false); } catch (e) { console.warn('[boot] 配置自愈失败，使用默认配置', e); }
    try { await Core.ensureLogin(); } catch (e) {}
    try {
      PLATES = Core.platesFromTabs(await Core.apiGet('sp/getNewTabList'));
      state.plateId = PLATES[0].id;
      renderTabs();
    } catch (e) { console.warn('[tabs] 板块同步失败，使用默认菜单', e); }
    var detail = Core.parseDetailRoute(location.hash);
    if (!detail) clearDetailHash();
    setLoading(false);
    loadLabels();
    if (detail) openDetail(detail.plateId, detail.videoId);
  }
  init();
})();
