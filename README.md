# jvlook

中文大全镜像的纯静态前端：直接打开 `index.html` 即可浏览、搜索和播放，无广告，无构建依赖。

## 数据源

- 内容站点：中文大全（jvlook 镜像网络）。
- 菜单映射：`/plate1` → plateId 4 短视频；`/plate7` → 22 成人视频；`/plate6` → 19 成人天堂；`/plate2` → 5 长视频。路由编号不等于 plateId。
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
- 使用接口：
  - `sp/getNewTabList`：板块列表，条目在 `plateList[].plateVOList`，并下发 `publishPage`。
  - `sp/getPlateLabelList`：`{ plateId }`。
  - `sp/getLabelVideoList`：`{ plateId, labelId, page, size }`。
  - `sp/getSearchList`：`{ plateId, searchName, page, size }`，返回 `videoList/pageSize/total`。
  - `sp/getVideoDetail`：`{ plateId, videoId }`。
- 未接入：`getSearchWord`（热搜）、`getDayLovelyList`（首页“猜你喜欢”，空参数，每次约 20 条）、`getShortVideoData`（竖屏流）、`getStreamer*`、`getDynamic*`；`getHomeData` 当前返回 rv 998。

## 接口行为

- 分页：`size` 不严格生效，短视频/长视频/短剧合集通常 25 条，成人视频 24 条，成人天堂/AV/动漫通常 30 条；不要用请求的 size 判断末页。
- `total`：短视频/长视频固定为 10000（占位值），其他板块较接近真实总数；翻页按 `plateId + videoId` 去重，空页或整页重复时停止。
- 搜索：按当前分区；匹配可能偏宽，`total` 仅供参考；空关键词返回空列表。
- 字段：`isAd`、`videoLink` 在部分板块/条目中缺失，按可选字段处理。
- 线路：`videoUrlOne` 全球 HLS（可能直连 video.twimg.com），`videoUrlTwo` 站方缓存 HLS，`videoUrlThree` 站方缓存 MP4（高清）；短剧合集可能只有 `videoUrlOne`。
- `url` 头当前只校验非空：缺失返回 rv 3，但 rv 3 也可能是参数错误；域名轮换仅作兜底。
- HLS/MP4 CDN 返回 `Access-Control-Allow-Origin: *`；部分旧封面 404，卡片用 `onerror` 占位；播放地址需现取现用。

## 自适应

- 发布页默认 `https://jvlook.top/`，由 `sp/getNewTabList.publishPage` 动态更新。
  - 发布页的 `js/aes.js` 存域名表，CryptoJS 格式（`Salted__` + salt + 密文，EVP_BytesToKey(MD5) 派生 key/iv，AES-256-CBC），密钥 `zdzd#@%@#`。
  - 用 `<script>` 跨域加载，只取名称含“中文大全”的条目。
- 前端域名候选：`zwfb.mmjvlook.top`（最新）、`kklwqis10.jvlookzw04.cn`、`dwkkjs4.jvlookzw04.cn`、`jvlook.com`（永久，需科学上网）。
  - 发现新域名后追加候选并探测；但 `url` 头不校验域名，探测只证明接口可用，不证明首页可访问。
- API 主机：按序探测 `zdap`、`zdapi`，先通先用。
- 配置缓存：`localStorage.zdplayer_config_v1`，TTL 24 小时。
- 恢复：网络错误/5xx 指数退避重试 3 次；rv 3 轮换域名一次；重试耗尽切备用 API；登录/域名恢复各最多一次；并发失败共享恢复任务。

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
- Node.js 22+：`node --test tests/core.test.cjs`，覆盖二进制 MD5、发布页 AES 解密、存储不可用、认证重试上限、API 故障切换、域名恢复上限、缓存过期。
