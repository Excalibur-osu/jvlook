# jvlook

中文大全镜像的纯静态前端：直接打开 `index.html` 即可浏览、搜索和播放，无广告，无构建依赖。用 `file://`、`localhost` 或局域网 http 地址打开都可以，不要求 HTTPS。

## 数据源

- 内容站点：中文大全（jvlook 镜像网络）。
- 菜单映射：`/plate1` → plateId 4 短视频；`/plate7` → 22 成人视频；`/plate6` → 19 成人天堂；`/plate2` → 5 长视频。路由编号不等于 plateId。
- `url` 请求头同时是站点选择器，并非只校验非空。必须使用 API 认可为 jvlook 租户的域名；跳转域名（`zwfb.mmjvlook.top`、`xdifxzkm.mmjvlook.top` 等 `mmjvlook.top` 子域，以及 `ppjav.com` 系）和发布页的“最新地址”现在只做 301，作为 `url` 时会被解析到另一套占位租户（当前只下发 plateId 17“绅士专区”）：分类接口仍返回旧数据，但视频列表返回 rv 3。
- 源站还下发 AV（`/plate3` → 6）、动漫（`/plate4` → 7）、短剧合集（`/plate5` → 8）、网红/绅士专区（`/dynamic1` → 9、`/dynamic2` → 16）。前三个可复用视频列表/详情接口；专区需要 `/sp/getDynamic*` 等另一套接口，未接入。
- API：主 `https://zdap.gkquu.cn:4438/zd/`，备 `https://zdapi.421573.top/zd/`（ASP.NET / IIS 8.5，应用 zd-app）。
- 内容全部实时请求，无本地数据文件。

## 接口协议

- 请求头：`token`（guid）、`sign`、`timestamp`、`nonce`、`url`（站点域名）。
- GET：`sign = MD5(timestamp + guid + nonce + SALT).toUpperCase()`，`SALT = @1243asd31**21#`。
- POST：`sign = MD5(signParams(body) + timestamp + guid + nonce + SALT)`。
  - `signParams`：按键排序；对象序列化去引号；中文 `encodeURIComponent`；其他含非字母数字的值保持原字符串。
- 设备注册：`POST user/userLogin`，body `{ deviceCode, source }`，每天一次；`returnValue` 998/1000 时重登后重试。
- 响应：`returnValue = 1` 成功；`returnData` 为 AES-128-CBC(Base64) 时解密，key `mh_aes=19@#$@%@#`，iv `5e1y6w452uqw9jq8`。
  - 当前 `sp` 接口的响应都是密文，所以解密是硬依赖。优先用 WebCrypto；`crypto.subtle` 不存在时（非安全上下文：http 的局域网 IP、部分旧浏览器）自动改用内置 AES-CBC 实现，不需要 HTTPS。
- 使用接口：
  - `sp/getNewTabList`：板块列表，条目在 `plateList[].plateVOList`，并下发 `publishPage`。
  - `sp/getPlateLabelList`：`{ plateId }`。
  - `sp/getLabelVideoList`：`{ plateId, labelId, page, size }`。
  - `sp/getSearchList`：`{ plateId, searchName, page, size }`，返回 `videoList/pageSize/total`。
  - `sp/getVideoDetail`：`{ plateId, videoId }`。
  - `sp/getSearchWord`：空参数，返回 `hotSearchList`（约 1000 条，条目 `searchName/searchCount`）；已接入搜索框“热搜”。
- 未接入：`sp/getLovelyList`（猜你喜欢，需 plateId）、`getShortVideoData`（竖屏流）、`getStreamer*`、`getDynamic*`、`getAi*`。`getHomeData` 当前仍返回 rv 998。

## 接口行为

