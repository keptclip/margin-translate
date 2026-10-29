/* Margin Translate · 页边译 —— 公共配置 / 语言表 / 工具函数
 * 该文件同时被 content script（世界隔离）与扩展页面（popup/options）加载，
 * 因此内部不得依赖任何 DOM，也不得直接使用 chrome.* 之外的宿主能力。
 */
(function (root) {
  'use strict';

  /* ---------------------------------------------------------------- 语言表 */
  // code 为扩展内部统一使用的 BCP-47（小写），各引擎在 background/engines.js 内自行映射。
  const LANGUAGES = [
    { code: 'zh-CN', en: 'Chinese (Simplified)', zh: '简体中文', google: 'zh-CN', deepl: 'ZH', azure: 'zh-Hans', mymemory: 'zh-CN', libre: 'zh' },
    { code: 'zh-TW', en: 'Chinese (Traditional)', zh: '繁体中文', google: 'zh-TW', deepl: 'ZH-HANT', azure: 'zh-Hant', mymemory: 'zh-TW', libre: 'zh' },
    { code: 'en', en: 'English', zh: '英语', google: 'en', deepl: 'EN-US', azure: 'en', mymemory: 'en-US', libre: 'en' },
    { code: 'ja', en: 'Japanese', zh: '日语', google: 'ja', deepl: 'JA', azure: 'ja', mymemory: 'ja-JP', libre: 'ja' },
    { code: 'ko', en: 'Korean', zh: '韩语', google: 'ko', deepl: 'KO', azure: 'ko', mymemory: 'ko-KR', libre: 'ko' },
    { code: 'fr', en: 'French', zh: '法语', google: 'fr', deepl: 'FR', azure: 'fr', mymemory: 'fr-FR', libre: 'fr' },
    { code: 'de', en: 'German', zh: '德语', google: 'de', deepl: 'DE', azure: 'de', mymemory: 'de-DE', libre: 'de' },
    { code: 'es', en: 'Spanish', zh: '西班牙语', google: 'es', deepl: 'ES', azure: 'es', mymemory: 'es-ES', libre: 'es' },
    { code: 'it', en: 'Italian', zh: '意大利语', google: 'it', deepl: 'IT', azure: 'it', mymemory: 'it-IT', libre: 'it' },
    { code: 'pt', en: 'Portuguese', zh: '葡萄牙语', google: 'pt', deepl: 'PT-PT', azure: 'pt', mymemory: 'pt-PT', libre: 'pt' },
    { code: 'ru', en: 'Russian', zh: '俄语', google: 'ru', deepl: 'RU', azure: 'ru', mymemory: 'ru-RU', libre: 'ru' },
    { code: 'ar', en: 'Arabic', zh: '阿拉伯语', google: 'ar', deepl: 'AR', azure: 'ar', mymemory: 'ar-SA', libre: 'ar' },
    { code: 'hi', en: 'Hindi', zh: '印地语', google: 'hi', deepl: 'ID', azure: 'hi', mymemory: 'hi-IN', libre: 'hi' },
    { code: 'id', en: 'Indonesian', zh: '印尼语', google: 'id', deepl: 'ID', azure: 'id', mymemory: 'id-ID', libre: 'id' },
    { code: 'th', en: 'Thai', zh: '泰语', google: 'th', deepl: 'TH', azure: 'th', mymemory: 'th-TH', libre: 'th' },
    { code: 'vi', en: 'Vietnamese', zh: '越南语', google: 'vi', deepl: 'VI', azure: 'vi', mymemory: 'vi-VN', libre: 'vi' },
    { code: 'tr', en: 'Turkish', zh: '土耳其语', google: 'tr', deepl: 'TR', azure: 'tr', mymemory: 'tr-TR', libre: 'tr' },
    { code: 'pl', en: 'Polish', zh: '波兰语', google: 'pl', deepl: 'PL', azure: 'pl', mymemory: 'pl-PL', libre: 'pl' },
    { code: 'nl', en: 'Dutch', zh: '荷兰语', google: 'nl', deepl: 'NL', azure: 'nl', mymemory: 'nl-NL', libre: 'nl' },
    { code: 'uk', en: 'Ukrainian', zh: '乌克兰语', google: 'uk', deepl: 'UK', azure: 'uk', mymemory: 'uk-UA', libre: 'uk' },
    { code: 'cs', en: 'Czech', zh: '捷克语', google: 'cs', deepl: 'CS', azure: 'cs', mymemory: 'cs-CZ', libre: 'cs' },
    { code: 'sv', en: 'Swedish', zh: '瑞典语', google: 'sv', deepl: 'SV', azure: 'sv', mymemory: 'sv-SE', libre: 'sv' },
    { code: 'el', en: 'Greek', zh: '希腊语', google: 'el', deepl: 'EL', azure: 'el', mymemory: 'el-GR', libre: 'el' },
    { code: 'he', en: 'Hebrew', zh: '希伯来语', google: 'iw', deepl: 'HE', azure: 'he', mymemory: 'he-IL', libre: 'he' },
    { code: 'fa', en: 'Persian', zh: '波斯语', google: 'fa', deepl: 'FA', azure: 'fa', mymemory: 'fa-IR', libre: 'fa' },
    { code: 'ro', en: 'Romanian', zh: '罗马尼亚语', google: 'ro', deepl: 'RO', azure: 'ro', mymemory: 'ro-RO', libre: 'ro' },
    { code: 'fi', en: 'Finnish', zh: '芬兰语', google: 'fi', deepl: 'FI', azure: 'fi', mymemory: 'fi-FI', libre: 'fi' },
    { code: 'da', en: 'Danish', zh: '丹麦语', google: 'da', deepl: 'DA', azure: 'da', mymemory: 'da-DK', libre: 'da' },
    { code: 'no', en: 'Norwegian', zh: '挪威语', google: 'no', deepl: 'NB', azure: 'nb', mymemory: 'no-NO', libre: 'nb' },
    { code: 'hu', en: 'Hungarian', zh: '匈牙利语', google: 'hu', deepl: 'HU', azure: 'hu', mymemory: 'hu-HU', libre: 'hu' }
  ];

  // 部分引擎使用自有语言代码且不适合塞进 LANGUAGES 行结构的补充映射
  const EXTRA_MAP = {
    baidu: {
      'zh-CN': 'zh', 'zh-TW': 'cht', ja: 'jp', ko: 'kor', fr: 'fra', es: 'spa', ar: 'ara', el: 'el',
      fi: 'fin', da: 'dan', sv: 'swe', hi: '', he: '', fa: '', ro: '', uk: '', id: '', no: '', tr: ''
    }
  };

  const LANG_MAP = LANGUAGES.reduce((m, l) => ((m[l.code] = l), m), {});
  const AUTO = 'auto';

  /** 取某语言在指定引擎下的代码，取不到就退回通用 code。 */
  function langCode(code, engine) {
    if (!code || code === AUTO || code === 'auto') return AUTO;
    const extra = EXTRA_MAP[engine];
    if (extra && Object.prototype.hasOwnProperty.call(extra, code)) return extra[code] || code;
    const row = LANG_MAP[code];
    if (!row) return code;
    return row[engine] || row.code;
  }

  function langLabel(code) {
    if (code === AUTO) return '自动检测';
    const row = LANG_MAP[code];
    return row ? `${row.zh} · ${row.en}` : code;
  }

  /** 把任意来源的语言标记（zh_CN / zh-Hans / chinese 等）归一到内部 code。 */
  function normalizeLang(input) {
    if (!input) return AUTO;
    const raw = String(input).trim().toLowerCase().replace(/_/g, '-');
    if (!raw || raw === 'auto') return AUTO;
    if (raw === 'zh-hans' || raw === 'zh-hans-cn') return 'zh-CN';
    if (raw === 'zh-hant' || raw === 'zh-hk') return 'zh-TW';
    for (const row of LANGUAGES) {
      if (row.code.toLowerCase() === raw) return row.code;
      if (
        row.google.toLowerCase() === raw ||
        row.deepl.toLowerCase() === raw ||
        row.azure.toLowerCase() === raw ||
        row.libre.toLowerCase() === raw ||
        row.mymemory.toLowerCase() === raw
      ) {
        return row.code;
      }
    }
    const base = raw.split('-')[0];
    return LANG_MAP[base] ? LANG_MAP[base].code : raw;
  }

  /* ------------------------------------------------------------ 默认配置 */
  const ENGINE_DEFAULTS = [
    { id: 'google-free', enabled: true },
    { id: 'mymemory', enabled: true },
    { id: 'libretranslate', enabled: true },
    { id: 'baidu', enabled: false },
    { id: 'deepl', enabled: false },
    { id: 'azure', enabled: false },
    { id: 'openai', enabled: false },
    { id: 'custom', enabled: false }
  ];

  const DEFAULT_SETTINGS = {
    // 配置版本号：升级默认值时用最小版本迁移（见 translator.getSettings）
    settingsVersion: 3,
    targetLang: 'zh-CN',
    sourceLang: AUTO,
    autoTranslateSelection: true, // 选中后立即翻译，无需再点图标
    showSelectionIcon: true, // 关闭自动翻译时用图标触发
    bilingualPosition: 'below', // below | replace
    bilingualFontSize: 0.92,
    theme: 'auto', // auto | light | dark
    tts: true,
    cacheEnabled: true,
    textLenLimit: 5000,
    engines: ENGINE_DEFAULTS.map((e) => ({
      id: e.id,
      enabled: e.enabled,
      // 各引擎自己的可达参数，未用到时留空
      apiKey: '',
      secret: '',
      region: '',
      email: '',
      baseUrl: '',
      model: ''
    })),
    engineOrder: ENGINE_DEFAULTS.map((e) => e.id),
    fallback: true, // 引擎失败时自动切换下一个可用引擎
    skipHosts: []
  };

  const DEFAULT_STATS = { requests: 0, chars: 0, failures: 0, byEngine: {} };

  /* -------------------------------------------------------------- 工具集 */
  function hash32(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36);
  }

  /** 文本是否含有可翻译的实质内容。 */
  function isTranslatable(text) {
    if (!text) return false;
    const t = text.trim();
    if (t.length < 2) return false;
    if (/^[\s\d.,;:!?()[\]{}<>+=\-*/\\|~^%$#@&_'"]+$/.test(t)) return false;
    return /[\p{L}\p{N}]/u.test(t);
  }

  /** 按最大长度把长文本切成若干段，尽量在标点/换行处断开并保留换行符。 */
  function splitText(text, max = 1800) {
    if (!text || text.length <= max) return [text];
    const lines = text.split('\n');
    const parts = [];
    let buf = '';
    const flush = () => {
      if (buf) {
        parts.push(buf);
        buf = '';
      }
    };
    for (let i = 0; i < lines.length; i++) {
      const piece = lines[i] + (i < lines.length - 1 ? '\n' : '');
      if (buf.length + piece.length > max) flush();
      if (piece.length <= max) {
        buf += piece;
      } else {
        let rest = piece;
        while (rest.length > max) {
          let cut = Math.max(rest.lastIndexOf('。', max), rest.lastIndexOf('. ', max), rest.lastIndexOf('，', max), rest.lastIndexOf(' ', max));
          if (cut < max * 0.5) cut = max;
          parts.push(rest.slice(0, cut));
          rest = rest.slice(cut);
        }
        buf = rest;
      }
    }
    flush();
    return parts;
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /**
   * 项目对外链接与支持入口集中在这里，改这一处即可同步到设置页。
   * sponsor / wechatPayQr 等留空时，设置页会自动隐藏对应按钮，不会显示空链接。
   */
  const LINKS = {
    github: 'https://github.com/keptclip/margin-translate',
    privacy: 'https://keptclip.github.io/margin-translate/',
    issues: 'https://github.com/keptclip/margin-translate/issues',
    // 打赏入口：有就填，没有就留空
    afdian: 'https://afdian.com/a/keptclip', // 爱发电主页（申请创作者认证时需要公开这个链接）
    githubSponsors: '', // 例如 https://github.com/sponsors/keptclip
    customDonate: '' // 例如一个收款页面或文章链接
  };

  // 打赏引导文案（留空则不显示这一行）
  const DONATE_NOTE = '金额随意，¥9 / ¥19 / ¥50 都欢迎 —— 你的支持会直接变成我继续维护它的时间。';

  root.MarginConfig = {
    LANGUAGES,
    LANG_MAP,
    AUTO,
    langCode,
    langLabel,
    normalizeLang,
    DEFAULT_SETTINGS,
    DEFAULT_STATS,
    ENGINE_DEFAULTS,
    LINKS,
    DONATE_NOTE,
    hash32,
    isTranslatable,
    splitText,
    sleep
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
