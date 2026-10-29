# Margin Translate · 页边译（Chrome 扩展）

一个**不跳转页面**的 Chrome 翻译插件：翻译结果直接出现在当前标签页里（划词气泡 / 右侧面板 / 页内双语对照），并且可以接入多个翻译平台，**默认全部使用免费额度**，任一引擎失败自动降级到下一个。

- 纯原生 MV3 实现，**零依赖、零构建**：克隆后直接加载即可用。
- 所有网络请求都发生在扩展后台（Service Worker），不受页面 CSP / CORS 限制。
- 无自建后端、无账号、不采集任何数据；文本只发给你自己启用的平台。

## 支持这个项目

**Margin Translate 永远免费，也不会有「付费才能用」的功能。**

如果你每天用它读外文省下了几分钟，可以在爱发电支持我，让它被持续维护下去：

- 爱发电：<https://afdian.com/a/keptclip>
- 也可以直接在扩展的**设置页 → ♥ 支持作者**里点进去

你的支持会变成修 bug、适配新翻译 API、回应每一个 issue 的时间 —— 谢谢你。

---

隐私政策见 [PRIVACY.md](./PRIVACY.md)，开源协议为 MIT。

by [keptclip](https://github.com/keptclip)

---

## 一、安装

1. 打开 `chrome://extensions`，右上角开启 **开发者模式**；
2. 点击 **加载已解压的扩展程序**，选择本项目的根目录（也就是 `manifest.json` 所在的那一层）；
3. 固定到工具栏：点击拼图图标 → 把 `Margin Translate · 页边译` 钉住。

> 打包发布：`chrome://extensions` → **打包扩展程序**（或 `chrome --pack-extension=<本目录>`）。

## 二、使用方式（全部在当前页面完成）

| 场景 | 操作 | 结果 |
| --- | --- | --- |
| 划词翻译 | 选中文字（默认松手 0.15 秒后自动翻译） | 选区旁弹出翻译气泡：原文 / 译文 / 复制 / 朗读 / 替换原文 |
| 关闭自动 | 设置里取消「划词后立即翻译」 | 改为显示浮动图标，点图标才翻译；双击选词也可直接触发 |
| 手动输入 | 点击工具栏图标 → 在弹窗或面板输入 | ⌘/Ctrl + Enter 立即翻译 |
| 整页双语 | 面板「双语对照」或快捷键 `Alt+B` | 按段落把译文插到原文下方，可一键还原 |
| 输入框翻译 | 在网页输入框里选中文字后 `Alt+Q` | 结果卡片里有「替换原文」按钮 |
| 右键翻译 | 选中文字 → 右键「使用 Margin Translate 翻译」 | 同划词翻译 |

快捷键（`chrome://extensions/shortcuts` 可改）：

- `Alt+Q` 翻译选中的文字
- `Alt+B` 开启 / 还原当前页双语对照
- `Alt+T` 打开 / 关闭翻译面板
- `Esc` 关闭气泡 / 面板；双语模式下按 Esc 还原原文

## 三、内置翻译引擎（免费优先）

设置页「翻译引擎」标签页里可以开关、排序、填写密钥和点「测试连通」。默认启用前 3 个免费无密钥引擎。

| 引擎 | 费用 | 是否需要密钥 | 说明 |
| --- | --- | --- | --- |
| **Google 免费端点（实验性）** | 完全免费 | 否 | 质量最佳，默认第一顺位；部分地区/网络不可达，密集请求会被限流（失败自动冷却跳过）。**注意：这是非官方、未授权的接口，仅供个人学习研究；商业/团队用途请换用 Google Cloud Translation 官方 API 或下面这些官方免费引擎** |
| **MyMemory** | 完全免费 | 否（填邮箱可提到 5 万字符/日） | 匿名 5000 字符/日，直连可用性最好；语料优先，生僻新句子可能返回空，此时自动交给下一个引擎 |
| **LibreTranslate** | 完全免费 | 公共实例需要免费 Key / 自建不需要 | 开源，推荐自建：`docker run -p 5000:5000 libretranslate/libretranslate` 后把服务地址改成 `http://localhost:5000` |
| **百度翻译开放平台** | 每月 5 万字符免费 | 是（APP ID + 密钥） | 国内网络推荐，稳定、速度快；免费版 QPS=1 |
| **DeepL API Free** | 每月 50 万字符免费 | 是（`:fx` 结尾的免费 Key 会自动切到免费端点） | 质量优秀 |
| **微软 Translator F0** | 每月 200 万字符免费 | 是（Key + Region） | 额度最大的免费层，注意 Region 必填 |
| **OpenAI 兼容接口** | 取决于所选平台 | 是 | 改 Base URL 即可接任意 OpenAI 兼容网关（DeepSeek、通义、硅基流动、本地 Ollama…），术语理解最好 |
| **自定义 HTTP 端点** | 取决于你的服务 | 视情况 | 请求体模板支持 `{{text}} {{source}} {{target}}`，结果可用路径取值（如 `data.result`），用来接自建 Argos / OMT / 内部服务 |

**降级策略**：按卡片顺序逐个尝试；某引擎连续失败会被临时降权（45 秒起递增，最多约 4.5 分钟），成功后立刻恢复。气泡底部会显示**实际命中的引擎**，以及前面「未命中」被跳过的引擎（鼠标悬停可看具体报错）。

## 四、设置项速览

- **通用**：源语言/目标语言（30 种）、划词自动翻译、浮动图标、译文朗读、面板主题
- **引擎**：启用/排序/密钥/连通测试、自动降级总开关、结果本地缓存开关
- **高级**：站点黑名单（按域名）、单次文本上限（500–20000 字符）、清空缓存与重置统计
- **统计**：累计请求 / 字符 / 失败次数与各引擎调用占比，帮你盯免费额度

数据存放：设置用 `chrome.storage.sync`（随浏览器账号同步），译文缓存与统计用 `chrome.storage.local`（最多 3000 条，LRU 淘汰，可一键清空）。

## 五、目录结构

```
margin-translate/            # 项目根目录（扩容时可自定义）
├─ manifest.json                  # MV3 清单（权限、快捷键、注入脚本）
├─ _locales/zh_CN/messages.json   # 名称、描述、菜单文案（i18n）
├─ PRIVACY.md                     # 隐私政策（中英），上架必填
├─ LICENSE                        # MIT
├─ icons/                         # PNG 图标（由 scripts/make_icons.py 生成）
├─ scripts/
│  ├─ make_icons.py               # 纯标准库生成图标
│  └─ smoke-test.js               # 逻辑 + 引擎连通性冒烟测试
└─ src/
   ├─ shared/config.js            # 语言表、默认配置、文本工具（无 DOM 依赖）
   ├─ background/
   │  ├─ engines.js               # 各翻译平台接入层（含 MD5、限流器、错误映射）
   │  ├─ translator.js            # 调度：缓存、降级、健康度、统计
   │  └─ service-worker.js        # 消息路由、右键菜单、快捷键
   ├─ content/
   │  ├─ index.js                 # 协调层：选区、命令、双语触发
   │  ├─ ui.js                    # Shadow DOM UI：气泡 / 面板 / 图标 / Toast
   │  ├─ bilingual.js             # 页内双语对照与还原
   │  ├─ styles.js                # Shadow DOM 样式表
   │  └─ host.css                 # 注入页面的译文样式（仅命名空间类）
   ├─ popup/                      # 工具栏弹窗（快速翻译 + 当前页双语）
   └─ options/                    # 设置页（引擎配置、站点排除、统计）
```

## 六、开发

```bash
node scripts/smoke-test.js   # 纯逻辑校验 + 免费引擎连通性
python3 scripts/make_icons.py # 重新生成图标
```

改动 content 脚本后，需要刷新目标网页；改动后台/配置后建议在 `chrome://extensions` 点一次「重新加载」。

新增一个翻译平台的步骤：
1. 在 `src/background/engines.js` 里增加一个引擎对象（`id / name / cost / doc / fields / defaults / limits / translate`）；
2. 加入 `ENGINES` 数组，并在 `src/shared/config.js` 的 `ENGINE_DEFAULTS` 里补一行（默认是否启用）；
3. 新域名写进 `manifest.json` 的 `host_permissions`；
4. 需要特殊语言码时在 `config.js` 的 `LANGUAGES` / `EXTRA_MAP` 里补充映射。

## 七、排障

| 现象 | 原因与处理 |
| --- | --- |
| 全部引擎失败 | 多为免费端点临时限流，等待数十秒或切到 MyMemory / 百度；卡片底部会显示具体报错 |
| Google 端点一直失败 | 当前网络无法直连，建议在设置页把它下移或关闭，先把 MyMemory/百度置顶 |
| LibreTranslate 403 | 公共实例需要免费 Key，或改成自建地址 |
| DeepL / 微软 401 | 检查密钥与区域；注意 DeepL Free Key 以 `:fx` 结尾 |
| 百度 58000 | 客户端 IP 非法，到开放平台补充出口 IP 或检查 APP ID/密钥配对 |
| 页面没反应 | 该站在站点黑名单内，或页面需要刷新（content script 只在加载时注入） |
| 译文重复出现在双语模式 | 按 `Alt+B` 或 Esc 还原后再次触发；切换设置后建议刷新页面 |
