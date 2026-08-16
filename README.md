# jvlook

原站这种平台本身就没有原创内容，有广告要变现能理解，还限制必须点击或观看广告才可播放视频

吃相难看，一怒之下，怒了一下，然后就有了这个项目

直接双击 index.html 打开，无广告，即点即播

技术细节如下

## 数据来源

- 内容站点：中文大全（jvlook 镜像网络），plateId 4 = 短视频，plateId 5 = 长视频
- 接口后端：[https://zdap.gkquu.cn:4438/zd/](https://zdap.gkquu.cn:4438/zd/)（ASP.NET / IIS 8.5，应用名 zd-app）

## 接口协议

- 请求头：token = guid、sign、timestamp、nonce、url（站点域名）
- GET 签名：sign = MD5(timestamp + guid + nonce + SALT).toUpperCase()，SALT = @1243asd31**21#
- POST 签名：sign = MD5(signParams(body) + timestamp + guid + nonce + SALT)
  - signParams：按键排序；对象序列化去引号；中文 encodeURIComponent；非字母数字 encodeURIComponent
- 设备注册：POST user/userLogin，body { deviceCode, source }，每天一次
  - returnValue 998 / 1000 时重新注册后重试
- 响应：returnValue = 1 为成功；returnData 为 AES-256-CBC(Base64) 密文时解密
  - key = mh_aes=19@#$@%@#，iv = 5e1y6w452uqw9jq8
- 接口：
  - sp/getNewTabList —— 板块列表（共 7 个：4 短视频、5 长视频、6 AV、7 动漫、8 热门爽剧、9 网红专区、16 绅士专区），并下发 publishPage（防走丢发布页地址）
  - sp/getPlateLabelList —— 板块分类
  - sp/getLabelVideoList —— 视频列表，参数 { plateId, labelId, page, size }
  - sp/getVideoDetail —— 视频详情/播放线路
  - sp/getLovelyList —— 推荐列表

## 接口行为实测

- 短视频/长视频每页固定返回 25 条，size 参数无效（AV 板块请求 25 返回 30，分页行为各板块不一致）
- total 恒为 10000，不可信；翻页超出末尾会重复返回，按 videoId 去重判定加载完成
- 列表条目字段：videoCover、videoTitle、nickName、userName、avatar、duration、
  videoUrlOne/Two/Three、videoLink（源帖链接）、videoDes、videoTag、videoActor、
  updatedTime、videoCoverWidth/Height、searchType、plateId、videoId、isAd
- 三条线路：videoUrlOne 全球线路（m3u8，可能直连 video.twimg.com）、
  videoUrlTwo 优化线路（m3u8，站方缓存）、videoUrlThree 高清（MP4 直链，站方缓存，1080p）
- url 请求头仅被 sp/getLabelVideoList 严格校验：白名单只含当前活跃的
  dwkkjsN.jvlookzw04.cn 镜像（apex / www / 官方最新地址 zwfb.mmjvlook.top 均被拒）
- 封面/视频缓存 CDN 域名（jehih2z.xyz、ybxzk33o1.top 等）轮换，播放地址需现取现用

## 自适应

- 发布页：默认 [https://jvlook.top/](https://jvlook.top/)（接口 publishPage 字段动态下发）
  - 域名表在 js/aes.js，AES 加密：CryptoJS 格式（"Salted__" + salt + 密文，
    EVP_BytesToKey(MD5) 派生 key/iv，AES-256-CBC），密钥 zdzd#@%@#
  - 用 script 标签跨域加载（浏览器 CORS 限制，脚本标签不受限）
- API 主机候选（按序探测、先通先用）：zdap.gkquu.cn:4438 / zdapi.421573.top /
  zdap2.gkquu.cn / zdap3.gkquu.cn / api.gkquu.cn（均为 /zd/，同源 zd-app）
- 前端域名候选：dwkkjs1~20.jvlookzw04.cn、jvlookzw04.cn、zwfb.mmjvlook.top、jvlook.com（需科学上网）
  - 发现到的域名必须经 sp/getLabelVideoList 实测通过才采纳
- 配置缓存：localStorage key = zdplayer_config_v1，TTL 24 小时
- 重试策略：网络错误 / 5xx 指数退避重试 3 次；rv 3（url 头被拒）轮换域名后重试；
  运行失败时 rotateApiBase 切换备用 API 主机
- 播放：默认高清线路（MP4）；HLS 由 hls.js（CDN 加载）或 Safari 原生支持；
  浏览器拦截有声自动播放时降级静音播放

## 可能出现的情况

- 站方若同时下架全部 API 主机与发布页，需人工更新 js/core.js 顶部的
  API_BASES / FRONT_HOSTS 候选列表
