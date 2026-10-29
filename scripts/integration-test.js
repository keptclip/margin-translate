#!/usr/bin/env node
/* 集成测试：用最小化的 chrome.storage 桩在新窗口里跑一遍「后台调度 + 真实网络」。
 * 用法：node scripts/integration-test.js
 * 覆盖：设置合并、缓存命中、自动降级、统计、批量翻译。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/* ------------------------------------------------- chrome.storage 桩 */
function mockStore() {
  const data = new Map();
  return {
    get(keys, cb) {
      const list = Array.isArray(keys) ? keys : [keys];
      const out = {};
      list.forEach((k) => {
        if (data.has(k)) out[k] = data.get(k);
      });
      cb(out);
    },
    set(obj, cb) {
      Object.entries(obj).forEach(([k, v]) => data.set(k, JSON.parse(JSON.stringify(v))));
      cb && cb();
    },
    remove(keys, cb) {
      (Array.isArray(keys) ? keys : [keys]).forEach((k) => data.delete(k));
      cb && cb();
    },
    _dump: () => data
  };
}
globalThis.chrome = { storage: { local: mockStore(), sync: mockStore() } };

function load(file) {
  new Function('self', fs.readFileSync(path.join(ROOT, file), 'utf8'))(globalThis); // eslint-disable-line no-new-func
}

load('src/shared/config.js');
load('src/background/engines.js');
load('src/background/translator.js');

const T = globalThis.MarginTranslator;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failed = 0;
function check(name, cond, extra) {
  const ok = Boolean(cond);
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`);
}

(async () => {
  const settings = await T.getSettings();
  check('默认设置已写入', settings.targetLang === 'zh-CN' && settings.sourceLang === 'auto');
  check('默认启用 3 个免费引擎', settings.engines.filter((e) => e.enabled).length === 3,
    settings.engines.filter((e) => e.enabled).map((e) => e.id).join(','));
  check('引擎顺序含全部 8 个', settings.engineOrder.length === 8);

  const t0 = Date.now();
  const r1 = await T.translate({ text: 'Hello world!', target: 'zh-CN' });
  check('首次翻译成功', r1.ok, r1.ok ? `${Date.now() - t0}ms 引擎=${r1.engine} → ${r1.text}` : r1.error);

  const r2 = await T.translate({ text: 'Hello world!', target: 'zh-CN' });
  check('第二次命中缓存', r2.ok && r2.cached === true, r2.engine);

  const forced = await T.translate({ text: 'Hello world!', target: 'zh-CN' }, true);
  check('force 后仍可翻译', forced.ok);

  const batch = await T.translateBatch(['Good morning', 'How are you', 'thank you'], 'zh-CN');
  check('批量翻译成功', batch.filter((b) => b.ok).length >= 1, batch.map((b) => b.text).join(' / '));

  const badCfg = await T.translate({ text: 'Hello', target: 'zh-CN', engineId: 'deepl' });
  check('未启用/未配置引擎被拦截', !badCfg.ok, badCfg.error);

  const empty = await T.translate({ text: '   ', target: 'zh-CN' });
  check('空文本被拦截', !empty.ok, empty.error);

  const tooLong = await T.translate({ text: 'a'.repeat(6000), target: 'zh-CN' });
  check('超长文本被拦截', !tooLong.ok, tooLong.error);

  await sleep(50);
  const stats = await T.getStats();
  check('统计已累计', stats.requests > 0, `requests=${stats.requests} chars=${stats.chars} failures=${stats.failures}`);

  await T.clearCache();
  const r3 = await T.translate({ text: 'Hello world!', target: 'zh-CN' });
  check('清缓存后可重新翻译', r3.ok && r3.cached === false);

  console.log(failed ? `\n共 ${failed} 项未通过` : '\n全部通过');
  process.exit(failed ? 1 : 0);
})();
