/* Margin Translate · 页边译 —— 后台入口（Service Worker）
 * 只负责消息路由、快捷键与右键菜单，所有网络请求由 engines.js 发起。
 */
importScripts('../shared/config.js', 'engines.js', 'translator.js');

const T = self.MarginTranslator;
const { ENGINE_MAP, ENGINES } = self.MarginEngines;
const C = self.MarginConfig;

/* --------------------------------------------------------------- 生命周期 */
async function setupMenus() {
  await new Promise((res) => chrome.contextMenus.removeAll(res));
  const title = (chrome.i18n && chrome.i18n.getMessage('menuTranslate')) || '使用 Margin Translate 翻译「%s」';
  chrome.contextMenus.create({
    id: 'margin-selection',
    title,
    contexts: ['selection']
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  await T.getSettings(); // 首次安装时写入默认配置到 sync
  await setupMenus();
  chrome.alarms.create('margin-cache-cleanup', { periodInMinutes: 60 * 12 });
});

chrome.runtime.onStartup.addListener(setupMenus);

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'margin-selection' && tab && tab.id) {
    await sendToTab(tab.id, { type: 'command', command: 'translate-selection' }).catch(() => {});
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;
  await sendToTab(tab.id, { type: 'command', command }).catch(async () => {
    // content script 未注入（系统页 / 扩展商店等），尝试按需注入
    await ensureInjected(tab.id);
    await sendToTab(tab.id, { type: 'command', command }).catch(() => {});
  });
});

chrome.action.onClicked.addListener(async () => {
  // popup 已配置时不会触发；保留作为无 popup 场景的兜底
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.id) await sendToTab(tab.id, { type: 'command', command: 'toggle-panel' }).catch(() => {});
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'margin-cache-cleanup') {
    const stats = await T.getStats();
    console.log('[margin-translate] 缓存巡检，累计翻译字符：', stats.chars);
  }
});

async function ensureInjected(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['src/shared/config.js', 'src/content/styles.js', 'src/content/ui.js', 'src/content/bilingual.js', 'src/content/index.js']
    });
    await chrome.scripting.insertCSS({ target: { tabId }, files: ['src/content/host.css'] });
    return true;
  } catch (_) {
    return false;
  }
}

function sendToTab(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (res) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(res);
    });
  });
}

/* ----------------------------------------------------------------- 消息 */
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  const { type } = msg || {};
  if (!type) return;

  const handle = async () => {
    switch (type) {
      case 'getMeta':
        return {
          engines: ENGINES.map((e) => ({
            id: e.id,
            name: e.name,
            cost: e.cost,
            doc: e.doc,
            home: e.home,
            fields: e.fields || [],
            defaults: e.defaults || {},
            needsKey: (e.fields || []).some((f) => f.required)
          })),
          languages: C.LANGUAGES.map((l) => ({ code: l.code, zh: l.zh, en: l.en })),
          settings: await T.getSettings(),
          stats: await T.getStats(),
          commands: await new Promise((res) => chrome.commands.getAll(res))
        };
      case 'getSettings':
        return await T.getSettings();
      case 'setSettings':
        return await T.setSettings(msg.patch || {});
      case 'translate':
        return await T.translate(msg);
      case 'translateBatch':
        return await T.translateBatch(msg.texts || [], msg.target, msg.source);
      case 'detectLanguage':
        return await T.detectLanguage(msg.text || '');
      case 'testEngine': {
        const settings = await T.getSettings();
        return await T.testEngine(msg.id, Object.assign(T.engineConfig(settings, msg.id), msg.override || {}));
      }
      case 'resetStats':
        await T.resetStats();
        return await T.getStats();
      case 'clearCache':
        await T.clearCache();
        return { ok: true };
      case 'openOptions':
        await chrome.runtime.openOptionsPage();
        return { ok: true };
      default:
        return { ok: false, error: '未知消息：' + type };
    }
  };

  handle()
    .then((data) => reply({ ok: true, data }))
    .catch((err) => reply({ ok: false, error: (err && err.message) || String(err) }));

  return true; // 保持消息通道，使用异步 reply
});