- 分页：`size` 不严格生效，短视频/长视频/短剧合集通常 25 条，成人视频 24 条，成人天堂/AV/动漫通常 30 条；不要用请求的 size 判断末页。
- `total`：短视频/长视频固定为 10000（占位值），其他板块较接近真实总数；翻页按 `plateId + videoId` 去重，空页或整页重复时停止。
- 搜索：按当前分区；匹配可能偏宽，`total` 仅供参考；空关键词返回空列表。
- 稳定性：高峰期连续请求约有 10–20% 会挂起数十秒（不是 4xx/5xx），慢速或并行 5 个请求时更明显；停顿十几秒后恢复正常。列表按页独立提交，某一页失败不会丢弃已成功的页，失败页由再次滚动或“重新加载”补取。
- 字段：`isAd`、`videoLink` 在部分板块/条目中缺失，按可选字段处理；当前样本里 `isAd` 可能不存在，列表项新增 `videoLink`、`searchType`、`updatedTime` 等字段，均按可选处理。
- 线路：`videoUrlOne` 全球 HLS（可能直连 video.twimg.com），`videoUrlTwo` 站方缓存 HLS，`videoUrlThree` 站方缓存 MP4（高清）；短剧合集可能只有 `videoUrlOne`。
- `url` 头缺失返回 rv 3；但 rv 3 也可能是参数错误。不能只用 `getPlateLabelList` 判断域名是否有效，必须实际请求一次 `getLabelVideoList`。
- 部分板块/租户的 `getNewTabList` 会改成扁平结构（`titleType` 组直接带 `plateId/platePath`，`plateVOList` 为 null）；本项目只对接 jvlook 租户的嵌套 `plateVOList` 结构。
- HLS/MP4 CDN 返回 `Access-Control-Allow-Origin: *`；部分旧封面 404，卡片用 `onerror` 占位；播放地址需现取现用。

## 自适应

- 发布页默认 `https://jvlook.top/`，由 `sp/getNewTabList.publishPage` 动态更新。
  - 发布页的 `js/aes.js` 存域名表，CryptoJS 格式（`Salted__` + salt + 密文，EVP_BytesToKey(MD5) 派生 key/iv，AES-256-CBC），密钥 `zdzd#@%@#`。2026-11 的“最新地址”是 `xdifxzkm.mmjvlook.top`，301 到 `ifbbgjob.jvlookdp05.cn`；该名称会轮换，不要写死。
  - 用 `<script>` 跨域加载，只取名称含“中文大全”的条目。
- 前端域名候选：`jvlook.com`（永久，页面需科学上网，但作为 `url` 头可用）、`ifbbgjob.jvlookdp05.cn`（当前直连站点，由发布页最新地址 301 跳转而来）；两者 `url` 头当前都返回同一租户数据。
  - 发布页 `https://jvlook.top/` 仍下发永久地址和“最新地址”。最新地址是跳转域名，不能直接当 `url` 头；发现后必须通过“分类 + 视频列表”双重验证，验证失败不加入候选。
- API 主机：按序探测 `zdap`、`zdapi`，先通先用。
- 配置缓存：`localStorage.zdplayer_config_v2`，TTL 24 小时；v1 因旧域名失效已废弃。
- 恢复：网络错误/5xx 指数退避重试 3 次（单次 12 秒超时）；rv 3 轮换域名一次；重试耗尽切备用 API；登录/域名恢复各最多一次；并发失败共享恢复任务。

## 界面

- 菜单只有一行：一级菜单是分区按钮，二级分类收进按钮的下拉菜单（桌面悬停或点击、移动端点当前分区展开），当前分类以浅色小标签显示在分区名后面。分类按分区懒加载并缓存，切回同一分区不重复请求；下拉层 `position: fixed`，不会被顶部横向滚动容器裁掉。整个 `.stickyhead` 仍为 `position: sticky; top: 0`，滚动时保持悬浮。
- 搜索框展开时按需加载 `sp/getSearchWord` 热搜，最多展示前 10 条去重结果；接口失败时静默隐藏，不影响普通搜索。

## 播放

- 线路优先级：高清 `videoUrlThree` → 优化 `videoUrlTwo` → 全球 `videoUrlOne`；失败自动尝试剩余线路。
- HLS：`hls.js 1.7.3`（jsDelivr/unpkg 按需加载，超时切换），Safari 原生 HLS 兜底；有声自动播放被拦截时静音播放。
- 详情为全屏遮罩，无线路选择/关闭按钮；点击遮罩空白处或按 Esc 关闭。

## 路由

- 详情：`#/detail?plateId=<id>&videoId=<id>`，`plateId` 为正整数，`videoId` 为 `[A-Za-z0-9_-]+`。
- 点击卡片写入 hash，浏览器后退/前进可关闭/重开详情；关闭时用 `history.replaceState` 清除详情 hash，避免刷新重开。
- 无效深链会被清除并回到列表。

## 维护

- 纯静态，无构建、无运行依赖；`index.html` 直接打开。
- Node.js 22+：`node --test tests/core.test.cjs`，覆盖二进制 MD5、发布页 AES 解密、无 WebCrypto 时的 AES 回退、存储不可用、认证重试上限、API 故障切换、域名恢复上限、缓存过期。
