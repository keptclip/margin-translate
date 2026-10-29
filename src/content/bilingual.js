/* Margin Translate · 页边译 —— 页内双语对照
 * 不跳转页面、不整体替换 DOM：按块为单位在原文段落下方插入译文，随时可一键还原。
 */
(function (root) {
  'use strict';

  const { isTranslatable } = root.MarginConfig;

  const SKIP_TAGS = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'CODE', 'PRE', 'KBD', 'SAMP', 'OPTION', 'SELECT',
    'TEXTAREA', 'INPUT', 'BUTTON', 'SVG', 'MATH', 'CANVAS', 'IFRAME', 'OBJECT', 'AUDIO', 'VIDEO'
  ]);
  const BLOCK_TAGS = new Set([
    'P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TD', 'TH', 'TR', 'FIGCAPTION',
    'DD', 'DT', 'ARTICLE', 'SECTION', 'MAIN', 'HEADER', 'FOOTER', 'ASIDE', 'SUMMARY', 'LABEL', 'CAPTION'
  ]);

  const MAX_BLOCKS = 240;
  const BATCH_SIZE = 10;

  class MarginBilingual {
    constructor(hooks) {
      this.hooks = hooks || {};
      this.records = [];
      this.active = false;
      this.cancelled = false;
      this.mode = 'bilingual';
    }

    get running() {
      return this.active;
    }

    #visible(el) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) return false;
      // 只翻译当前视口及其附近的区域，避免一次性处理整页造成卡顿
      return true;
    }

    #blockFor(textNode) {
      let cur = textNode.parentElement;
      if (!cur) return null;
      while (cur && cur !== document.body) {
        if (BLOCK_TAGS.has(cur.tagName)) return cur;
        cur = cur.parentElement;
      }
      return textNode.parentElement || null;
    }

    /** 收集待翻译的块，视口内的块优先 */
    collect() {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          if (!isTranslatable(node.data)) return NodeFilter.FILTER_REJECT;
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          if (SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
          if (parent.closest('[data-margin-ignore], .margin-result-block, .margin-src-wrapper')) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });

      const groups = new Map();
      let node;
      while ((node = walker.nextNode())) {
        const block = this.#blockFor(node);
        if (!block || block === document.body) continue;
        if (block.querySelector('.margin-result-block')) continue; // 已翻译过
        if (!this.#visible(block)) continue;
        if (groups.has(block)) {
          groups.get(block).push(node);
        } else {
          groups.set(block, [node]);
        }
      }

      const list = [];
      const vh = window.innerHeight;
      for (const [block, nodes] of groups) {
        const text = this.#blockText(nodes);
        if (!isTranslatable(text) || text.length > 1200) continue;
        const rect = block.getBoundingClientRect();
        const inView = rect.top < vh * 1.5 && rect.bottom > -vh * 0.5;
        list.push({ block, nodes, text, sort: (inView ? 0 : 1e6) + Math.max(0, rect.top) });
      }
      list.sort((a, b) => a.sort - b.sort);
      return list.slice(0, MAX_BLOCKS);
    }

    #blockText(nodes) {
      const parts = [];
      let lastParent = null;
      for (const n of nodes) {
        const val = n.data.replace(/\s+/g, ' ');
        if (lastParent && n.parentElement === lastParent) {
          parts[parts.length - 1] += val;
        } else {
          parts.push(val);
          lastParent = n.parentElement;
        }
      }
      return parts.join(' ').trim();
    }

    #wrapOriginal(node) {
      const span = document.createElement('span');
      span.className = 'margin-src-wrapper';
      node.parentNode.insertBefore(span, node);
      span.appendChild(node);
      return span;
    }

    async start() {
      if (this.active) return { ok: false, error: '正在翻译中，请稍候' };
      const items = this.collect();
      if (!items.length) return { ok: false, error: '当前页面没有检测到可翻译的正文' };

      this.active = true;
      this.cancelled = false;
      let done = 0;
      let succeeded = 0;
      let failed = 0;

      for (let i = 0; i < items.length; i += BATCH_SIZE) {
        if (this.cancelled) break;
        const batch = items.slice(i, i + BATCH_SIZE);
        const texts = batch.map((b) => b.text);
        const results = (await this.hooks.translateBatch(texts)) || [];
        batch.forEach((item, idx) => {
          const r = results[idx] || { ok: false, error: 'no result' };
          if (!r.ok) {
            failed += 1;
          } else if (r.text && r.text.trim() && r.text.trim() !== item.text) {
            this.#render(item, r.text);
            succeeded += 1;
          } else {
            succeeded += 0; // 译文与原文一致（或源语言已等于目标语言）
          }
          done += 1;
        });
        this.hooks.onProgress && this.hooks.onProgress(done, items.length);
        await new Promise((r) => setTimeout(r, 20));
      }

      this.active = false;
      document.body.classList.toggle('margin-bilingual-only', this.mode === 'only');
      return { ok: succeeded > 0, total: items.length, succeeded, failed, cancelled: this.cancelled };
    }

    #render(item, text) {
      if (item.block.parentNode === null) return;
      const result = document.createElement('span');
      result.className = 'margin-result-block';
      result.textContent = text;
      const wrappers = item.nodes.map((n) => this.#wrapOriginal(n));
      item.block.appendChild(result);
      this.records.push({ result, wrappers });
    }

    /** 切换为「仅看译文」或「双语对照」 */
    setMode(mode) {
      this.mode = mode === 'only' ? 'only' : 'bilingual';
      document.body.classList.toggle('margin-bilingual-only', this.mode === 'only');
    }

    restore() {
      for (const rec of this.records) {
        if (rec.result && rec.result.parentNode) rec.result.remove();
        for (const w of rec.wrappers) {
          if (!w || !w.parentNode) continue;
          while (w.firstChild) w.parentNode.insertBefore(w.firstChild, w);
          w.remove();
        }
      }
      this.records = [];
      document.body.classList.remove('margin-bilingual-only');
      this.active = false;
      this.cancelled = true;
    }
  }

  root.MarginBilingual = MarginBilingual;
})(typeof globalThis !== 'undefined' ? globalThis : window);
