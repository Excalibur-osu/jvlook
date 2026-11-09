# jvlook

中文大全镜像的纯静态前端，无构建、无 npm 依赖；`index.html` 可直接用 `file://`、`localhost` 或局域网 HTTP 打开，不要求 HTTPS。

## 数据源

- 内容：中文大全（jvlook 镜像网络），全部实时请求，无本地数据文件。
- API：主 `https://zdap.gkquu.cn:4438/zd/`，备 `https://zdapi.421573.top/zd/`。
- 分区：`/plate7` → 22 成人视频；`/plate6` → 19 成人天堂；`/plate1` → 4 短视频；`/plate2` → 5 长视频。路由号不等于 plateId；只展示 `SUPPORTED_PLATES` 中的这 4 个，其他路径丢弃。
- `url` 请求头是租户选择器：必须是 API 认可的 jvlook 域名。跳转域名或发布页“最新地址”会落到占位租户（扁平 `plateList`、空 `videoList`），因此域名验证要求“嵌套 `plateVOList` + 至少一个分区视频列表非空”。

## 接口协议

- 请求头：`token`（guid）、`sign`、`timestamp`、`nonce`、`url`。
- GET：`sign = MD5(timestamp + guid + nonce + SALT).toUpperCase()`，`SALT = @1243asd31**21#`。
- POST：`sign = MD5(signParams(body) + timestamp + guid + nonce + SALT)`。
  - `signParams`：键排序；对象序列化去引号；中文 `encodeURIComponent`；其他含非字母数字的值保持原样。
- 设备注册：`POST user/userLogin`，body `{ deviceCode, source }`，每天一次；rv 998/1000 时重登后重试。
- 响应：rv 1 成功；`returnData` 为 AES-128-CBC(Base64) 时解密，key `mh_aes=19@#$@%@#`，iv `5e1y6w452uqw9jq8`。优先 WebCrypto，非安全上下文回退内置 AES-CBC。
- 接口：

| 接口 | 参数 | 说明 |
|---|---|---|
| `sp/getNewTabList` | 无 | 分区 `plateList[].plateVOList`、`publishPage` |
| `sp/getPlateLabelList` | `plateId` | 分类 |
| `sp/getLabelVideoList` | `plateId, labelId, page, size` | 视频列表 |
| `sp/getSearchList` | `plateId, searchName, page, size` | `videoList/pageSize/total` |
| `sp/getVideoDetail` | `plateId, videoId` | 详情与播放地址 |
| `sp/getSearchWord` | 无 | `hotSearchList` |

## 接口行为

- 分页/总数：`size` 不严格生效（成人视频约 24、成人天堂约 30、短视频/长视频约 25）；成人视频约 1200、成人天堂约 1000，短视频/长视频的 `total` 为 10000 占位值。列表按 `plateId + videoId` 去重，空页或整页重复即停止。
- 搜索：仅当前分区；匹配偏宽，`total` 仅供参考；空关键词返回空列表。
- 稳定性：高峰期约 10–20% 请求会挂起数十秒；列表按页独立提交，失败页可由滚动或“重新加载”补取。
- 字段：`isAd`、`videoLink` 等可能缺失，按可选字段处理；旧封面可能 404，卡片用 `onerror` 占位。
- 播放地址：`videoUrlOne` 全球 HLS/MP4，`videoUrlTwo` 站方缓存 HLS/MP4，`videoUrlThree` 站方缓存高清 MP4；成人视频/成人天堂通常只有 One/Two，短视频/长视频三条齐全。地址需现取现用，CDN 返回 `Access-Control-Allow-Origin: *`。
- 错误/布局：rv 3 可能是 `url` 缺失、参数错误或分区下线；只接受嵌套 `plateVOList`，扁平 `plateList` 为占位租户。

## 域名与自愈

- 发布页默认 `https://jvlook.top/`，由 `getNewTabList.publishPage` 更新。
- 发布页 `js/aes.js` 为 CryptoJS 格式（`Salted__` + salt + 密文，EVP_BytesToKey(MD5) 派生 key/iv，AES-256-CBC），密钥 `zdzd#@%@#`；跨域脚本加载后只取名称含“中文大全”的条目。最新地址会轮换，不能写死。
- 前端域名候选：`jvlook.com`、`ifbbgjob.jvlookdp05.cn`。最新地址是跳转域名，验证失败不加入候选。
- API 主机按序探测 `zdap`、`zdapi`。
- 配置缓存 `localStorage.zdplayer_config_v3`（TTL 24 小时）；网络/5xx 重试 3 次（单次 12 秒超时），rv 3 轮换域名一次，失败切备用 API；登录、域名恢复各最多一次，并发失败共享任务。

## 播放

- 固定单线路：`videoUrlThree` → `videoUrlTwo` → `videoUrlOne` 只选一条，失败只提示，不自动切换。
- HLS 固定最高档：`hls.js 1.7.3`（jsDelivr/unpkg 按需加载）；`autoStartLoad:false`，`MANIFEST_PARSED` 后锁定最高分辨率 `currentLevel`，并启用 `preserveManualLevelOnError`、关闭 `capLevelToPlayerSize`，首个分片即最高档。MP4 直接设置 `video.src`。
- 不支持 MSE 的浏览器（Safari）走原生 HLS，ABR 由系统控制；有声自动播放被拦截时静音重试。
- 播放器左上角显示固定线路与实际分辨率；详情为全屏遮罩，无线路选择/关闭按钮，点击遮罩空白处或按 Esc 关闭。

## 路由与界面

- 详情：`#/detail?plateId=<id>&videoId=<id>`；`plateId` 为正整数，`videoId` 为 `[A-Za-z0-9_-]+`。
- 卡片点击写 hash，前进/后退可关闭/重开；关闭时用 `history.replaceState` 清除详情 hash；无效深链清除并回列表。
- 顶部分区按钮一行（4 个）；分类在按钮下拉菜单中按分区懒加载并缓存；搜索展开时按需加载热搜，最多 10 条去重，接口失败静默隐藏。

## 维护

- Node.js 22+：`node --test tests/core.test.cjs`。覆盖认证/恢复上限、占位租户拒绝、分区过滤、固定线路、HLS 最高档与缓存。
