/* Margin Translate · 页边译 —— 调度层：配置、缓存、按需降级、统计
 * 运行在 Service Worker 中，通过 importScripts 加载。
 */
(function (root) {
  'use strict';

  const { ENGINE_MAP, Limiter } = root.MarginEngines;
  const C = root.MarginConfig;
  const { AUTO, DEFAULT_SETTINGS, DEFAULT_STATS, hash32, splitText, normalizeLang } = C;

  const CACHE_MAX = 3000;
  const CACHE_INDEX_KEY = 'cacheIndex';
  const SETTINGS_KEY = 'settings';
  const STATS_KEY = 'stats';

  const limiters = new Map();
  const memoryCache = new Map();
  // 引擎健康度：连续失败的引擎会被临时降权，避免每次都先卡在不可用的平台上
  const health = new Map();
  const HEALTH_STEP_MS = 45000;

  function limiterFor(id) {
    if (!limiters.has(id)) {
      const limits = (ENGINE_MAP[id] && ENGINE_MAP[id].limits) || {};
      limiters.set(id, new Limiter(limits.concurrency || 2, limits.minIntervalMs || 60));
    }
    return limiters.get(id);
  }

  /* ------------------------------------------------------------- storage */
  const localGet = (k) =>
    new Promise((res) => chrome.storage.local.get(k, (o) => res((o && o[k]) ?? null)));
  const localSet = (o) => new Promise((res) => chrome.storage.local.set(o, () => res()));
  const syncGet = (k) => new Promise((res) => chrome.storage.sync.get(k, (o) => res((o && o[k]) ?? null)));
  const syncSet = (o) => new Promise((res) => chrome.storage.sync.set(o, () => res()));

  function deepMerge(base, patch) {
    if (!patch || typeof patch !== 'object') return base;
    if (Array.isArray(base) || Array.isArray(patch)) return patch;
    const out = Object.assign({}, base);
    for (const [k, v] of Object.entries(patch)) {
      out[k] = v && typeof v === 'object' && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])
        ? deepMerge(base[k], v)
        : v;
    }
    return out;
  }

  async function getSettings() {
    const stored = await syncGet(SETTINGS_KEY);
    const merged = deepMerge(structuredClone(DEFAULT_SETTINGS), stored || {});
    // 保证引擎列表完整（新增引擎后旧配置也能补齐）
    const known = merged.engines || [];
    merged.engines = DEFAULT_SETTINGS.engines.map((def) => {
      const found = known.find((e) => e.id === def.id);
      const engineDefaults = (ENGINE_MAP[def.id] && ENGINE_MAP[def.id].defaults) || {};
      return Object.assign({}, def, engineDefaults, found || {});
    });
    merged.engineOrder = DEFAULT_SETTINGS.engineOrder.map((id) => id).concat(
      (merged.engineOrder || []).filter((id) => !DEFAULT_SETTINGS.engineOrder.includes(id))
    );
    if (!Array.isArray(merged.skipHosts)) merged.skipHosts = [];
    // 老配置迁移：v2 起「选中即翻译」，v3 起把质量最好的免费引擎放到首位
    if (!merged.settingsVersion || merged.settingsVersion < 3) {
      if ((merged.settingsVersion || 0) < 2) merged.autoTranslateSelection = true;
      const legacyOrder = ['mymemory', 'google-free', 'libretranslate', 'baidu', 'deepl', 'azure', 'openai', 'custom'];
      if (JSON.stringify(merged.engineOrder) === JSON.stringify(legacyOrder)) {
        merged.engineOrder = DEFAULT_SETTINGS.engineOrder.slice();
      }
      merged.settingsVersion = 3;
      await syncSet({ [SETTINGS_KEY]: merged });
    }
    return merged;
  }

  async function setSettings(patch) {
    const current = await getSettings();
    const next = deepMerge(current, patch);
    await syncSet({ [SETTINGS_KEY]: next });
    return next;
  }

  function engineConfig(settings, id) {
    const row = (settings.engines || []).find((e) => e.id === id);
    return Object.assign({}, (ENGINE_MAP[id] && ENGINE_MAP[id].defaults) || {}, row || {});
  }

  /** 按用户自定义顺序返回所有已启用的引擎配置 */
  function activeEngines(settings) {
    const order = settings.engineOrder || [];
    return (settings.engines || [])
      .filter((e) => e.enabled && ENGINE_MAP[e.id])
      .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
      .map((e) => Object.assign({}, (ENGINE_MAP[e.id] && ENGINE_MAP[e.id].defaults) || {}, e));
  }

  /* --------------------------------------------------------------- 缓存 */
  function cacheKey(engineId, source, target, text) {
    const suffix = engineId ? `:${engineId}` : '';
    return `c_${hash32(`${source}>${target}${suffix}:${text}`)}`;
  }

  async function cacheGet(key) {
    if (memoryCache.has(key)) return memoryCache.get(key);
    const hit = await localGet(key);
    if (hit && hit.v) memoryCache.set(key, hit);
    return hit && hit.v ? hit : null;
  }

  async function cachePut(key, value, engineId) {
    memoryCache.set(key, { v: value, ts: Date.now(), e: engineId });
    await localSet({ [key]: { v: value, ts: Date.now(), e: engineId } });
    const index = (await localGet(CACHE_INDEX_KEY)) || [];
    index.push({ k: key, ts: Date.now() });
    if (index.length > CACHE_MAX) {
      const dead = index.splice(0, index.length - CACHE_MAX);
      for (const d of dead) memoryCache.delete(d.k);
      await chrome.storage.local.remove(dead.map((d) => d.k));
    }
    await localSet({ [CACHE_INDEX_KEY]: index });
  }

  async function clearCache() {
    memoryCache.clear();
    const index = (await localGet(CACHE_INDEX_KEY)) || [];
    for (const d of index) await chrome.storage.local.remove(d.k);
    await localSet({ [CACHE_INDEX_KEY]: [] });
  }

  /* --------------------------------------------------------------- 统计 */
  async function bumpStats(engineId, chars, failed) {
    const stats = Object.assign(structuredClone(DEFAULT_STATS), (await localGet(STATS_KEY)) || {});
    stats.requests += 1;
    stats.chars += chars || 0;
    if (failed) stats.failures += 1;
    stats.byEngine = stats.byEngine || {};
    stats.byEngine[engineId] = stats.byEngine[engineId] || { requests: 0, failures: 0, chars: 0 };
    stats.byEngine[engineId].requests += 1;
    stats.byEngine[engineId].chars += chars || 0;
    if (failed) stats.byEngine[engineId].failures += 1;
    await localSet({ [STATS_KEY]: stats });
    return stats;
  }

  async function getStats() {
    return Object.assign(structuredClone(DEFAULT_STATS), (await localGet(STATS_KEY)) || {});
  }

  async function resetStats() {
    await localSet({ [STATS_KEY]: structuredClone(DEFAULT_STATS) });
  }

  /* ----------------------------------------------------------- 核心翻译 */
  /**
   * 单条文本翻译。
   * @returns {Promise<{ok:boolean, text?:string, engine?:string, source?:string, cached?:boolean, error?:string, attempts?:Array}>}
   */
  async function translate(payload) {
    const { text, target, engineId, noCache, retry } = payload || {};
    let source = normalizeLang(payload.source || AUTO);
    const settings = await getSettings();
    const targetLang = normalizeLang(target || settings.targetLang);
    const trimmed = String(text || '').trim();

    if (!trimmed) return { ok: false, error: '没有可翻译的文本' };
    if (trimmed.length > (settings.textLenLimit || 5000)) {
      return { ok: false, error: `单次文本超过限制（${trimmed.length}/${settings.textLenLimit} 字符）` };
    }
    // 未指定源语言时用浏览器本地语言检测，让不支持 Auto 的平台（如 MyMemory）也能正常工作
    if (source === AUTO) {
      const detected = await detectLanguage(trimmed);
      if (detected.ok && detected.language && detected.language !== AUTO) source = detected.language;
    }

    let queue;
    if (engineId) {
      const cfg = engineConfig(settings, engineId);
      if (!ENGINE_MAP[engineId]) return { ok: false, error: '未知引擎：' + engineId };
      if (cfg.enabled === false) return { ok: false, error: `${ENGINE_MAP[engineId].name} 尚未启用` };
      queue = [cfg];
    } else {
      queue = activeEngines(settings);
    }
    if (!queue.length) return { ok: false, error: '没有启用任何翻译引擎，请在设置页开启至少一个（推荐先开免费引擎）' };

    const cacheEnabled = settings.cacheEnabled !== false && !noCache;
    if (cacheEnabled) {
      const hit = await cacheGet(cacheKey(engineId || '', source, targetLang, trimmed));
      if (hit) return { ok: true, text: hit.v, engine: hit.e, source, target: targetLang, cached: true };
    }

    const attempts = [];
    let lastError = '';
    const now = Date.now();
    const cooling = (id) => ((health.get(id) || {}).until || 0) > now;
    const allCooling = queue.every((c) => cooling(c.id)); // 全部不可用时忽略冷却，至少试一次
    for (const cfg of queue) {
      const engine = ENGINE_MAP[cfg.id];
      if (!engine) continue;
      if (!allCooling && cooling(engine.id)) continue;
      let round = Number(cfg.retries || (retry ? 1 : 0)) + 1;
      while (round-- > 0) {
        try {
          const out = await translateWith(engine, cfg, trimmed, source, targetLang);
          if (health.has(engine.id)) health.delete(engine.id);
          if (cacheEnabled) await cachePut(cacheKey(engineId || '', source, targetLang, trimmed), out, engine.id);
          await bumpStats(engine.id, trimmed.length, false);
          return { ok: true, text: out, engine: engine.id, source, target: targetLang, cached: false, attempts };
        } catch (err) {
          lastError = err && err.message ? err.message : String(err);
          attempts.push({ engine: engine.id, name: engine.name, error: lastError });
          await bumpStats(engine.id, trimmed.length, true);
          const prev = health.get(engine.id) || { fails: 0 };
          const fails = prev.fails + 1;
          health.set(engine.id, { fails, until: Date.now() + Math.min(6, fails) * HEALTH_STEP_MS });
        }
      }
      // 指定单个引擎，或关闭自动降级时不再继续尝试下一个
      if (engineId || settings.fallback === false) break;
    }
    return { ok: false, error: lastError || '所有可用引擎都失败了', attempts };
  }

  /** 调用单个引擎：按引擎自身的长度上限切块后拼接 */
  async function translateWith(engine, cfg, text, source, target) {
    const maxChars = (engine.limits && engine.limits.maxChars) || 1800;
    const chunks = splitText(text, maxChars);
    const limiter = limiterFor(engine.id);
    if (chunks.length === 1) {
      return limiter.run(() => engine.translate({ text: chunks[0], source, target, cfg }));
    }
    const out = [];
    for (const chunk of chunks) {
      if (!chunk.trim()) {
        out.push(chunk);
        continue;
      }
      out.push(await limiter.run(() => engine.translate({ text: chunk, source, target, cfg })));
    }
    return out.join('');
  }

  /** 批量翻译（页内双语使用）：去重 + 串行执行，避免触发引擎限流 */
  async function translateBatch(texts, target, source) {
    const settings = await getSettings();
    const targetLang = normalizeLang(target || settings.targetLang);
    const srcLang = normalizeLang(source || AUTO);
    const memo = new Map();
    const out = [];
    for (const raw of texts) {
      const key = String(raw == null ? '' : raw).trim();
      if (!key) {
        out.push({ ok: false, text: '', error: 'empty' });
        continue;
      }
      if (memo.has(key)) {
        out.push(memo.get(key));
        continue;
      }
      const r = await translate({ text: key, target: targetLang, source: srcLang });
      const item = { ok: r.ok, text: r.text || '', engine: r.engine, cached: r.cached, error: r.error };
      memo.set(key, item);
      out.push(item);
    }
    return out;
  }

  /** 设置页的连通性测试 */
  async function testEngine(id, overrideCfg) {
    const settings = await getSettings();
    const cfg = Object.assign(engineConfig(settings, id), overrideCfg || {});
    const engine = ENGINE_MAP[id];
    if (!engine) return { ok: false, error: '未知引擎' };
    const t0 = Date.now();
    try {
      const out = await engine.translate({ text: 'Hello! This is a connection test.', source: 'en', target: settings.targetLang, cfg });
      return { ok: true, text: out, ms: Date.now() - t0 };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err), ms: Date.now() - t0 };
    }
  }

  /** 语言检测：优先使用浏览器内置能力，失败则回退到 Google 端点 */
  async function detectLanguage(text) {
    try {
      if (chrome.i18n && chrome.i18n.detectLanguage) {
        const res = await new Promise((resolve, reject) =>
          chrome.i18n.detectLanguage(String(text).slice(0, 500), (r) => (chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve(r)))
        );
        const best = res && res.languages && res.languages[0];
        if (best && best.language && best.confidence > 0.4 && best.confidence) {
          return { ok: true, language: normalizeLang(best.language), confidence: best.confidence };
        }
      }
    } catch (_) {
      /* 忽略，继续尝试在线检测 */
    }
    return { ok: false, language: AUTO, confidence: 0 };
  }

  root.MarginTranslator = {
    translate,
    translateBatch,
    testEngine,
    detectLanguage,
    getSettings,
    setSettings,
    engineConfig,
    activeEngines,
    getStats,
    resetStats,
    clearCache
  };
})(self);
