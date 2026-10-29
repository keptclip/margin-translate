/* Margin Translate · 页边译 —— 页内 UI（Shadow DOM 实现，样式与宿主页面完全隔离）
 * 提供：选区图标、划词翻译卡片、右侧翻译面板、Toast。
 */
(function (root) {
  'use strict';

  const { LANGUAGES, AUTO, langLabel, LANG_MAP, normalizeLang } = root.MarginConfig;
  const { CSS } = root.MarginStyles;

  /** 语言短名：「英语」而不是「英语 · English」，避免窄卡片里把按钮挤断行 */
  function langShort(code) {
    const row = LANG_MAP[code];
    return row ? row.zh : String(code || '').toUpperCase();
  }

  const ICON_TRANSLATE =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0014.07 6H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.24L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/></svg>';
  const ICON_COPY =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 1H4a2 2 0 00-2 2v14h2V3h12V1zm3 4H8a2 2 0 00-2 2v14a2 2 0 002 2h11a2 2 0 002-2V7a2 2 0 00-2-2zm0 16H8V7h11v14z"/></svg>';

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (k === 'class') node.className = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k === 'text') node.textContent = v;
        else if (k.startsWith('data') || ['role', 'title', 'aria-label'].includes(k)) node.setAttribute(k, v);
        else node[k] = v;
      }
    }
    (children || []).forEach((c) => node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return node;
  }

  function buildSelect(langs, value, onChange, includeAuto) {
    const opts = [];
    if (includeAuto) opts.push(el('option', { value: AUTO, text: '自动检测' }));
    langs.forEach((l) => opts.push(el('option', { value: l.code, text: `${l.zh} · ${l.en}` })));
    const sel = el('select', { class: 'tz-select' }, opts);
    sel.value = value || AUTO;
    sel.addEventListener('change', () => onChange(sel.value));
    sel.addEventListener('click', (e) => e.stopPropagation());
    return sel;
  }

  function speak(text, lang) {
    if (!text || !window.speechSynthesis) return false;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang || 'zh-CN';
      u.rate = 1;
      window.speechSynthesis.speak(u);
      return true;
    } catch (_) {
      return false;
    }
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        return ok;
      } catch (e) {
        return false;
      }
    }
  }

  class MarginUI {
    /**
     * @param {Object} hooks { translate, onSettings, onPanelToggle, getSettings, setSetting, bilingual, isEditable }
     */
    constructor(hooks) {
      this.hooks = hooks || {};
      this.state = { panelOpen: false, cardOpen: false, bilingualsOn: false };
      this.lastResult = null;
      this.#mount();
      this.#bindGlobalEvents();
    }

    /* ------------------------------------------------------------- 挂载 */
    #mount() {
      if (document.getElementById('margin-ui-host')) return;
      this.host = el('div', { id: 'margin-ui-host' });
      const sheet = document.createElement('style');
      sheet.textContent = CSS;
      this.shadow = this.host.attachShadow({ mode: 'open' });
      this.shadow.appendChild(sheet);

      this.root = el('div', { class: 'tz-root', 'data-theme': 'auto' });
      this.shadow.appendChild(this.root);

      // 选区图标
      this.icon = el('div', { class: 'tz-icon', html: ICON_TRANSLATE, title: '翻译所选内容' });
      this.icon.addEventListener('mousedown', (e) => e.preventDefault());
      this.icon.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.hideIcon();
        this.hooks.onIconClick && this.hooks.onIconClick();
      });
      this.root.appendChild(this.icon);

      // 划词卡片
      this.card = this.#buildCard();
      this.root.appendChild(this.card);

      // 侧边面板
      this.panel = this.#buildPanel();
      this.root.appendChild(this.panel);

      // toast
      this.toastNode = el('div', { class: 'tz-toast' });
      this.root.appendChild(this.toastNode);

      document.documentElement.appendChild(this.host);
      this.#applyTheme();
    }

    #buildCard() {
      const targetSel = buildSelect(LANGUAGES, this.settings().targetLang, async (v) => {
        await this.hooks.setSetting({ targetLang: v });
        if (this.lastQuery) this.translateSelection(this.lastQuery, { force: true });
      });
      const sourceBadge = el('span', { class: 'tz-badge', text: '检测中' });
      const outBox = el('div', { class: 'tz-out', text: '' });
      const srcBox = el('div', { class: 'tz-src' });
      const meta = el('div', { class: 'tz-meta' });

      // 头部只放「源语言 + 目标语言 + 关闭」，操作按钮统一沉到底部，避免窄卡片被挤断行
      const closeBtn = el('button', { class: 'tz-btn tz-ghost tz-close', text: '✕', title: '关闭 (Esc)' });
      const copyBtn = el('button', { class: 'tz-btn tz-ghost', text: '复制', title: '复制译文' });
      const speakBtn = el('button', { class: 'tz-btn tz-ghost', text: '朗读', title: '朗读译文' });
      const panelBtn = el('button', { class: 'tz-btn tz-ghost', text: '面板', title: '在面板中打开' });
      const actions = el('div', { class: 'tz-actions' }, [copyBtn, speakBtn, panelBtn]);

      const card = el('div', { class: 'tz-card' }, [
        el('div', { class: 'tz-row tz-card-head' }, [sourceBadge, targetSel, closeBtn]),
        srcBox,
        outBox,
        meta
      ]);
      copyBtn.addEventListener('click', async () => {
        if (!this.lastResult) return;
        const ok = await copyText(this.lastResult.text);
        this.toast(ok ? '已复制译文' : '复制失败，请手动选择');
      });
      speakBtn.addEventListener('click', () => {
        if (!this.lastResult) return;
        const ok = speak(this.lastResult.text, this.settings().targetLang);
        if (!ok) this.toast('当前环境不支持朗读');
      });
      panelBtn.addEventListener('click', () => {
        this.closeCard();
        this.openPanel({ text: this.lastQuery && this.lastQuery.text });
      });
      closeBtn.addEventListener('click', () => this.closeCard());

      this.cardRefs = { sourceBadge, targetSel, outBox, srcBox, meta, card, actions };
      return card;
    }

    #buildPanel() {
      const sourceSel = buildSelect(LANGUAGES, this.settings().sourceLang, (v) => this.hooks.setSetting({ sourceLang: v }), true);
      const targetSel = buildSelect(LANGUAGES, this.settings().targetLang, async (v) => {
        await this.hooks.setSetting({ targetLang: v });
        if (this.panelRefs.input.value.trim()) this.translateInput(true);
      });
      const input = el('textarea', { class: 'tz-input', placeholder: '输入要翻译的内容，⌘/Ctrl + Enter 立即翻译' });
      const out = el('div', { class: 'tz-out-panel' });
      const footMeta = el('div', { class: 'tz-meta' });

      const translateBtn = el('button', { class: 'tz-btn tz-primary', text: '翻译' });
      const bilBtn = el('button', { class: 'tz-btn', text: '双语对照' });
      const clearBtn = el('button', { class: 'tz-btn', text: '清空' });
      const copyBtn = el('button', { class: 'tz-btn', text: '复制' });
      const swapBtn = el('button', { class: 'tz-btn', text: '⇄', title: '交换源语言与目标语言' });

      translateBtn.addEventListener('click', () => this.translateInput(true));
      clearBtn.addEventListener('click', () => {
        input.value = '';
        out.textContent = '';
        input.focus();
      });
      copyBtn.addEventListener('click', async () => {
        const text = out.textContent.trim();
        if (!text) return;
        this.toast((await copyText(text)) ? '已复制译文' : '复制失败');
      });
      bilBtn.addEventListener('click', () => {
        this.hooks.bilingual && this.hooks.bilingual();
      });
      swapBtn.addEventListener('click', async () => {
        const s = this.settings();
        const next = { sourceLang: s.targetLang, targetLang: s.sourceLang === AUTO ? 'en' : s.sourceLang };
        await this.hooks.setSetting(next);
        sourceSel.value = next.sourceLang;
        targetSel.value = next.targetLang;
      });
      input.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
          e.preventDefault();
          this.translateInput(true);
        }
      });

      const head = el('div', { class: 'tz-head' }, [
        el('span', { class: 'tz-dot' }),
        el('span', { class: 'tz-name', text: 'Margin Translate · 页边译' }),
        el('span', { class: 'tz-spacer' }),
        bilBtn,
        el('button', { class: 'tz-btn tz-ghost', text: '设置' }),
        el('button', { class: 'tz-btn tz-ghost', text: '✕' })
      ]);
      const [settingsBtn, closeBtn] = head.querySelectorAll('.tz-ghost');
      settingsBtn.addEventListener('click', () => this.hooks.onSettings && this.hooks.onSettings());
      closeBtn.addEventListener('click', () => this.closePanel());

      const panel = el('div', { class: 'tz-panel' }, [
        head,
        el('div', { class: 'tz-body' }, [
          el('div', { class: 'tz-row tz-gap' }, [sourceSel, swapBtn, targetSel, translateBtn]),
          input,
          el('div', { class: 'tz-row' }, [out]),
          el('div', { class: 'tz-row' }, [copyBtn, clearBtn])
        ]),
        el('div', { class: 'tz-foot' }, [footMeta])
      ]);
      panel.style.display = 'none';

      this.panelRefs = { input, out, sourceSel, targetSel, footMeta, bilBtn, panel };
      this.#enableDrag(head, panel);
      return panel;
    }

    #enableDrag(handle, panel) {
      let dragging = false;
      let moved = false;
      let startX = 0;
      let startY = 0;
      let origin = null;
      handle.addEventListener('mousedown', (e) => {
        if (e.target.closest('button, select')) return;
        dragging = true;
        moved = false;
        startX = e.clientX;
        startY = e.clientY;
        const r = panel.getBoundingClientRect();
        origin = { top: r.top, left: r.left };
        e.preventDefault();
      });
      window.addEventListener('mousemove', (e) => {
        if (!dragging || !origin) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
        const left = Math.max(8, Math.min(window.innerWidth - panel.offsetWidth - 8, origin.left + dx));
        const top = Math.max(8, Math.min(window.innerHeight - 60, origin.top + dy));
        panel.style.top = `${top}px`;
        panel.style.left = `${left}px`;
        panel.style.right = 'auto';
      });
      window.addEventListener('mouseup', () => {
        if (dragging && moved) {
          const r = panel.getBoundingClientRect();
          this.hooks.setSetting({ panelPos: { top: Math.round(r.top), left: Math.round(r.left) } });
        }
        dragging = false;
        origin = null;
      });
    }

    #bindGlobalEvents() {
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          if (this.state.cardOpen) this.closeCard();
          else if (this.state.panelOpen) this.closePanel();
        }
      });
      window.addEventListener('mousedown', (e) => {
        if (!this.state.cardOpen) return;
        const path = e.composedPath ? e.composedPath() : [];
        if (path.includes(this.card) || path.includes(this.icon)) return;
        this.closeCard();
      });
      window.addEventListener('scroll', () => {
        if (this.state.cardOpen) this.closeCard();
        if (!this.state.panelOpen) return;
      }, true);
      window.addEventListener('resize', () => this.closeCard());
      window.addEventListener('blur', () => this.hideIcon());
    }

    /* ------------------------------------------------------------- 基础 */
    settings() {
      return (this.hooks.getSettings && this.hooks.getSettings()) || {};
    }

    #applyTheme() {
      const t = this.settings().theme || 'auto';
      let mode = t;
      if (t === 'auto') mode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      this.root.setAttribute('data-theme', mode);
    }

    refresh(settings) {
      if (!settings) return;
      this.#applyTheme();
      if (this.panelRefs) {
        this.panelRefs.sourceSel.value = settings.sourceLang || AUTO;
        this.panelRefs.targetSel.value = settings.targetLang;
      }
      if (this.cardRefs) this.cardRefs.targetSel.value = settings.targetLang;
    }

    toast(msg, ms = 1800) {
      this.toastNode.textContent = msg;
      this.toastNode.setAttribute('data-show', 'true');
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => this.toastNode.setAttribute('data-show', 'false'), ms);
    }

    /* --------------------------------------------------------- 选区图标 */
    showIcon(rect) {
      const pos = this.#iconPos(rect);
      this.icon.style.top = `${pos.top}px`;
      this.icon.style.left = `${pos.left}px`;
      this.icon.setAttribute('data-show', 'true');
    }

    #iconPos(rect) {
      const size = 30;
      const gap = 4;
      // 紧贴选区右下角；空间不够时翻到选区上方，最后再夹到视口内
      let left = Math.min(rect.right + gap, window.innerWidth - size - 8);
      let top = rect.bottom + gap;
      if (top + size > window.innerHeight - 8) {
        top = Math.max(8, rect.top - size - gap);
        if (top + size > rect.bottom) top = Math.max(8, Math.min(window.innerHeight - size - 8, rect.bottom + gap));
      }
      return { top: Math.max(8, top), left: Math.max(8, left) };
    }

    hideIcon() {
      if (this.icon) this.icon.setAttribute('data-show', 'false');
    }

    /* ------------------------------------------------------------- 卡片 */
    openCardAt(rect, placeholder) {
      this.card.style.display = 'block';
      this.state.cardOpen = true;
      this.cardRefs.outBox.classList.remove('tz-error');
      this.cardRefs.sourceBadge.textContent = '识别中';
      // 加载态也先把操作条摆好，避免卡片高度跳动
      this.cardRefs.meta.textContent = '';
      this.cardRefs.meta.appendChild(this.cardRefs.actions);
      if (placeholder) {
        this.cardRefs.outBox.textContent = '翻译中…';
        this.cardRefs.srcBox.textContent = placeholder.src || '';
      }
      this.#positionCard(rect);
    }

    #positionCard(rect) {
      const w = this.card.offsetWidth || 340;
      const h = this.card.offsetHeight || 180;
      let left = rect.left;
      let top = rect.bottom + 8;
      left = Math.max(8, Math.min(window.innerWidth - w - 8, left));
      if (top + h > window.innerHeight - 8) {
        top = Math.max(8, rect.top - h - 8);
      }
      this.card.style.left = `${left}px`;
      this.card.style.top = `${top}px`;
    }

    closeCard() {
      this.card.style.display = 'none';
      this.state.cardOpen = false;
      this.lastQuery = null;
    }

    async translateSelection(payload, opts) {
      const { text, rect, editable } = payload;
      this.lastQuery = payload;
      this.openCardAt(rect, { src: text });
      const res = await this.hooks.translate({ text, target: this.settings().targetLang, source: this.settings().sourceLang }, opts);
      this.renderCardResult(res, { editable });
      return res;
    }

    renderCardResult(res, extra) {
      const { outBox, sourceBadge, meta, targetSel, actions } = this.cardRefs;
      outBox.classList.toggle('tz-error', !res.ok);
      outBox.textContent = res.ok ? res.text : `翻译失败：${res.error || '未知错误'}`;
      targetSel.value = this.settings().targetLang;
      sourceBadge.textContent = res.ok && res.source && res.source !== 'auto' ? langShort(res.source) : '原文';
      sourceBadge.title = res.ok && res.source ? langLabel(res.source) : '';
      meta.textContent = '';
      if (res.ok) {
        const attempts = (res.attempts || []).filter((a) => a.error);
        meta.appendChild(el('span', { class: 'tz-badge', text: this.engineName(res.engine) }));
        if (res.cached) meta.appendChild(el('span', { class: 'tz-badge', text: '缓存' }));
        if (attempts.length) {
          meta.appendChild(
            el('span', {
              class: 'tz-badge tz-warn',
              text: `${attempts.map((a) => this.engineName(a.engine)).join('、')} 未命中`,
              title: attempts.map((a) => `${a.name}: ${a.error}`).join('\n')
            })
          );
        }
        if (extra && extra.editable) {
          const replaceBtn = el('button', { class: 'tz-btn', text: '替换' });
          replaceBtn.title = '用译文替换选中的原文';
          replaceBtn.addEventListener('click', () => this.hooks.replaceSelection && this.hooks.replaceSelection(res.text));
          meta.appendChild(el('span', { class: 'tz-spacer' }));
          meta.appendChild(replaceBtn);
        }
      } else {
        meta.appendChild(el('span', { class: 'tz-badge tz-warn', text: res.error || '翻译失败' }));
      }
      meta.appendChild(actions);
      this.lastResult = res.ok ? res : null;
      this.#positionCard(this.lastQuery && this.lastQuery.rect ? this.lastQuery.rect : { left: 40, top: 40, bottom: 40, right: 40 });
    }

    /* ------------------------------------------------------------- 面板 */
    openPanel(opts) {
      const o = opts || {};
      const pos = this.settings().panelPos;
      if (pos) {
        this.panel.style.top = `${pos.top}px`;
        this.panel.style.left = `${pos.left}px`;
        this.panel.style.right = 'auto';
      }
      this.panel.style.display = 'flex';
      this.state.panelOpen = true;
      this.panelRefs.sourceSel.value = this.settings().sourceLang || AUTO;
      this.panelRefs.targetSel.value = this.settings().targetLang;
      if (o.text) {
        this.panelRefs.input.value = o.text;
        if (o.auto !== false) this.translateInput(true);
      }
      setTimeout(() => this.panelRefs.input.focus(), 30);
    }

    togglePanel() {
      if (this.state.panelOpen) this.closePanel();
      else this.openPanel({});
    }

    closePanel() {
      this.panel.style.display = 'none';
      this.state.panelOpen = false;
    }

    setPanelBusy(busy) {
      this.panelRefs.input.style.opacity = busy ? '.7' : '1';
    }

    async translateInput(force) {
      const text = this.panelRefs.input.value.trim();
      if (!text) {
        this.toast('请输入要翻译的内容');
        return null;
      }
      this.setPanelBusy(true);
      const out = this.panelRefs.out;
      out.classList.remove('tz-error');
      if (!out.textContent || force) out.textContent = '翻译中…';
      const res = await this.hooks.translate({ text, target: this.settings().targetLang, source: this.settings().sourceLang }, { force });
      out.classList.toggle('tz-error', !res.ok);
      out.textContent = res.ok ? res.text : `翻译失败：${res.error || '未知错误'}`;
      this.#renderFoot(res);
      this.setPanelBusy(false);
      this.lastResult = res.ok ? res : null;
      return res;
    }

    #renderFoot(res) {
      const foot = this.panelRefs.footMeta;
      foot.textContent = '';
      if (res.ok) {
        foot.appendChild(el('span', { class: 'tz-badge', text: this.engineName(res.engine) }));
        foot.appendChild(el('span', { text: `${(res.text || '').length} 字符` }));
        if (res.cached) foot.appendChild(el('span', { class: 'tz-badge', text: '来自缓存' }));
      } else {
        foot.appendChild(el('span', { class: 'tz-badge tz-warn', text: res.error || '失败' }));
      }
    }

    setBilingualState(on) {
      this.state.bilingualsOn = on;
      if (this.panelRefs) this.panelRefs.bilBtn.textContent = on ? '还原原文' : '双语对照';
    }

    showPageProgress(done, total) {
      let wrap = this.shadow.getElementById('tz-page-progress');
      if (!wrap) {
        wrap = el('div', { class: 'tz-progress', id: 'tz-page-progress' });
        wrap.appendChild(el('i'));
        this.panelRefs.footMeta.appendChild(wrap);
      }
      if (done >= total) {
        setTimeout(() => wrap.remove(), 500);
      } else {
        wrap.querySelector('i').style.width = `${Math.round((done / Math.max(1, total)) * 100)}%`;
      }
    }

    engineName(id) {
      const map = {
        'google-free': 'Google 免费端点（实验性）',
        mymemory: 'MyMemory',
        libretranslate: 'LibreTranslate',
        baidu: '百度翻译',
        deepl: 'DeepL',
        azure: '微软 Translator',
        openai: 'AI 模型',
        custom: '自定义端点'
      };
      return map[id] || id || '未知';
    }
  }

  root.MarginUI = MarginUI;
  root.MarginUIHelpers = { el, copyText, speak, normalizeLang };
})(typeof globalThis !== 'undefined' ? globalThis : window);
