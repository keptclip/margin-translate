/* Margin Translate · 页边译 —— 翻译引擎注册表
 *
 * 约定：所有引擎都在扩展后台（Service Worker）里发起请求，
 * 因此只要目标域名写进 host_permissions，就不受页面 CORS / CSP 限制。
 *
 * 引擎对外统一形态：
 *   {
 *     id, name, home, cost: 'free' | 'quota' | 'paid',
 *     doc: 免费额度说明,
 *     fields: [{ key, label, type:'text'|'secret', placeholder, hint, required }],
 *     defaults: { apiKey:'', ... },
 *     limits: { concurrency, minIntervalMs, maxChars },
 *     translate({ text, source, target, cfg }) -> Promise<string>
 *   }
 */
(function (root) {
  'use strict';

  const { langCode, AUTO } = root.MarginConfig;

  /* ------------------------------------------------------------ 网络底座 */
  const UA =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

  async function request(url, options = {}, timeout = 15000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort('timeout'), timeout);
    try {
      const res = await fetch(url, Object.assign({ signal: ctrl.signal }, options));
      const body = await res.text();
      if (!res.ok) {
        throw new Error(httpMessage(res.status, body));
      }
      return body;
    } catch (err) {
      if (err && err.name === 'AbortError') throw new Error('请求超时');
      if (err instanceof TypeError) throw new Error('网络不可达（可能是域名被拦截）');
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  function httpMessage(status, body) {
    const map = {
      400: '请求被拒绝（400）：可能是语言代码或参数不合法',
      401: '密钥无效（401）',
      403: '访问被拒绝（403）：密钥无权限或额度用尽',
      404: '接口不存在（404）：请检查服务地址或区域',
      408: '请求超时（408）',
      429: '请求过于频繁（429）：已触发限流，稍后再试或换引擎',
      456: '配额已用尽（456）',
      503: '服务暂时不可用（503）'
    };
    let extra = '';
    try {
      const j = JSON.parse(body);
      extra = (j && (j.message || j.error || j.error_message || (j.error && j.error.message))) || '';
      if (extra && typeof extra !== 'string') extra = JSON.stringify(extra);
    } catch (_) {
      /* 非 JSON 响应时忽略 */
    }
    const base = map[status] || `HTTP ${status}`;
    return extra ? `${base} · ${String(extra).slice(0, 160)}` : base;
  }

  /** MD5（百度翻译签名要求；Chrome 113+ 未提供 MD5 摘要，故自带实现） */
  const MD5_SHIFT = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
  const MD5_K = Array.from({ length: 64 }, (_, i) => Math.abs(Math.sin(i + 1)) * 0x100000000 >>> 0);

  function md5Hex(str) {
    const bytes = new TextEncoder().encode(str);
    const bitLen = bytes.length * 8;
    const blocks = Math.max(1, Math.ceil((bytes.length + 9) / 64));
    const buf = new Uint8Array(blocks * 64);
    buf.set(bytes);
    buf[bytes.length] = 0x80;
    const dv = new DataView(buf.buffer);
    dv.setUint32(blocks * 64 - 8, bitLen >>> 0, true);
    dv.setUint32(blocks * 64 - 4, Math.floor(bitLen / 0x100000000), true);

    let a = 0x67452301, b = 0xefcdab89, c = 0x98badcfe, d = 0x10325476;
    for (let i = 0; i < blocks; i++) {
      const off = i * 64;
      const m = new Uint32Array(16);
      for (let j = 0; j < 16; j++) m[j] = dv.getUint32(off + j * 4, true);
      let A = a, B = b, C = c, D = d;
      for (let j = 0; j < 64; j++) {
        let f, g;
        if (j < 16) {
          f = (B & C) | (~B & D);
          g = j;
        } else if (j < 32) {
          f = (D & B) | (~D & C);
          g = (5 * j + 1) % 16;
        } else if (j < 48) {
          f = B ^ C ^ D;
          g = (3 * j + 5) % 16;
        } else {
          f = C ^ (B | ~D);
          g = (7 * j) % 16;
        }
        const t = (A + f + MD5_K[j] + m[g]) >>> 0;
        A = D;
        D = C;
        C = B;
        B = (B + ((t << MD5_SHIFT[j]) | (t >>> (32 - MD5_SHIFT[j])))) >>> 0;
      }
      a = (a + A) >>> 0;
      b = (b + B) >>> 0;
      c = (c + C) >>> 0;
      d = (d + D) >>> 0;
    }
    const out = new Uint8Array(16);
    const odv = new DataView(out.buffer);
    odv.setUint32(0, a, true);
    odv.setUint32(4, b, true);
    odv.setUint32(8, c, true);
    odv.setUint32(12, d, true);
    return Array.from(out, (x) => x.toString(16).padStart(2, '0')).join('');
  }

  async function requestJson(url, options) {
    const body = await request(url, options);
    try {
      return JSON.parse(body);
    } catch (_) {
      throw new Error('返回内容不是合法 JSON（可能被网关拦截）');
    }
  }

  const jsonHeaders = (extra) => Object.assign({ 'Content-Type': 'application/json' }, extra || {});

  /* ------------------------------------------------------- 通用取值工具 */
  function pickPath(obj, path) {
    if (!path) return undefined;
    return path
      .replace(/\[(\w+)\]/g, '.$1')
      .split('.')
      .filter(Boolean)
      .reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
  }

  /** 宽松解析：兼容 {translatedText} / {text} / {translation} / ["x"] / "x" 等常见形态 */
  function pickTranslatedText(data, path) {
    if (typeof data === 'string') return data;
    if (Array.isArray(data)) return pickTranslatedText(data[0], path);
    if (!data || typeof data !== 'object') return undefined;
    if (path) {
      const v = pickPath(data, path);
      if (typeof v === 'string') return v;
      if (Array.isArray(v) && typeof v[0] === 'string') return v[0];
    }
    return (
      data.translatedText ||
      data.translation ||
      data.translated_text ||
      data.result ||
      (data.data && (data.data.translatedText || data.data.text)) ||
      (Array.isArray(data.translations) &&
        data.translations[0] &&
        (data.translations[0].text || data.translations[0].translation)) ||
      typeof data.text === 'string' && data.text
    );
  }

  function assertConfigured(cfg, key, name) {
    if (!cfg || !cfg[key]) throw new Error(`未填写 ${name}，请在设置页配置后启用`);
  }

  /* ------------------------------------------------------------ 各引擎 */

  /** 1. Google 免费翻译端点（无密钥，质量最好，非官方接口）*/
  const googleFree = {
    id: 'google-free',
    name: 'Google 免费端点（实验性）',
    cost: 'free',
    home: 'https://translate.google.com',
    doc:
      '完全免费、无需注册：调用 Google 的公开翻译端点（translate.googleapis.com/translate_a/single，client=gtx）。' +
      '该接口非 Google 官方对外 API，也未获得授权，仅供个人学习与本地使用；短时间密集请求会被临时限流。' +
      '若用于商业、团队或产品化场景，请改用你在 Google Cloud Translation 申请的官方 API 额度，或选用下方其它官方免费引擎（MyMemory / LibreTranslate / 百度 / DeepL Free / 微软 F0）。',
    fields: [],
    defaults: {},
    limits: { concurrency: 2, minIntervalMs: 120, maxChars: 1800 },
    async translate({ text, source, target }) {
      const lang = langCode(target, 'google');
      const from = source && source !== AUTO ? langCode(source, 'google') : 'auto';
      const url =
        'https://translate.googleapis.com/translate_a/single?client=gtx&dj=1&dt=t&dt=bd&dt=rm&ie=UTF-8&oe=UTF-8' +
        `&sl=${encodeURIComponent(from)}&tl=${encodeURIComponent(lang)}&q=${encodeURIComponent(text)}`;
      const data = await requestJson(url, { method: 'GET', headers: { 'User-Agent': UA } });
      const sentences = (data && data.sentences) || [];
      const segments = Array.isArray(sentences) ? sentences : [sentences];
      const out = segments
        .filter((s) => s && s.trans)
        .map((s) => s.trans)
        .join('');
      if (!out) throw new Error('Google 未返回有效译文');
      return out;
    }
  };

  /** 2. MyMemory —— 免费、开源友好的聚合语料引擎（无需密钥即可用） */
  const myMemory = {
    id: 'mymemory',
    name: 'MyMemory（免费额度）',
    cost: 'free',
    home: 'https://mymemory.translated.net',
    doc: '完全免费：匿名每日 5000 字符；填写邮箱后提升到每日 50000 字符（邮箱只用于配额统计，不接收推广）。无需翻墙即可直连，建议作为主力免费引擎。',
    fields: [
      { key: 'email', label: '联系邮箱（可选，提升额度）', type: 'text', placeholder: 'you@example.com', hint: '留空也可使用，仅额度较低' }
    ],
    defaults: { email: '' },
    limits: { concurrency: 3, minIntervalMs: 80, maxChars: 480 },
    async translate({ text, source, target, cfg }) {
      const lang = langCode(target, 'mymemory');
      // MyMemory 在 Autodetect 模式下经常返回空译文，因此显式指定源语言更稳定
      const guesses = source && source !== AUTO ? [langCode(source, 'mymemory')] : lang === 'en-US' ? ['zh-CN'] : ['en-US'];
      const attempts = source && source !== AUTO ? guesses : guesses.concat(['Autodetect']);
      let lastHint = '';
      for (const from of attempts) {
        const qs = new URLSearchParams({ q: text, langpair: `${from}|${lang}`, mt: '1' });
        if (cfg.email) qs.set('de', cfg.email.trim());
        const data = await requestJson(`https://mymemory.translated.net/api/get?${qs}`, {
          method: 'GET',
          headers: { 'User-Agent': UA }
        });
        const status = data && data.responseStatus;
        if (status && Number(status) !== 200) {
          throw new Error(String(data.responseDetails || `MyMemory 返回 ${status}`).slice(0, 180));
        }
        const out = data && data.responseData && data.responseData.translatedText;
        if (out && !/MYMEMORY WARNING|USAGE LIMIT|QUERY LENGTH LIMIT/i.test(out)) return out;
        lastHint = out ? String(out).slice(0, 120) : '语料未命中';
      }
      throw new Error(`MyMemory 无有效译文（${lastHint}）：可在面板右上角手动指定源语言，或换用其它引擎`);
    }
  };

  /** 3. LibreTranslate —— 完全开源，公共实例免费，也可自建 */
  const libreTranslate = {
    id: 'libretranslate',
    name: 'LibreTranslate（开源自建 / 公共实例）',
    cost: 'free',
    home: 'https://libretranslate.com',
    doc: '开源免费：公共实例需要到 https://portal.libretranslate.com 免费领取 API Key（也可以自己部署，完全免费无限制：docker run -p 5000:5000 libretranslate/libretranslate 后把服务地址改成 http://localhost:5000）。',
    fields: [
      { key: 'baseUrl', label: '服务地址', type: 'text', placeholder: 'https://libretranslate.com', hint: '留空使用公共实例；自建则填 http://localhost:5000' },
      { key: 'apiKey', label: 'API Key（公共实例需要）', type: 'secret', placeholder: '可选，自建实例通常不需要', hint: '' }
    ],
    defaults: { baseUrl: 'https://libretranslate.com', apiKey: '' },
    limits: { concurrency: 2, minIntervalMs: 200, maxChars: 2000 },
    async translate({ text, source, target, cfg }) {
      const base = (cfg.baseUrl || 'https://libretranslate.com').replace(/\/+$/, '');
      let from = source && source !== AUTO ? langCode(source, 'libre') : AUTO;
      if (from === AUTO) {
        const detected = await requestJson(`${base}/detect`, jsonHeaders({ method: 'POST', body: JSON.stringify({ q: text }) }))
          .then((d) => (Array.isArray(d) && d[0] && d[0].language) || d.language)
          .catch(() => AUTO);
        from = detected || AUTO;
      }
      const data = await requestJson(
        `${base}/translate`,
        jsonHeaders({
          method: 'POST',
          body: JSON.stringify({ q: text, source: from === AUTO ? 'auto' : from, target: langCode(target, 'libre'), format: 'text' })
        })
      );
      const out = (data && data.translatedText) || (Array.isArray(data) && data[0] && data[0].translatedText);
      if (!out) throw new Error((data && (data.error || data.message)) || 'LibreTranslate 未返回有效译文');
      return out;
    }
  };

  /** 4. DeepL（Free 额度每月 50 万字符，需注册密钥） */
  const deepl = {
    id: 'deepl',
    name: 'DeepL API（Free 每月 50 万字符）',
    cost: 'quota',
    home: 'https://www.deepl.com/pro-api',
    doc: '注册 DeepL API Free 即可获得每月 50 万字符免费额度，质量优秀。Free 密钥以 :fx 结尾，插件会自动识别并切换到免费端点。',
    fields: [
      { key: 'apiKey', label: 'API Key', type: 'secret', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx:fx', hint: '在 DeepL 后台免费获取', required: true }
    ],
    defaults: { apiKey: '' },
    limits: { concurrency: 2, minIntervalMs: 150, maxChars: 2000 },
    async translate({ text, source, target, cfg }) {
      assertConfigured(cfg, 'apiKey', 'DeepL API Key');
      const key = cfg.apiKey.trim();
      const isFree = /:fx$/i.test(key) || cfg.free === true;
      const base = isFree ? 'https://api-free.deepl.com' : 'https://api.deepl.com';
      const body = { text: [text], target_lang: langCode(target, 'deepl') };
      if (source && source !== AUTO) body.source_lang = langCode(source, 'deepl');
      const data = await requestJson(
        `${base}/v2/translate`,
        jsonHeaders({ method: 'POST', headers: { Authorization: `DeepL-Auth-Key ${key}` }, body: JSON.stringify(body) })
      );
      const out = data && data.translations && data.translations[0] && data.translations[0].text;
      if (!out) throw new Error('DeepL 未返回有效译文');
      return out;
    }
  };

  /** 5. 微软 Translator（Azure 认知服务 F0 免费层每月 200 万字符，需注册） */
  const azure = {
    id: 'azure',
    name: '微软 Translator（F0 每月 200 万字符）',
    cost: 'quota',
    home: 'https://portal.azure.com',
    doc: 'Azure 认知服务 Translator 的免费层（F0）每月 200 万字符，需要 Key 和区域 ID（如 eastasia / eastus）。',
    fields: [
      { key: 'apiKey', label: 'Subscription Key', type: 'secret', placeholder: '32 位字符串', hint: '', required: true },
      { key: 'region', label: '区域 Region', type: 'text', placeholder: 'eastasia', hint: '免费资源也要填写区域，否则 401', required: true }
    ],
    defaults: { apiKey: '', region: '' },
    limits: { concurrency: 3, minIntervalMs: 80, maxChars: 5000 },
    async translate({ text, source, target, cfg }) {
      assertConfigured(cfg, 'apiKey', '微软 Translator Key');
      assertConfigured(cfg, 'region', '微软 Translator 区域');
      const qs = new URLSearchParams({ 'api-version': '3.0', to: langCode(target, 'azure') });
      if (source && source !== AUTO) qs.set('from', langCode(source, 'azure'));
      const data = await requestJson(
        `https://api.cognitive.microsofttranslator.com/translate?${qs}`,
        jsonHeaders({
          method: 'POST',
          headers: {
            'Ocp-Apim-Subscription-Key': cfg.apiKey.trim(),
            'Ocp-Apim-Subscription-Region': cfg.region.trim()
          },
          body: JSON.stringify([{ Text: text }])
        })
      );
      const out = data && data[0] && data[0].translations && data[0].translations[0] && data[0].translations[0].text;
      if (!out) throw new Error('微软 Translator 未返回有效译文');
      return out;
    }
  };

  /** 5.5 百度翻译开放平台 —— 国内直连，标准版每月免费 5 万字符 */
  const baidu = {
    id: 'baidu',
    name: '百度翻译（每月 5 万字符免费）',
    cost: 'quota',
    home: 'https://api.fanyi.baidu.com',
    doc: '国内网络直连、速度快。注册百度翻译开放平台后选择「标准版」即可免费使用：每月 5 万字符（实名认证后额度更高）。需要 APP ID 与密钥。',
    fields: [
      { key: 'appId', label: 'APP ID', type: 'text', placeholder: '20250101000000001', hint: '开放平台「开发者信息」中获取', required: true },
      { key: 'secret', label: '密钥 Secret', type: 'secret', placeholder: '32 位字符串', hint: '与 APP ID 配套，不要外泄', required: true }
    ],
    defaults: { appId: '', secret: '' },
    limits: { concurrency: 1, minIntervalMs: 1000, maxChars: 1800 }, // 免费版 QPS=1
    async translate({ text, source, target, cfg }) {
      assertConfigured(cfg, 'appId', '百度 APP ID');
      assertConfigured(cfg, 'secret', '百度密钥');
      const appid = cfg.appId.trim();
      const secret = cfg.secret.trim();
      const to = langCode(target, 'baidu');
      const from = source && source !== AUTO ? langCode(source, 'baidu') : 'auto';
      if (!to || to === 'auto') throw new Error('目标语言暂不被该平台支持');
      const salt = String(Date.now());
      const qs = new URLSearchParams({
        q: text,
        from,
        to,
        appid,
        salt,
        sign: md5Hex(appid + text + salt + secret)
      });
      const data = await requestJson(`https://fanyi-api.baidu.com/api/trans/vip/translate?${qs}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      if (data && data.error_code) {
        const codes = {
          '52001': '请求超时，请重试',
          '52002': '百度系统错误，请重试',
          '52003': '未授权用户：请检查 APP ID 与密钥是否配对',
          '54000': '缺少必填参数',
          '54001': '签名错误：请检查密钥是否正确',
          '54003': '访问频率受限（免费版 QPS=1）',
          '54004': '账户余额不足，可能超出免费额度',
          '54005': '长请求过于频繁，请稍后再试',
          '58000': '客户端 IP 非法，请在开放平台填写服务器/出口 IP',
          '58001': '译文语言方向不支持',
          '90107': '认证未通过或未生效'
        };
        throw new Error(codes[String(data.error_code)] || `百度返回错误码 ${data.error_code}`);
      }
      const out = (data.trans_result || []).map((t) => t && t.dst).filter(Boolean).join('\n');
      if (!out) throw new Error('百度未返回有效译文');
      return out;
    }
  };

  /** 6. OpenAI 兼容接口（可接任意兼容网关，部分平台有免费额度） */
  const openai = {
    id: 'openai',
    name: 'OpenAI 兼容接口（自定义网关）',
    cost: 'paid',
    home: 'https://platform.openai.com',
    doc: '通过 ChatGPT 类接口翻译，术语理解最好。可把 Base URL 改成任意 OpenAI 兼容网关（如 DeepSeek、通义、硅基流动、本地 Ollama 等），按平台自己的免费额度计费。',
    fields: [
      { key: 'baseUrl', label: 'Base URL', type: 'text', placeholder: 'https://api.openai.com/v1', hint: '兼容网关请填写对应地址，例如 https://api.deepseek.com/v1', required: true },
      { key: 'apiKey', label: 'API Key', type: 'secret', placeholder: 'sk-...', hint: '', required: true },
      { key: 'model', label: '模型', type: 'text', placeholder: 'gpt-4o-mini', hint: '便宜且够用：gpt-4o-mini / deepseek-chat', required: true }
    ],
    defaults: { baseUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o-mini' },
    limits: { concurrency: 2, minIntervalMs: 100, maxChars: 3000 },
    async translate({ text, source, target, cfg }) {
      assertConfigured(cfg, 'apiKey', 'API Key');
      const base = (cfg.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
      const targetName = root.MarginConfig.langLabel(target);
      const sourceHint = source && source !== AUTO ? root.MarginConfig.langLabel(source) : '自动识别原文语言';
      const payload = {
        model: (cfg.model || 'gpt-4o-mini').trim(),
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content:
              'You are a professional translation engine. Translate the user input into ' +
              targetName +
              '. Preserve line breaks, markdown, code, numbers and placeholders. Output ONLY the translated text, no explanation.'
          },
          { role: 'user', content: `Source language hint: ${sourceHint}\n\n${text}` }
        ]
      };
      const data = await requestJson(
        `${base}/chat/completions`,
        jsonHeaders({
          method: 'POST',
          headers: { Authorization: `Bearer ${cfg.apiKey.trim()}` },
          body: JSON.stringify(payload)
        })
      );
      const out =
        data &&
        data.choices &&
        data.choices[0] &&
        (data.choices[0].message ? data.choices[0].message.content : data.choices[0].text);
      if (!out) throw new Error('兼容接口未返回有效译文');
      return String(out).trim();
    }
  };

  /** 7. 自定义 HTTP 端点 —— 可自由接入任何自托管 / 第三方翻译服务 */
  const custom = {
    id: 'custom',
    name: '自定义 HTTP 端点（自由接入）',
    cost: 'custom',
    home: '',
    doc: '把任意 HTTP 翻译接口接进来：支持请求体模板（可用 {{text}} {{source}} {{target}} 占位）和结果取值路径（如 data.result）。适合自建 Argos / OMT / 内部翻译服务。',
    fields: [
      { key: 'baseUrl', label: '接口地址 URL', type: 'text', placeholder: 'https://example.com/api/translate', hint: '支持 {{source}} {{target}} 占位，GET 时会作为 query 使用', required: true },
      { key: 'method', label: '请求方法', type: 'text', placeholder: 'POST', hint: 'POST 或 GET', required: true },
      { key: 'bodyTemplate', label: '请求体模板（JSON）', type: 'text', placeholder: '{"q":"{{text}}","source":"{{source}}","target":"{{target}}"}', hint: 'POST 时使用；{{text}} 会被转义为合法 JSON 字符串' },
      { key: 'resultPath', label: '结果取值路径', type: 'text', placeholder: 'translatedText', hint: '留空会自动识别 translatedText / text / result / translations[0].text' },
      { key: 'headers', label: '自定义请求头（JSON，可选）', type: 'text', placeholder: '{"Authorization":"Bearer xxx"}' }
    ],
    defaults: { baseUrl: '', method: 'POST', bodyTemplate: '{"q":"{{text}}","source":"{{source}}","target":"{{target}}"}', resultPath: '', headers: '' },
    limits: { concurrency: 2, minIntervalMs: 100, maxChars: 4000 },
    async translate({ text, source, target, cfg }) {
      assertConfigured(cfg, 'baseUrl', '接口地址');
      const targetCode = langCode(target, 'libre');
      const sourceCode = source && source !== AUTO ? langCode(source, 'libre') : AUTO;
      const fill = (s) =>
        String(s || '')
          .replace(/\{\{text\}\}/g, JSON.stringify(text).slice(1, -1))
          .replace(/\{\{source\}\}/g, sourceCode)
          .replace(/\{\{target\}\}/g, targetCode);
      const method = String(cfg.method || 'POST').toUpperCase();
      let headers = { Accept: 'application/json, text/plain, */*' };
      if (cfg.headers) {
        try {
          headers = Object.assign(headers, JSON.parse(cfg.headers));
        } catch (_) {
          throw new Error('自定义请求头不是合法 JSON');
        }
      }
      const url = fill(cfg.baseUrl);
      const options = { method, headers };
      if (method === 'POST') {
        const tpl = cfg.bodyTemplate || '{"q":"{{text}}","source":"{{source}}","target":"{{target}}"}';
        const body = fill(tpl);
        try {
          JSON.parse(body); // 模板里的 {{text}} 已做 JSON 转义，校验合法性
        } catch (_) {
          throw new Error('请求体模板不是合法 JSON，请检查占位符用法');
        }
        headers['Content-Type'] = headers['Content-Type'] || 'application/json';
        options.body = body;
      }
      const raw = await request(url, options);
      try {
        const value = pickTranslatedText(JSON.parse(raw), cfg.resultPath);
        if (!value) throw new Error('按结果路径未取到译文');
        return value;
      } catch (err) {
        if (typeof raw === 'string' && raw.trim() && !/^[{[]/.test(raw.trim())) return raw.trim();
        throw err instanceof Error && err.message === '按结果路径未取到译文' ? err : new Error(err.message || '解析失败');
      }
    }
  };

  const ENGINES = [myMemory, googleFree, libreTranslate, custom, baidu, deepl, azure, openai];
  const ENGINE_MAP = ENGINES.reduce((m, e) => ((m[e.id] = e), m), {});

  /* ------------------------------------------------------------- 限流器 */
  class Limiter {
    constructor(concurrency = 1, minIntervalMs = 0) {
      this.concurrency = Math.max(1, concurrency);
      this.minIntervalMs = Math.max(0, minIntervalMs);
      this.active = 0;
      this.queue = [];
      this.last = 0;
    }
    async run(task) {
      if (this.active >= this.concurrency) {
        await new Promise((r) => this.queue.push(r));
      }
      this.active++;
      try {
        const wait = this.minIntervalMs - (Date.now() - this.last);
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        return await task();
      } finally {
        this.active--;
        this.last = Date.now();
        const next = this.queue.shift();
        if (next) next();
      }
    }
  }

  root.MarginEngines = { ENGINES, ENGINE_MAP, Limiter, request, requestJson, httpMessage, md5Hex };
})(self);
