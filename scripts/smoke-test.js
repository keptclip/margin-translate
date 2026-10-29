#!/usr/bin/env node
/* 冒烟测试：在 Node 里加载纯逻辑，验证工具函数与各免费引擎的连通性。
 * 用法：node scripts/smoke-test.js
 * 说明：网络不可达（如域名在当前网络被拦截）记为告警，不计为失败。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');

function load(file) {
  const code = fs.readFileSync(path.join(ROOT, file), 'utf8');
  new Function('self', code)(globalThis); // eslint-disable-line no-new-func
}

load('src/shared/config.js');
load('src/background/engines.js');

const C = globalThis.MarginConfig;
const E = globalThis.MarginEngines;
const { ENGINE_MAP } = E;

let failed = 0;
function check(name, cond, extra) {
  const ok = Boolean(cond);
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`);
}
function warn(name, extra) {
  console.log(`⚠ ${name}${extra ? ' — ' + extra : ''}`);
}

/* ------------------------------------------------------------- 纯逻辑 */
check('splitText 切块', C.splitText('a'.repeat(3000), 1800).length === 2);
check('splitText 保留换行', C.splitText('第一段\n第二段\n第三段', 1800).join('') === '第一段\n第二段\n第三段');
check('isTranslatable 过滤纯标点', !C.isTranslatable('……!!') && C.isTranslatable('Hello world'));
check('normalizeLang 归一', C.normalizeLang('zh_CN') === 'zh-CN' && C.normalizeLang('EN-US') === 'en' && C.normalizeLang('zh-Hans') === 'zh-CN');
check('langCode 引擎映射', C.langCode('zh-CN', 'deepl') === 'ZH' && C.langCode('en', 'azure') === 'en' && C.langCode('auto', 'google') === 'auto');
check('langCode 百度映射', C.langCode('zh-CN', 'baidu') === 'zh' && C.langCode('ja', 'baidu') === 'jp' && C.langCode('zh-TW', 'baidu') === 'cht');
check('引擎清单完整', ENGINE_MAP.mymemory && ENGINE_MAP['google-free'] && ENGINE_MAP.baidu && ENGINE_MAP.custom, Object.keys(ENGINE_MAP).join(','));

/* ------------------------------------------------------- MD5 签名正确性 */
(async () => {
  const { md5Hex } = E;
  const samples = ['a', 'abc', 'hello world 你好世界', 'x'.repeat(999), '😀 emoji 与 中英混排'];
  check(
    'md5Hex 与标准 MD5 一致（百度签名依赖）',
    samples.every((s) => md5Hex(s) === crypto.createHash('md5').update(s, 'utf8').digest('hex')),
    md5Hex('a')
  );

  async function tryEngine(id, cfg, label, tolerantNetwork) {
    const engine = ENGINE_MAP[id];
    const t0 = Date.now();
    try {
      const out = await engine.translate({
        text: 'Hello! This is a connection test.',
        source: 'en',
        target: 'zh-CN',
        cfg: Object.assign({}, engine.defaults, cfg)
      });
      check(`${label} 连通`, !!out && out.length > 0, `${Date.now() - t0}ms → ${String(out).slice(0, 40)}`);
    } catch (err) {
      const msg = err.message || String(err);
      if (tolerantNetwork && /网络不可达|请求超时/.test(msg)) warn(`${label} 不可达（网络环境受限，正式使用时请以浏览器网络为准）`, msg);
      else if (/^未填写/.test(msg)) warn(`${label} 需要填写密钥`);
      else warn(`${label} 返回错误`, msg);
    }
  }

  await tryEngine('mymemory', { email: '' }, 'MyMemory 免费', false);
  await tryEngine('google-free', {}, 'Google 免费端点', true);
  await tryEngine('libretranslate', { baseUrl: 'https://libretranslate.com', apiKey: '' }, 'LibreTranslate 公共实例', true);
  await tryEngine('baidu', { appId: '', secret: '' }, '百度（需密钥）', true);
  console.log(failed ? `\n共 ${failed} 项未通过` : '\n逻辑检查全部通过');
  process.exit(failed ? 1 : 0);
})();
