# Margin Translate · 页边译 —— 隐私政策

**生效日期**：2026-10-29　　**最后更新**：2026-10-29

> 一句话总结：**我们不收集、不存储、不买卖你的任何数据。本扩展没有自己的服务器。**

---

## 中文版

### 一、我们收集什么

**什么都不收集。**

- 没有账号、没有登录、没有注册；
- 没有任何统计、崩溃上报或广告 SDK（没有 Google Analytics，没有第三方埋点）；
- 不发生任何遥测上传行为。

### 二、你的文本去了哪里

本扩展**只在下列时机**发起网络请求，且目标**完全由你自己在设置里启用哪些平台决定**：

1. 你划词选中并触发翻译（包含开启「选中即翻译」后的自动触发）；
2. 你在面板或弹窗里点击「翻译」；
3. 你手动点击「双语对照」，此时会把所选**区域内的段落**逐段送去翻译；
4. 你在设置页点击某个引擎的「测试连通」（只发送一小句测试文本）。

请求的目标是第三方翻译平台（MyMemory、Google 免费端点、LibreTranslate、百度翻译、DeepL、微软 Translator，或你自己填写的 OpenAI 兼容网关 / 自建端点）。**你的原文与译文会经过这些平台，并受它们各自的隐私政策约束**；若你使用自建服务（如本地 LibreTranslate），文本则不出你的机器。

我们（开发者）**不接收、不中转、不落库**其中任何内容。所有请求由浏览器扩展后台直接发出。

### 三、本地存储了什么

| 数据 | 位置 | 用途 | 如何清除 |
| --- | --- | --- | --- |
| 设置项（语言、启用的引擎、外观、站点黑名单）| `chrome.storage.sync` | 随你的 Google 账号同步 | 设置页可随时改；卸载扩展即删除 |
| **引擎密钥**（DeepL / 微软 / 百度 / OpenAI 等）| `chrome.storage.sync` | 仅存在本机，用于调用你自己的配额 | 设置页留空即可移除；建议不要与他人共用 |
| 译文缓存（原文、译文、命中引擎）| `chrome.storage.local` | 复用历史结果、节省免费额度、离线回看 | 设置页「高级」→「清空翻译缓存」 |
| 使用统计（请求次数、字符数、失败次数）| `chrome.storage.local` | 供你估算免费额度用量 | 设置页「高级」→「重置统计」 |

- 缓存最多保留 3000 条，超出按最近最少使用自动淘汰；
- 以上数据**全部留在本机**，开发者无法读取，也不会上传到任何地方。

### 四、权限说明

| 权限 | 为什么需要 |
| --- | --- |
| `storage` | 保存你的设置、翻译缓存与用量统计（均在本机） |
| `activeTab` | 在你主动点击扩展图标时，读取当前页已选中的文字 |
| `scripting` | 同上，用于把"读取选区"这段临时脚本注入当前标签页 |
| `contextMenus` | 提供「右键翻译选中内容」 |
| `commands` | 提供 Alt+Q / Alt+B / Alt+T 三个快捷键 |
| `alarms` | 定时巡检本地缓存，不涉及网络 |
| `http://*/*`、`https://*/*`（内容脚本注入）| 只有在普通网页里注入脚本，才能在页面内划词、弹出译文气泡、插入双语对照 |
| 各翻译平台域名（如 `*.deepl.com`、`api.fanyi.baidu.com` 等）| 让扩展后台能调用你启用的翻译平台（绕开页面 CSP 限制） |

### 五、你的注意事项

- **请不要用本扩展翻译身份证号、银行卡号、密码、病历、合同正本等敏感内容**；
- 如果某个网站的内容你不想上传任何翻译平台，请在**设置页 → 高级 → 站点排除**里加入该域名，扩展在该站点将完全停止工作；
- 若你在中国大陆使用，第三方平台处理数据的位置可能在中国境外，请据此自行判断。

### 六、儿童隐私

本扩展不面向 13 岁以下儿童，也不会主动收集任何年龄、身份信息。

### 七、政策变更与联系

本政策如有变更会在仓库内更新生效日期。由于我们无法获知你是谁，也无法主动联系你，请自行关注本文件。如发现疑似数据外传行为，请在仓库提交 issue。

---

## English Version

### Short version

**Margin Translate collects nothing. There is no server, no account, no analytics, no ads.**

### What we collect

Nothing. No account, no telemetry, no analytics SDK, no crash reporting, no advertising components.

### Where your text goes

Requests to third-party providers happen **only** when you: select text with "translate on selection" enabled, click Translate in the panel/popup, start Inline Bilingual mode, or press "Test connection" for an engine in Settings. The destinations are the translation providers **you enabled yourself** (MyMemory, Google's public endpoint, LibreTranslate, Baidu Translate, DeepL, Microsoft Translator, or any OpenAI-compatible / self-hosted endpoint you configure). Those providers process your text under their own privacy policies. The developer never receives, relays, or stores your content — requests go directly from your browser.

### What is stored locally

| Data | Where | Purpose | How to remove |
| --- | --- | --- | --- |
| Settings (languages, enabled engines, theme, site blacklist) | `chrome.storage.sync` | Sync across your own devices | Change anytime; removed on uninstall |
| **API keys** you enter | `chrome.storage.sync` | Call your own quota | Clear the field in Settings |
| Translation cache (source, result, engine) | `chrome.storage.local` | Reuse results, save quota | Settings → Advanced → Clear cache |
| Usage counters (requests, chars, failures) | `chrome.storage.local` | Estimate free-tier usage | Settings → Advanced → Reset stats |

The cache keeps at most 3,000 entries (LRU). No developer can read any of this data.

### Permissions rationale

`storage` — local settings, cache and counters. `activeTab` + `scripting` — read the current selection when you click the toolbar icon. `contextMenus` — right-click translate. `commands` — Alt+Q / Alt+B / Alt+T shortcuts. `alarms` — periodic local cache check. `http://*/*`, `https://*/*` (content script) — required to inject the selection UI and inline translations into web pages. Specific provider hostnames — allow the background worker to call the engines you enabled.

### Note on sensitive content

Do not translate ID numbers, bank cards, passwords, medical records or contract texts. Use **Settings → Advanced → Site exclusion** to completely disable the extension on sensitive domains.

### Changes

This policy will be updated in-repo with a new effective date. Since we don't know who you are, we cannot notify you individually — please check this file.
