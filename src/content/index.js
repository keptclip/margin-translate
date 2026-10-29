/* Margin Translate · 页边译 —— content script 协调层
 * 负责：选区监听、快捷键与消息响应、面板与双语对照联动。
 */
(function () {
  'use strict';

  if (window.__MARGIN_READY__) return;
  window.__MARGIN_READY__ = true;

  const C = window.MarginConfig;
  const { isTranslatable } = C;
  const EDITABLE = 'textarea, input[type="text"], input[type="search"], [contenteditable="true"], [contenteditable=""]';

  let settings = null;
  let ui = null;
  let bil = null;
  let iconTimer = null;
  let lastSelection = null;

  /* ------------------------------------------------------------- 通信封装 */
  function send(msg) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(msg, (res) => {
          if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
          else resolve(res);
        });
      } catch (err) {
        resolve({ ok: false, error: (err && err.message) || String(err) });
      }
    });
  }

  async function loadSettings() {
    const res = await send({ type: 'getSettings' });
    if (res && res.ok && res.data) settings = res.data;
    else settings = JSON.parse(JSON.stringify(C.DEFAULT_SETTINGS));
    return settings;
  }

  function setSetting(patch) {
    Object.assign(settings, patch);
    return send({ type: 'setSettings', patch });
  }

  async function callTranslate(msg, opts) {
    const payload = Object.assign({}, msg);
    if ((opts && opts.force) || settings.cacheEnabled === false) payload.noCache = true;
    const res = await send({ type: 'translate', ...payload });
    if (!res || !res.ok) return { ok: false, error: (res && res.error) || '后台无响应，请刷新页面重试' };
    return res.data;
  }

  /* --------------------------------------------------------------- 选区 */
  function currentEditable() {
    const active = document.activeElement;
    if (!active) return null;
    try {
      return active.matches && active.matches(EDITABLE) ? active : null;
    } catch (_) {
      return null;
    }
  }

  function selectionPayload(includeEmptySelection) {
    const editable = currentEditable();
    if (editable && (editable.tagName === 'TEXTAREA' || editable.tagName === 'INPUT')) {
      const start = editable.selectionStart;
      const end = editable.selectionEnd;
      const value = editable.value || '';
      const hasRange = typeof start === 'number' && typeof end === 'number' && end > start;
      const text = hasRange ? value.slice(start, end).trim() : includeEmptySelection ? value.trim() : '';
      if (!text) return null;
      const r = editable.getBoundingClientRect();
      return { text, rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom }, editable: true };
    }
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const text = String(sel).trim();
    if (!isTranslatable(text)) return null;
    const range = sel.getRangeAt(0);
    const rectObj = range.getBoundingClientRect();
    if (!rectObj.width && !rectObj.height) {
      const r = (range.startContainer.parentElement || document.body).getBoundingClientRect();
      return { text, rect: r, editable: false };
    }
    const rect = { left: rectObj.left, top: rectObj.top, right: rectObj.right, bottom: rectObj.bottom };
    const anchor = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
    const editableNode = anchor && anchor.closest ? anchor.closest(EDITABLE) : null;
    return { text, rect, editable: Boolean(editableNode) };
  }

  function replaceSelection(text) {
    const editable = currentEditable();
    if (editable) {
      if (editable.tagName === 'TEXTAREA' || editable.tagName === 'INPUT') {
        const start = editable.selectionStart;
        const end = editable.selectionEnd;
        const value = editable.value || '';
        const next = value.slice(0, Math.max(0, start ?? value.length)) + text + value.slice(end ?? value.length);
        setNativeValue(editable, next);
        ui.toast('已替换原文');
        return true;
      }
      editable.focus();
      document.execCommand('insertText', false, text);
      ui.toast('已替换原文');
      return true;
    }
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return false;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(document.createTextNode(text));
    ui.toast('已替换选中内容');
    return true;
  }

  function setNativeValue(el, value) {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /* ----------------------------------------------------------- 站点过滤 */
  function isSiteDisabled() {
    const hosts = (settings && settings.skipHosts) || [];
    return hosts.some((h) => h && location.hostname && (location.hostname === h || location.hostname.endsWith('.' + h)));
  }

  /* --------------------------------------------------------------- 双语 */
  async function toggleBilingual() {
    if (bil.running) {
      bil.cancelled = true;
      ui.toast('正在停止…');
      return;
    }
    if (bil.records.length) {
      bil.restore();
      ui.setBilingualState(false);
      ui.toast('已还原原文');
      return;
    }
    ui.toast('正在翻译当前页面…');
    ui.openPanel({});
    const res = await bil.start();
    if (!res.ok) {
      ui.toast(res.error || '页面双语处理失败');
      ui.setBilingualState(false);
      return;
    }
    ui.setBilingualState(true);
    ui.toast(`已完成 ${res.succeeded}/${res.total} 段${res.failed ? `，失败 ${res.failed} 段` : ''}`);
  }

  /* --------------------------------------------------------------- 事件 */
  function bindEvents() {
    document.addEventListener('mouseup', (e) => {
      if (isSiteDisabled()) return;
      clearTimeout(iconTimer);
      iconTimer = setTimeout(() => {
        const payload = selectionPayload(false);
        lastSelection = payload;
        if (!payload) {
          ui.hideIcon();
          return;
        }
        if (settings.autoTranslateSelection !== false) {
          ui.translateSelection(payload, {});
        } else if (settings.showSelectionIcon !== false) {
          ui.showIcon(payload.rect);
        }
      }, 150);
    });

    document.addEventListener('mousedown', () => ui.hideIcon());

    document.addEventListener('dblclick', (e) => {
      if (isSiteDisabled()) return;
      const payload = selectionPayload(false);
      if (!payload) return;
      ui.translateSelection(payload, {});
    });

    document.addEventListener('keydown', (e) => {
      // Esc 关闭双语（当 UI 面板与卡片都关闭时）
      if (e.key === 'Escape' && bil.records.length && !ui.state.panelOpen) {
        bil.restore();
        ui.setBilingualState(false);
        ui.toast('已还原原文');
      }
    });

    chrome.runtime.onMessage.addListener((msg, sender, reply) => {
      if (!msg || msg.type !== 'command') return;
      handleCommand(msg.command);
      reply && reply({ ok: true });
      return false;
    });

    if (chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener(async (changes, area) => {
        if (area === 'sync' && changes.settings) {
          await loadSettings();
          ui.refresh(settings);
        }
      });
    }
  }

  async function handleCommand(command) {
    if (isSiteDisabled()) return;
    if (command === 'translate-selection') {
      const payload = selectionPayload(true) || lastSelection;
      if (!payload) {
        ui.togglePanel();
        ui.toast('没有选中内容，已打开翻译面板');
        return;
      }
      await ui.translateSelection(payload, {});
    } else if (command === 'toggle-bilingual') {
      await toggleBilingual();
    } else if (command === 'toggle-panel') {
      ui.togglePanel();
    }
  }

  /* ---------------------------------------------------------------- 启动 */
  async function main() {
    await loadSettings();
    ui = new window.MarginUI({
      getSettings: () => settings,
      setSetting,
      translate: callTranslate,
      replaceSelection,
      onSettings: () => send({ type: 'openOptions' }),
      bilingual: toggleBilingual,
      onIconClick: async () => {
        const payload = selectionPayload(false) || lastSelection;
        if (payload) await ui.translateSelection(payload, {});
      }
    });
    bil = new window.MarginBilingual({
      translateBatch: async (texts) => {
        const res = await send({ type: 'translateBatch', texts, target: settings.targetLang, source: settings.sourceLang });
        return res && res.ok ? res.data : [];
      },
      onProgress: (done, total) => ui.showPageProgress(done, total)
    });
    bindEvents();
    ui.refresh(settings);
    window.__MARGIN__ = { ui, bil, getSettings: () => settings, toggleBilingual };
  }

  main();
})();
