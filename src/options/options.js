/* Margin Translate · 页边译 —— 设置页 */
(function () {
  'use strict';

  const C = window.MarginConfig;
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  let meta = null;
  let settings = null;

  const send = (msg) =>
    new Promise((resolve) => {
      chrome.runtime.sendMessage(msg, (res) => {
        if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
        else resolve(res);
      });
    });

  let flashTimer = null;
  function flash(text) {
    const bar = $('#statusBar');
    bar.textContent = text;
    bar.classList.add('saving');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      bar.textContent = `设置已保存 · 已用 ${meta && meta.stats ? (meta.stats.chars || 0).toLocaleString() : 0} 字符`;
      bar.classList.remove('saving');
    }, 1600);
  }

  async function save(patchObj, tip) {
    Object.assign(settings, patchObj);
    await send({ type: 'setSettings', patch: patchObj });
    if (meta) await refreshStats();
    flash(tip || '已保存');
  }

  function engineRow(id) {
    return settings.engines.find((e) => e.id === id) || {};
  }

  /* ------------------------------------------------------------ 通用标签 */
  function fillLangSelects() {
    const langs = meta.languages || C.LANGUAGES;
    const s = $('#sourceLang');
    s.appendChild(new Option('自动检测', C.AUTO));
    langs.forEach((l) => {
      s.appendChild(new Option(`${l.zh} · ${l.en}`, l.code));
      $('#targetLang').appendChild(new Option(`${l.zh} · ${l.en}`, l.code));
    });
    s.value = settings.sourceLang || C.AUTO;
    $('#targetLang').value = settings.targetLang;
    s.addEventListener('change', (e) => save({ sourceLang: e.target.value }));
    $('#targetLang').addEventListener('change', (e) => save({ targetLang: e.target.value }));
  }

  function bindCheckboxes() {
    const map = {
      '#autoTranslateSelection': 'autoTranslateSelection',
      '#showSelectionIcon': 'showSelectionIcon',
      '#tts': 'tts',
      '#fallback': 'fallback',
      '#cacheEnabled': 'cacheEnabled'
    };
    Object.entries(map).forEach(([sel, key]) => {
      const node = $(sel);
      node.checked = settings[key] !== false;
      node.addEventListener('change', () => save({ [key]: node.checked }));
    });
  }

  function bindSelects() {
    $('#theme').value = settings.theme || 'auto';
    $('#theme').addEventListener('change', (e) => save({ theme: e.target.value }));
    $('#bilingualPosition').value = settings.bilingualPosition || 'below';
    $('#bilingualPosition').addEventListener('change', (e) => save({ bilingualPosition: e.target.value }));

    const limit = $('#textLenLimit');
    limit.value = settings.textLenLimit || 5000;
    $('#textLenLabel').textContent = `${limit.value} 字符`;
    limit.addEventListener('input', () => ($('#textLenLabel').textContent = `${limit.value} 字符`));
    limit.addEventListener('change', () => save({ textLenLimit: Number(limit.value) }));

    const hosts = $('#skipHosts');
    hosts.value = (settings.skipHosts || []).join('\n');
    hosts.addEventListener('change', () =>
      save({ skipHosts: hosts.value.split('\n').map((s) => s.trim()).filter(Boolean) }, '已在站点排除保存，刷新页面后生效')
    );
  }

  /* ------------------------------------------------------------ 引擎标签 */
  function renderEngines() {
    const list = $('#engineList');
    list.textContent = '';
    const ordered = settings.engineOrder.map((id) => meta.engines.find((e) => e.id === id)).filter(Boolean);

    ordered.forEach((engine, index) => {
      const row = engineRow(engine.id);
      const enabled = row.enabled !== false;
      const card = document.createElement('div');
      card.className = `engine${enabled ? '' : ' off'}`;

      const costLabel = { free: '免费额度', quota: '免费额度（需 Key）', paid: '按量付费', custom: '自定义' }[engine.cost] || engine.cost;

      const head = document.createElement('div');
      head.className = 'engine-head';
      head.innerHTML = `
        <span class="num">${index + 1}</span>
        <span class="engine-name"></span>
        <span class="engine-cost ${engine.cost}"></span>
        <span class="engine-actions"></span>
      `;
      head.querySelector('.engine-name').textContent = engine.name;
      head.querySelector('.engine-cost').textContent = costLabel;

      const actions = head.querySelector('.engine-actions');

      const up = document.createElement('button');
      up.className = 'btn';
      up.textContent = '↑';
      up.title = '提升优先级';
      up.addEventListener('click', () => moveEngine(engine.id, -1));
      actions.appendChild(up);

      const down = document.createElement('button');
      down.className = 'btn';
      down.textContent = '↓';
      down.title = '降低优先级';
      down.addEventListener('click', () => moveEngine(engine.id, 1));
      actions.appendChild(down);

      const toggle = document.createElement('button');
      toggle.className = 'btn';
      toggle.textContent = enabled ? '已启用' : '未启用';
      toggle.addEventListener('click', async () => {
        const next = row.enabled === false;
        settings.engines.find((e) => e.id === engine.id).enabled = next;
        await save({ engines: settings.engines });
        renderEngines();
      });
      actions.appendChild(toggle);

      const test = document.createElement('button');
      test.className = 'btn';
      test.textContent = '测试连通';
      test.addEventListener('click', async () => {
        const tip = $('.engine-test');
        test.disabled = true;
        card.querySelector('.engine-test').className = 'engine-test';
        card.querySelector('.engine-test').textContent = '正在测试…';
        const override = {};
        (engine.fields || []).forEach((f) => {
          override[f.key] = row[f.key] != null ? row[f.key] : engine.defaults[f.key] || '';
        });
        const res = await send({ type: 'testEngine', id: engine.id, override });
        const line = card.querySelector('.engine-test');
        if (res && res.ok && res.data && res.data.ok) {
          line.className = 'engine-test ok';
          line.textContent = `✓ 可用（${res.data.ms}ms）：${String(res.data.text).slice(0, 80)}`;
        } else {
          line.className = 'engine-test err';
          line.textContent = `✕ ${(res && res.error) || (res && res.data && res.data.error) || '测试失败'}`;
        }
        test.disabled = false;
        void tip;
      });
      actions.appendChild(test);

      card.appendChild(head);

      const doc = document.createElement('p');
      doc.className = 'engine-doc';
      doc.textContent = engine.doc || '';
      card.appendChild(doc);

      if ((engine.fields || []).length) {
        const fields = document.createElement('div');
        fields.className = 'engine-fields';
        engine.fields.forEach((f) => {
          const label = document.createElement('label');
          label.innerHTML = `<span></span>`;
          label.querySelector('span').textContent = f.label + (f.required ? ' *' : '');
          const input = document.createElement('input');
          input.type = f.type === 'secret' ? 'password' : 'text';
          input.placeholder = f.placeholder || '';
          input.value = row[f.key] != null ? row[f.key] : engine.defaults[f.key] || '';
          input.addEventListener('change', () => {
            const target = settings.engines.find((e) => e.id === engine.id);
            target[f.key] = input.value.trim();
            save({ engines: settings.engines }, `已保存 ${engine.name} 配置`);
          });
          label.appendChild(input);
          if (f.hint) {
            const small = document.createElement('small');
            small.className = 'tip';
            small.textContent = f.hint;
            label.appendChild(small);
          }
          fields.appendChild(label);
        });
        card.appendChild(fields);
      }

      const testLine = document.createElement('div');
      testLine.className = 'engine-test';
      card.appendChild(testLine);

      list.appendChild(card);
    });

    const enabledCount = settings.engines.filter((e) => e.enabled).length;
    $('#candidateHint').textContent = enabledCount
      ? `当前共启用 ${enabledCount} 个引擎，调用顺序如上；可在「翻译引擎」标签页调整顺序或关闭某个引擎。`
      : '尚未启用任何引擎，请先在「翻译引擎」标签页开启至少一个（推荐先开免费引擎）。';
  }

  async function moveEngine(id, delta) {
    const order = settings.engineOrder.slice();
    const i = order.indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    await save({ engineOrder: order });
    renderEngines();
  }

  /* ------------------------------------------------------------ 其它标签 */
  function renderShortcuts() {
    const ul = $('#shortcuts');
    ul.textContent = '';
    const labels = {
      'translate-selection': '翻译当前选中的文字',
      'toggle-bilingual': '开启 / 还原当前页双语对照',
      'toggle-panel': '打开 / 关闭翻译面板',
      _execute_action: '打开工具栏弹窗'
    };
    (meta.commands || []).forEach((cmd) => {
      const li = document.createElement('li');
      const kbd = document.createElement('kbd');
      kbd.textContent = cmd.shortcut || '未设置';
      const desc = document.createElement('span');
      desc.className = 'desc';
      desc.textContent = labels[cmd.name] || cmd.description || cmd.name;
      li.appendChild(kbd);
      li.appendChild(desc);
      ul.appendChild(li);
    });
  }

  function renderSupport() {
    const links = C.LINKS || {};
    const list = $('#donateLinks');
    list.textContent = '';
    const entries = [
      { key: 'afdian', label: '爱发电打赏', icon: '☕' },
      { key: 'githubSponsors', label: 'GitHub Sponsors', icon: '★' },
      { key: 'customDonate', label: '其它支持方式', icon: '♥' }
    ].filter((e) => links[e.key]);

    entries.forEach((e) => {
      const a = document.createElement('a');
      a.className = 'donate-btn';
      a.href = links[e.key];
      a.target = '_blank';
      a.rel = 'noreferrer';
      a.innerHTML = '<b></b><span></span>';
      a.querySelector('b').textContent = e.icon;
      a.querySelector('span').textContent = e.label;
      list.appendChild(a);
    });

    // 打赏引导文案：只有配置了打赏入口时才显示
    const note = $('#donateNote');
    const noteText = C.DONATE_NOTE || '';
    if (noteText && entries.length) {
      note.textContent = noteText;
      note.classList.remove('hidden');
    }

    const empty = $('#donateEmpty');
    if (!entries.length) {
      empty.classList.remove('hidden');
      empty.textContent =
        '打赏入口尚未配置：编辑 src/shared/config.js 里的 LINKS（afdian / githubSponsors / customDonate）填入你的收款链接，' +
        '或把收款码保存为 icons/donate-qr.png，重新加载扩展后这里就会显示。';
    }

    // 收款码：存在才展示，不存在自动隐藏（不显示裂图）
    const box = $('#qrBox');
    const img = $('#qrImg');
    const sync = () => box.classList.toggle('hidden', !(img.complete && img.naturalWidth > 0));
    img.addEventListener('load', sync);
    img.addEventListener('error', () => box.classList.add('hidden'));
    sync();

    $('#appVersion').textContent = 'v' + (chrome.runtime.getManifest ? chrome.runtime.getManifest().version : '-');
    $('#lnkPrivacy').href = links.privacy || '#';
    $('#lnkRepo').href = links.github || '#';
    $('#lnkIssues').href = links.issues || '#';
  }

  async function refreshStats() {
    const res = await send({ type: 'getMeta' });
    if (!res || !res.ok) return;
    const fresh = res.data;
    if (meta) meta.stats = fresh.stats; // 不替换 settings 引用，避免已渲染表单丢失上下文
    const s = fresh.stats || {};
    $('#heroStat').textContent = `累计请求 ${s.requests || 0} 次 · 字符 ${(s.chars || 0).toLocaleString()} · 失败 ${s.failures || 0}`;
    const top = Object.entries(s.byEngine || {})
      .sort((a, b) => b[1].requests - a[1].requests)
      .slice(0, 4)
      .map(([id, v]) => `${id}: ${v.requests} 次${v.failures ? `（失败 ${v.failures}）` : ''}`)
      .join(' · ');
    $('#statsLine').textContent = top ? `各引擎调用：${top}` : '暂无调用记录。';
    $('#statusBar').textContent = `就绪 · 已用 ${(s.chars || 0).toLocaleString()} 字符`;
  }

  /* ---------------------------------------------------------------- 启动 */
  async function init() {
    const res = await send({ type: 'getMeta' });
    if (!res || !res.ok) {
      $('#statusBar').textContent = '读取设置失败：' + (res && res.error);
      return;
    }
    meta = res.data;
    settings = meta.settings;

    $('#tabs').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-tab]');
      if (!btn) return;
      $$('#tabs button').forEach((b) => b.classList.toggle('active', b === btn));
      $$('.panel').forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== btn.dataset.tab));
    });

    fillLangSelects();
    bindCheckboxes();
    bindSelects();
    renderEngines();
    renderShortcuts();
    renderSupport();
    await refreshStats();

    $('#clearCache').addEventListener('click', async () => {
      await send({ type: 'clearCache' });
      flash('本地翻译缓存已清空');
    });
    $('#resetStats').addEventListener('click', async () => {
      await send({ type: 'resetStats' });
      await refreshStats();
      flash('统计已重置');
    });
    $('#openShortcuts').addEventListener('click', () => {
      chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
    });
  }

  init();
})();
