/* Margin Translate UI 样式表：统一注入到 Shadow DOM，避免污染宿主页面样式 */
(function (root) {
  'use strict';

  const CSS = `
:host {
  all: initial;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", Roboto, sans-serif;
  color: var(--tz-fg);
}
:host([hidden]) { display: none; }

.tz-root {
  --tz-bg: #ffffff;
  --tz-bg-soft: #f6f7f9;
  --tz-fg: #1c1f26;
  --tz-muted: #6b7280;
  --tz-border: rgba(17, 24, 39, 0.1);
  --tz-accent: #4f5bd5;
  --tz-accent-soft: rgba(79, 91, 213, 0.12);
  --tz-danger: #d64545;
  --tz-shadow: 0 12px 32px rgba(15, 23, 42, 0.16), 0 2px 6px rgba(15, 23, 42, 0.08);
  --tz-radius: 14px;
  font-size: 14px;
  line-height: 1.6;
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 2147483000;
}

.tz-root[data-theme="dark"] {
  --tz-bg: #171a21;
  --tz-bg-soft: #20242d;
  --tz-fg: #e8eaf0;
  --tz-muted: #9aa3b2;
  --tz-border: rgba(255, 255, 255, 0.12);
  --tz-accent: #8b9bff;
  --tz-accent-soft: rgba(139, 155, 255, 0.18);
  --tz-shadow: 0 14px 36px rgba(0, 0, 0, 0.45);
}

.tz-card, .tz-panel {
  pointer-events: auto;
  background: var(--tz-bg);
  color: var(--tz-fg);
  border: 1px solid var(--tz-border);
  border-radius: var(--tz-radius);
  box-shadow: var(--tz-shadow);
  box-sizing: border-box;
}

/* ------------------------------------------------------------ 选区图标 */
.tz-icon {
  position: fixed;
  width: 30px;
  height: 30px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  background: var(--tz-bg);
  border: 1px solid var(--tz-border);
  box-shadow: var(--tz-shadow);
  pointer-events: auto;
  opacity: 0;
  transform: scale(0.85);
  transition: opacity .14s ease, transform .14s ease;
  user-select: none;
}
.tz-icon[data-show="true"] { opacity: 1; transform: scale(1); }
.tz-icon:hover { border-color: var(--tz-accent); }
.tz-icon svg { width: 17px; height: 17px; fill: var(--tz-accent); }

/* ------------------------------------------------------------ 划词卡片 */
.tz-card {
  position: fixed;
  width: 356px;
  max-width: calc(100vw - 24px);
  padding: 11px 13px 9px;
  overflow: hidden;
}
.tz-card[data-loading="true"] .tz-out { opacity: .55; }

.tz-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
.tz-row.tz-gap { justify-content: space-between; }
.tz-card-head { gap: 6px; }
.tz-card-head .tz-select { flex: 1; max-width: none; min-width: 0; }
.tz-title { font-size: 12px; color: var(--tz-muted); letter-spacing: .04em; }

.tz-actions { display: flex; align-items: center; gap: 2px; margin-left: auto; flex: 0 0 auto; }
.tz-actions .tz-btn { padding: 3px 6px; font-size: 11.5px; }
.tz-close { padding: 2px 7px; font-size: 13px; flex: 0 0 auto; }

.tz-select {
  appearance: none;
  background: var(--tz-bg-soft);
  color: var(--tz-fg);
  border: 1px solid var(--tz-border);
  border-radius: 8px;
  padding: 4px 22px 4px 8px;
  font-size: 12px;
  cursor: pointer;
  max-width: 130px;
  background-image: linear-gradient(45deg, transparent 50%, var(--tz-muted) 50%), linear-gradient(135deg, var(--tz-muted) 50%, transparent 50%);
  background-position: calc(100% - 13px) 52%, calc(100% - 9px) 52%;
  background-size: 4px 4px, 4px 4px;
  background-repeat: no-repeat;
}
.tz-select:focus-visible { outline: 2px solid var(--tz-accent-soft); }

.tz-btn {
  border: 1px solid var(--tz-border);
  background: var(--tz-bg-soft);
  color: var(--tz-fg);
  border-radius: 8px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  transition: background .12s ease, border-color .12s ease;
}
.tz-btn:hover { border-color: var(--tz-accent); color: var(--tz-accent); }
.tz-btn[disabled] { opacity: .5; cursor: default; }
.tz-btn.tz-primary { background: var(--tz-accent); border-color: var(--tz-accent); color: #fff; }
.tz-btn.tz-primary:hover { filter: brightness(1.06); color: #fff; }
.tz-btn.tz-ghost { background: transparent; border-color: transparent; }
.tz-btn.tz-ghost:hover { background: var(--tz-bg-soft); }

.tz-src, .tz-out {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--tz-muted);
  max-height: 132px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
}
.tz-src { border-bottom: 1px dashed var(--tz-border); padding-bottom: 8px; max-height: 92px; }
.tz-out { font-size: 14px; color: var(--tz-fg); min-height: 22px; }
.tz-out.tz-error { color: var(--tz-danger); font-size: 12.5px; }

.tz-meta {
  margin-top: 8px;
  padding-top: 6px;
  border-top: 1px solid var(--tz-border);
  font-size: 11px;
  color: var(--tz-muted);
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.tz-badge {
  background: var(--tz-accent-soft);
  color: var(--tz-accent);
  border-radius: 999px;
  padding: 1px 8px;
  font-size: 11px;
  white-space: nowrap;
  flex: 0 0 auto;
}
.tz-badge.tz-warn { background: rgba(214, 69, 69, .12); color: var(--tz-danger); }
.tz-spacer { flex: 1; }

.tz-progress { height: 3px; border-radius: 3px; background: var(--tz-border); overflow: hidden; margin-top: 8px; }
.tz-progress > i { display: block; height: 100%; background: var(--tz-accent); width: 0; transition: width .25s ease; }

/* -------------------------------------------------------------- 侧边面板 */
.tz-panel {
  position: fixed;
  top: 72px;
  width: 372px;
  max-width: calc(100vw - 24px);
  max-height: min(78vh, 720px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  right: 16px;
}
.tz-panel[data-side="left"] { left: 16px; right: auto; }

.tz-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--tz-border);
  background: var(--tz-bg-soft);
  cursor: move;
  user-select: none;
}
.tz-head .tz-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--tz-accent); }
.tz-head .tz-name { font-weight: 600; font-size: 13px; letter-spacing: .02em; }

.tz-body { padding: 10px; overflow: auto; display: flex; flex-direction: column; gap: 8px; }

.tz-input {
  width: 100%;
  min-height: 76px;
  resize: vertical;
  border-radius: 10px;
  border: 1px solid var(--tz-border);
  background: var(--tz-bg-soft);
  color: var(--tz-fg);
  padding: 10px;
  font: inherit;
  box-sizing: border-box;
}
.tz-input:focus-visible { outline: 2px solid var(--tz-accent-soft); border-color: var(--tz-accent); }

.tz-out-panel {
  border: 1px solid var(--tz-border);
  border-radius: 10px;
  padding: 10px;
  min-height: 76px;
  background: var(--tz-bg);
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 13.5px;
}
.tz-out-panel.tz-error { color: var(--tz-danger); font-size: 12.5px; }
.tz-out-panel:empty::before { content: "译文会显示在这里"; color: var(--tz-muted); }

.tz-foot {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 10px;
  border-top: 1px solid var(--tz-border);
  background: var(--tz-bg-soft);
  font-size: 11px;
  color: var(--tz-muted);
}

/* ---------------------------------------------------------------- toast */
.tz-toast {
  position: fixed;
  left: 50%;
  bottom: 28px;
  transform: translateX(-50%) translateY(8px);
  background: rgba(28, 31, 38, .92);
  color: #fff;
  padding: 7px 14px;
  border-radius: 999px;
  font-size: 12.5px;
  opacity: 0;
  pointer-events: none;
  transition: opacity .18s ease, transform .18s ease;
  z-index: 2147483001;
}
.tz-toast[data-show="true"] { opacity: 1; transform: translateX(-50%) translateY(0); }
`;

  root.MarginStyles = { CSS };
})(typeof globalThis !== 'undefined' ? globalThis : window);
