# jvlook

原站这种平台本身就没有原创内容，有广告要变现能理解，还限制必须点击或观看广告才可播放视频

吃相难看，一怒之下，怒了一下，然后就有了这个项目

直接双击 index.html 打开，无广告，即点即播。支持短视频、成人视频、成人天堂、长视频；点击顶部右侧搜索按钮展开悬浮搜索框，搜索当前分区，切换分区会沿用搜索词，清空后返回分类列表。点击外部或按 Esc 收起搜索框。卡片保留视频时长，不再显示更新时间。

技术细节如下

## 数据来源

- 内容站点：中文大全（jvlook 镜像网络），当前菜单映射为 `/plate1` → plateId 4 = 短视频；`/plate7` → plateId 22 = 成人视频；`/plate6` → plateId 19 = 成人天堂；`/plate2` → plateId 5 = 长视频。注意路由编号不等于 plateId；其余接口下发的 AV、动漫、短剧合集及专区暂不加入菜单。
- 接口后端：`https://zdap.gkquu.cn:4438/zd/`（ASP.NET / IIS 8.5，应用名 zd-app）

## 接口协议

- 请求头：token = guid、sign、timestamp、nonce、url（站点域名）
- GET 签名：sign = MD5(timestamp + guid + nonce + SALT).toUpperCase()，SALT = @1243asd31**21#
- POST 签名：sign = MD5(signParams(body) + timestamp + guid + nonce + SALT)
  - signParams：按键排序；对象序列化去引号；中文 encodeURIComponent；其他含非字母数字的值保持原字符串
- 设备注册：POST user/userLogin，body { deviceCode, source }，每天一次
  - returnValue 998 / 1000 时重新注册后重试
- 响应：returnValue = 1 为成功；returnData 为 AES-CBC(Base64) 密文时解密
  - key = mh_aes=19@#$@%@#，iv = 5e1y6w452uqw9jq8
- 接口：
  - sp/getNewTabList —— 板块列表（当前接口下发 9 个板块，菜单使用其中 4 个：短视频、成人视频、成人天堂、长视频；条目位于 plateList[].plateVOList），并下发 publishPage（防走丢发布页地址）
  - sp/getPlateLabelList —— 板块分类
  - sp/getLabelVideoList —— 视频列表，参数 { plateId, labelId, page, size }
  - sp/getSearchList —— 当前分区搜索，参数 { plateId, searchName, page, size }，返回 videoList / pageSize / total
  - sp/getVideoDetail —— 视频详情/播放线路
  - sp/getLovelyList —— 推荐列表

## 接口行为实测

- 短视频/长视频列表通常每页 25 条；成人天堂请求 size=25 时接口可能返回 30 条，不能用请求的 size 判断是否到末页
- 列表 total 不可靠（曾固定为 10000）；搜索会返回 total，但成人视频和成人天堂的搜索匹配可能较宽泛，部分无匹配词也会返回结果。翻页按 plateId + videoId 去重，空页或整页重复时停止
- 并行预取仅提交连续成功页；中途失败保留已有列表，点击“重新加载”从失败页续传。切换分区/分类/关键词后忽略旧请求结果
- 列表条目字段：videoCover、videoTitle、nickName、userName、avatar、duration、
  videoUrlOne/Two/Three、videoLink（源帖链接）、videoDes、videoTag、videoActor、
  updatedTime、videoCoverWidth/Height、searchType、plateId、videoId、isAd
- 三条线路：videoUrlOne 全球线路（m3u8，可能直连 video.twimg.com）、
  videoUrlTwo 优化线路（m3u8，站方缓存）、videoUrlThree 高清（MP4 直链，站方缓存，1080p）
- url 请求头仅被 sp/getLabelVideoList 严格校验：当前验证通过的镜像为
  kklwqis10.jvlookzw04.cn、dwkkjs4.jvlookzw04.cn、jvlook.com；其余旧的 dwkkjs1~3、5~20、jvlookzw04.cn、www.jvlookzw04.cn、zwfb.mmjvlook.top 当前返回 rv 3，已从默认候选移除
- 封面/视频缓存 CDN 域名（jehih2z.xyz、ybxzk33o1.top 等）轮换，播放地址需现取现用

## 自适应

- 发布页：默认 `https://jvlook.top/`（接口 publishPage 字段动态下发）
  - 域名表在 js/aes.js，AES 加密：CryptoJS 格式（"Salted__" + salt + 密文，
    EVP_BytesToKey(MD5) 派生 key/iv，AES-256-CBC），密钥 zdzd#@%@#
  - 用 script 标签跨域加载（浏览器 CORS 限制，脚本标签不受限）
- API 主机候选（按序探测、先通先用）：zdap.gkquu.cn:4438 / zdapi.421573.top（均为 /zd/）
  - 2026-10-05 两者签名探测返回成功；当前源站前端脚本仍配置 zdap.gkquu.cn:4438/zd/，未发现新 API 主机。旧的 zdap2.gkquu.cn / zdap3.gkquu.cn / api.gkquu.cn 不在默认候选中
- 前端域名候选：kklwqis10.jvlookzw04.cn、dwkkjs4.jvlookzw04.cn、jvlook.com（需科学上网）
  - 2026-09-23 发布页“最新地址”跳转到 kklwqis10.jvlookzw04.cn；原站主 API 地址未变化
  - 发布页通常提供跳转入口，跨域限制下不能保证自动获取最终镜像域名，仍保留实测有效的镜像候选
  - 发现到的域名必须经 sp/getLabelVideoList 实测通过才采纳
- 配置缓存：localStorage key = zdplayer_config_v1，TTL 24 小时
- 重试策略：网络错误 / 5xx 指数退避重试 3 次；rv 3（url 头被拒）轮换域名后重试；
  网络重试耗尽后自动切换备用 API 并重放当前查询；登录/域名恢复各最多一次，避免无限重试；并发失败共享恢复任务
- 播放：自动按高清 videoUrlThree → 优化 videoUrlTwo → 全球 videoUrlOne 选择，失败时尝试剩余线路；没有线路选择或关闭按钮，点击遮罩空白处或按 Esc 关闭。HLS 由 hls.js 1.7.3（按需 CDN 加载，超时切换备用 CDN）或 Safari 原生支持；
  浏览器拦截有声自动播放时降级静音播放

## 可能出现的情况

- 站方若同时下架全部 API 主机与发布页，需人工更新 js/core.js 顶部的
  API_BASES / FRONT_HOSTS 候选列表


## 维护验证

- 无需构建或安装运行依赖，仍可直接打开 `index.html`。
- Node.js 22+ 执行 `node --test tests/core.test.cjs`：验证二进制 MD5、发布页 AES 解密、存储不可用、认证重试上限、API 故障切换、域名恢复上限和缓存过期。
- 本次使用 Chrome 验证 file:// 打开、三个分区接口、搜索和清空、移动端布局；用模拟响应验证旧搜索覆盖、分页失败续传和关闭详情后不再播放。
