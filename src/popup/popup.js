/* Margin Translate · 页边译 —— 工具栏弹窗（轻量快速翻译） */
(function () {
  'use strict';

  const C = window.MarginConfig;
  const $ = (id) => document.getElementById(id);
  const engineName = {
    'google-free': 'Google 免费端点（实验性）',
    mymemory: 'MyMemory',
    libretranslate: 'LibreTranslate',
    baidu: '百度翻译',
    deepl: 'DeepL',
    azure: '微软 Translator',
    openai: 'AI 模型',
    custom: '自定义端点'
  };

  let settings = null;

  const send = (msg) =>
    new Promise((resolve) => {
      chrome.runtime.sendMessage(msg, (res) => {
        if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
        else resolve(res);
      });
    });

  const patch = async (p) => {
    Object.assign(settings, p);
    await send({ type: 'setSettings', patch: p });
  };

  function fillLangs() {
    const s = $('source');
    const t = $('target');
    s.appendChild(new Option('自动检测', C.AUTO));
    C.LANGUAGES.forEach((l) => {
      s.appendChild(new Option(`${l.zh} · ${l.en}`, l.code));
      t.appendChild(new Option(`${l.zh} · ${l.en}`, l.code));
    });
    s.value = settings.sourceLang || C.AUTO;
    t.value = settings.targetLang;
  }

  async function doTranslate(force) {
    const text = $('input').value.trim();
    const out = $('out');
    if (!text) {
      out.classList.add('error');
      out.textContent = '请输入要翻译的内容';
      return;
    }
    out.classList.remove('error');
    out.textContent = '翻译中…';
    const res = await send({
      type: 'translate',
      text,
      source: settings.sourceLang,
      target: settings.targetLang,
      noCache: force || settings.cacheEnabled === false
    });
    if (!res || !res.ok || !res.data.ok) {
      out.classList.add('error');
      out.textContent = `翻译失败：${(res && res.error) || (res && res.data && res.data.error) || '未知错误'}`;
      renderMeta(null);
      return;
    }
    const d = res.data;
    out.textContent = d.text;
    renderMeta(d);
  }

  function renderMeta(d) {
    const meta = $('meta');
    meta.textContent = '';
    if (!d) {
      meta.appendChild(Object.assign(document.createElement('span'), { className: 'badge warn', textContent: '可在设置页调整引擎' }));
      return;
    }
    const add = (text, cls) => meta.appendChild(Object.assign(document.createElement('span'), { className: cls ? `badge ${cls}` : 'badge', textContent: text }));
    add(engineName[d.engine] || d.engine || '未知引擎');
    add(`${(d.text || '').length} 字符`, '');
    if (d.cached) add('来自缓存');
    const attempts = (d.attempts || []).filter((a) => a.error);
    if (attempts.length) add(`已自动降级 ${attempts.length} 次`, 'warn');
  }

  async function pickSelectionText() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return '';
    try {
      const [injection] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => String(window.getSelection() || '').trim()
      });
      return injection && injection.result ? injection.result : '';
    } catch (_) {
      return '';
    }
  }

  async function init() {
    const res = await send({ type: 'getSettings' });
    settings = (res && res.ok && res.data) || JSON.parse(JSON.stringify(C.DEFAULT_SETTINGS));
    fillLangs();

    $('source').addEventListener('change', (e) => patch({ sourceLang: e.target.value }));
    $('target').addEventListener('change', async (e) => {
      await patch({ targetLang: e.target.value });
      if ($('input').value.trim()) doTranslate(false);
    });
    $('swap').addEventListener('click', async () => {
      const next = { sourceLang: settings.targetLang, targetLang: settings.sourceLang === C.AUTO ? 'en' : settings.sourceLang };
      await patch(next);
      $('source').value = next.sourceLang;
      $('target').value = next.targetLang;
    });
    $('translate').addEventListener('click', () => doTranslate(true));
    $('clear').addEventListener('click', () => {
      $('input').value = '';
      $('out').textContent = '';
      $('meta').textContent = '';
    });
    $('copy').addEventListener('click', async () => {
      const text = $('out').textContent.trim();
      if (!text) return;
      await navigator.clipboard.writeText(text);
      $('copy').textContent = '已复制';
      setTimeout(() => ($('copy').textContent = '复制'), 1200);
    });
    $('input').addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        doTranslate(true);
      }
    });
    $('settings').addEventListener('click', () => chrome.runtime.openOptionsPage());
    $('bilingual').addEventListener('click', async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) return;
      await chrome.tabs.sendMessage(tab.id, { type: 'command', command: 'toggle-bilingual' }).catch(() => {});
      window.close();
    });

    const selected = await pickSelectionText();
    if (selected && !$('input').value.trim()) {
      $('input').value = selected;
      doTranslate(false);
    } else {
      $('input').focus();
    }
  }

  init();
})();
