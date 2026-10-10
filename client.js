/**
 * Browser half of `dsh-term-glossary`.
 *
 * Registers one entry in the frame-wide `shell.overlay` slot: it watches the
 * page text selection, offers a small "解释" pill beside the selected term, and
 * opens a compact follow-up box anchored to that selection. Answers come from
 * the package's Host half over `/api/term-glossary/explain`.
 *
 * Hand-written `__ModuleLoader__` shell: plain JavaScript, no JSX, no imports;
 * React arrives through the module table.
 */
window.__ModuleLoader__.load({
  id: 'dsh-term-glossary',
  factory: (require) => {
    'use strict';

    const module = { exports: {} };
    const exports = module.exports;

    const React = require('react');
    const { useCallback, useEffect, useRef, useState } = React;
    const h = React.createElement;

    const API_PATH = '/api/term-glossary/explain';
    const PLUGIN_ID = 'dsh-term-glossary';
    const LOCALE_NS = 'term-glossary';
    const MAX_TERM_CHARS = 120;
    const PANEL_WIDTH = 360;
    const PANEL_MAX_HEIGHT = 460;

    const MESSAGES = {
      en: {
        explain: 'Explain',
        title: 'Term look-up',
        placeholder: 'Follow-up question… (Enter to send)',
        send: 'Send',
        thinking: 'Thinking…',
        close: 'Close',
        initial: 'Explain this term:',
        hint: 'Select a term in the conversation',
        empty: 'Ask a follow-up below.',
        noAnswer: 'No answer returned',
        truncated: 'The answer reached the length limit — ask a follow-up to continue.',
      },
      zh: {
        explain: '解释',
        title: '术语速查',
        placeholder: '追问…（回车发送）',
        send: '发送',
        thinking: '思考中…',
        close: '关闭',
        initial: '请解释术语：',
        hint: '在对话中选中一个术语',
        empty: '可以在下面继续追问。',
        noAnswer: '没有返回内容',
        truncated: '回答达到长度上限，可以继续追问。',
      },
    };

    const CSS = [
      '[data-term-glossary]{--tg-radius:10px;font-size:13px;line-height:1.6;}',
      '.tg-pill{position:fixed;pointer-events:auto;display:inline-flex;align-items:center;gap:4px;',
      'padding:5px 10px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);',
      'background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);cursor:pointer;',
      'font:inherit;font-size:12px;box-shadow:0 6px 18px rgba(0,0,0,.18);}',
      '.tg-pill:hover{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary);}',
      '.tg-panel{position:fixed;pointer-events:auto;display:flex;flex-direction:column;overflow:hidden;',
      'border-radius:var(--tg-radius);border:1px solid var(--dsw-alias-border-l1);',
      'background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);',
      'box-shadow:0 14px 40px rgba(0,0,0,.22);}',
      '.tg-head{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);}',
      '.tg-term{flex:1;min-width:0;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.tg-badge{font-size:11px;font-weight:400;color:var(--dsw-alias-label-secondary);}',
      '.tg-icon{pointer-events:auto;border:0;background:transparent;color:var(--dsw-alias-label-secondary);',
      'cursor:pointer;font:inherit;font-size:15px;line-height:1;padding:2px 4px;border-radius:6px;}',
      '.tg-icon:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);}',
      '.tg-body{flex:1;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:8px;}',
      '.tg-msg-ask{align-self:flex-end;max-width:88%;padding:6px 9px;border-radius:9px;',
      'background:var(--dsw-alias-bg-layer-2);white-space:pre-wrap;word-break:break-word;}',
      '.tg-msg-answer{align-self:stretch;word-break:break-word;}',
      '.tg-p{margin:0 0 6px;}',
      '.tg-p:last-child{margin-bottom:0;}',
      '.tg-h{font-weight:600;margin:2px 0 6px;}',
      '.tg-quote{margin:0 0 6px;padding-left:8px;border-left:2px solid var(--dsw-alias-border-l2);',
      'color:var(--dsw-alias-label-secondary);}',
      '.tg-ul{margin:0 0 6px;padding-left:18px;}',
      '.tg-ul li{margin:2px 0;}',
      '.tg-pre{margin:0 0 6px;padding:8px;border-radius:8px;overflow-x:auto;',
      'background:var(--dsw-alias-bg-layer-2);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;}',
      '.tg-code{padding:1px 4px;border-radius:5px;background:var(--dsw-alias-bg-layer-2);',
      'font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;}',
      '.tg-status{padding:0 10px 8px;color:var(--dsw-alias-label-secondary);font-size:12px;}',
      '.tg-error{padding:0 10px 8px;color:var(--dsw-alias-state-error-primary);font-size:12px;word-break:break-word;}',
      '.tg-foot{display:flex;gap:6px;align-items:flex-end;padding:8px 10px;border-top:1px solid var(--dsw-alias-border-l1);}',
      '.tg-input{flex:1;min-width:0;resize:none;max-height:96px;padding:6px 8px;border-radius:8px;',
      'border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);',
      'color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;outline:none;}',
      '.tg-input:focus{border-color:var(--dsw-alias-brand-primary);}',
      '.tg-send{pointer-events:auto;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;',
      'background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-overlay);cursor:pointer;',
      'font:inherit;font-size:12px;padding:6px 10px;}',
      '.tg-send:disabled{opacity:.5;cursor:default;}',
      '.tg-spin{display:inline-block;width:10px;height:10px;margin-right:6px;vertical-align:-1px;',
      'border:2px solid var(--dsw-alias-border-l2);border-top-color:var(--dsw-alias-brand-primary);',
      'border-radius:50%;animation:tg-spin .8s linear infinite;}',
      '@keyframes tg-spin{to{transform:rotate(360deg);}}',
    ].join('');

    let hostLocale;
    let hostTranslate;

    /** Adopt the host Language setting when the Client locale service is present. */
    function attachHostLocale(ctx) {
      hostLocale = typeof ctx?.get === 'function' ? ctx.get('locale') : undefined;
      if (!hostLocale || typeof hostLocale.register !== 'function' || typeof hostLocale.bind !== 'function') return;
      try {
        const dispose = hostLocale.register(LOCALE_NS, MESSAGES);
        ctx.effect?.(() => dispose, 'term-glossary: locale dictionaries');
      } catch {
        /* a twin instance may already own the namespace; bind still resolves ours */
      }
      try {
        const bound = hostLocale.bind(LOCALE_NS);
        if (bound('explain') !== 'explain') hostTranslate = bound;
      } catch {
        /* keep the built-in table */
      }
    }

    function activeLocale() {
      let active;
      try {
        active = hostLocale?.getLocale?.()?.active ?? hostLocale?.getSnapshot?.()?.active;
      } catch {
        /* service teardown: fall back to the browser */
      }
      const raw = String(active || window?.navigator?.language || '');
      return /^zh(?:-|$)/i.test(raw) ? 'zh' : 'en';
    }

    function t(key) {
      if (hostTranslate) {
        try {
          return hostTranslate(key);
        } catch {
          /* fall through */
        }
      }
      const table = MESSAGES[activeLocale()] || MESSAGES.en;
      return table[key] ?? MESSAGES.en[key] ?? key;
    }

    /** ── minimal Markdown rendering (self-contained) ─────────────────────── */

    function renderInline(text, prefix) {
      const parts = [];
      const re = /`([^`]+)`|\*\*([^*]+)\*\*/g;
      let last = 0;
      let match;
      let i = 0;
      while ((match = re.exec(text)) !== null) {
        if (match.index > last) parts.push(text.slice(last, match.index));
        if (match[1] !== undefined) {
          parts.push(h('code', { key: `${prefix}-c${i++}`, className: 'tg-code' }, match[1]));
        } else {
          parts.push(h('strong', { key: `${prefix}-b${i++}` }, match[2]));
        }
        last = match.index + match[0].length;
      }
      if (last < text.length) parts.push(text.slice(last));
      return parts;
    }

    function renderRich(text) {
      const blocks = [];
      let list = null;
      let fence = null;
      const flushList = () => {
        if (list) {
          blocks.push(h('ul', { key: `ul${blocks.length}`, className: 'tg-ul' }, list));
          list = null;
        }
      };
      for (const line of String(text ?? '').split('\n')) {
        if (line.trim().startsWith('```')) {
          if (fence) {
            blocks.push(h('pre', { key: `pre${blocks.length}`, className: 'tg-pre' }, fence.join('\n')));
            fence = null;
          } else {
            flushList();
            fence = [];
          }
          continue;
        }
        if (fence) {
          fence.push(line);
          continue;
        }
        const bullet = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line);
        if (bullet) {
          if (!list) list = [];
          list.push(h('li', { key: `li${list.length}` }, renderInline(bullet[1], 'li')));
          continue;
        }
        flushList();
        if (line.trim() === '') continue;
        const quote = /^\s*>\s?(.*)$/.exec(line);
        if (quote) {
          blocks.push(h('div', { key: `q${blocks.length}`, className: 'tg-quote' }, renderInline(quote[1], 'q')));
          continue;
        }
        const heading = /^#{1,6}\s+(.*)$/.exec(line);
        if (heading) {
          blocks.push(h('div', { key: `hd${blocks.length}`, className: 'tg-h' }, renderInline(heading[1], 'hd')));
          continue;
        }
        blocks.push(h('p', { key: `p${blocks.length}`, className: 'tg-p' }, renderInline(line, 'p')));
      }
      flushList();
      if (fence) blocks.push(h('pre', { key: `pre${blocks.length}`, className: 'tg-pre' }, fence.join('\n')));
      return blocks;
    }

    /** ── selection tracking ──────────────────────────────────────────────── */

    function elementOf(node) {
      if (!node) return null;
      return node.nodeType === 1 ? node : node.parentElement ?? null;
    }

    /** The sentence around the selected term, for a little grounding. */
    function contextAround(element, term) {
      try {
        const text = String(element.textContent ?? '').replace(/\s+/gu, ' ').trim();
        const at = text.indexOf(term);
        if (at < 0) return text.slice(0, 240);
        const from = Math.max(0, at - 120);
        const to = Math.min(text.length, at + term.length + 120);
        return `${from > 0 ? '…' : ''}${text.slice(from, to)}${to < text.length ? '…' : ''}`;
      } catch {
        return '';
      }
    }

    function readSelection() {
      const selection = window.getSelection?.();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
      const raw = selection.toString();
      if (typeof raw !== 'string') return null;
      const term = raw.replace(/\s+/gu, ' ').trim();
      if (term === '' || term.length > MAX_TERM_CHARS) return null;
      const range = selection.getRangeAt(0);
      const element = elementOf(range.startContainer);
      if (!element) return null;
      if (element.closest?.('[data-term-glossary]')) return null;
      if (element.closest?.('input, textarea, [contenteditable="true"]')) return null;
      const rect = range.getBoundingClientRect();
      if (!rect || (rect.width === 0 && rect.height === 0)) return null;
      return {
        term,
        context: contextAround(element.closest?.('p, li, pre, td, div') ?? element, term),
        rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
      };
    }

    function clampPanel(rect) {
      const width = Math.min(PANEL_WIDTH, Math.max(240, window.innerWidth - 24));
      const left = Math.min(Math.max(12, rect.left), Math.max(12, window.innerWidth - width - 12));
      let top = rect.bottom + 8;
      if (top + PANEL_MAX_HEIGHT > window.innerHeight - 12) {
        top = Math.max(12, rect.top - Math.min(PANEL_MAX_HEIGHT, 320) - 8);
      }
      return { left, top, width };
    }

    /** ── the overlay entry ───────────────────────────────────────────────── */

    /**
     * Which Session the main conversation view is currently showing, read
     * through the slot owner's `useSessions` selector hook. The Host half uses
     * this id to pull a little of that conversation as domain evidence.
     */
    function selectMainSessionId(state) {
      try {
        const sessions = state?.byId ?? {};
        for (const key of Object.keys(sessions)) {
          const session = sessions[key];
          if ((session?.retainedBy?.mainView ?? 0) > 0) return session?.id ?? key;
        }
      } catch {
        /* the store shape changed: answer without a session clue */
      }
      return undefined;
    }

    /** Hook-position fallback for a composition whose owner passes no selector. */
    function useNoSession() {
      return undefined;
    }

    function GlossaryOverlay(props) {
      // Called unconditionally so the hook order stays stable for this entry.
      const useSessions = typeof props?.useSessions === 'function' ? props.useSessions : useNoSession;
      const sessionId = useSessions(selectMainSessionId);

      const [picked, setPicked] = useState(null);
      const [open, setOpen] = useState(false);
      const [turns, setTurns] = useState([]);
      const [busy, setBusy] = useState(false);
      const [error, setError] = useState(null);
      const [draft, setDraft] = useState('');

      const panelRef = useRef(null);
      const inputRef = useRef(null);
      const pickedRef = useRef(null);
      const sessionRef = useRef(sessionId);
      const turnsRef = useRef([]);
      const busyRef = useRef(false);
      const signatureRef = useRef('');

      pickedRef.current = picked;
      sessionRef.current = sessionId;
      turnsRef.current = turns;
      busyRef.current = busy;

      // Track the page selection: a small pill appears beside the selected term.
      useEffect(() => {
        let timer = 0;
        const schedule = () => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => {
            timer = 0;
            const next = readSelection();
            const signature = next ? `${next.term}|${Math.round(next.rect.left)},${Math.round(next.rect.top)}` : '';
            if (signature === signatureRef.current) return;
            signatureRef.current = signature;
            setPicked(next);
          }, 20);
        };
        document.addEventListener('mouseup', schedule, true);
        document.addEventListener('keyup', schedule, true);
        document.addEventListener('selectionchange', schedule);
        return () => {
          if (timer) clearTimeout(timer);
          document.removeEventListener('mouseup', schedule, true);
          document.removeEventListener('keyup', schedule, true);
          document.removeEventListener('selectionchange', schedule);
        };
      }, []);

      const close = useCallback(() => {
        setOpen(false);
        setTurns([]);
        setError(null);
        setDraft('');
        signatureRef.current = '';
        setPicked(null);
      }, []);

      // Escape closes; a click outside the panel closes.
      useEffect(() => {
        if (!open) return undefined;
        const onKeyDown = (event) => {
          if (event.key === 'Escape') close();
        };
        const onPointerDown = (event) => {
          const panel = panelRef.current;
          if (panel && event.target instanceof Node && !panel.contains(event.target)) close();
        };
        document.addEventListener('keydown', onKeyDown, true);
        document.addEventListener('mousedown', onPointerDown, true);
        return () => {
          document.removeEventListener('keydown', onKeyDown, true);
          document.removeEventListener('mousedown', onPointerDown, true);
        };
      }, [open, close]);

      const ask = useCallback(async (question) => {
        const current = pickedRef.current;
        if (!current) return;
        const history = turnsRef.current.map((turn) => ({ role: turn.role, text: turn.text }));
        if (question) setTurns((prev) => [...prev, { role: 'user', text: question }]);
        setBusy(true);
        setError(null);
        try {
          const response = await fetch(API_PATH, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-dsh-plugin': PLUGIN_ID },
            body: JSON.stringify({
              term: current.term,
              context: current.context,
              question: question || undefined,
              sessionId: sessionRef.current || undefined,
              history,
            }),
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok || payload?.ok === false) {
            throw new Error(payload?.error?.message || `HTTP ${response.status}`);
          }
          const answer = String(payload?.data?.answer ?? '').trim();
          const truncated = payload?.data?.truncated === true;
          let shown = answer || t('noAnswer');
          if (truncated && answer !== '') shown = `${shown}\n\n_${t('truncated')}_`;
          setTurns((prev) => [...prev, { role: 'assistant', text: shown }]);
        } catch (failure) {
          setError(String(failure?.message ?? failure));
        } finally {
          setBusy(false);
        }
      }, []);

      const openPanel = useCallback(() => {
        setOpen(true);
        setTurns([]);
        setError(null);
        setDraft('');
        void ask(null);
      }, [ask]);

      const submit = useCallback(() => {
        const question = draft.trim();
        if (question === '' || busyRef.current) return;
        setDraft('');
        void ask(question);
      }, [draft, ask]);

      useEffect(() => {
        if (open && inputRef.current) inputRef.current.focus();
      }, [open]);

      const panel = open && picked ? clampPanel(picked.rect) : null;

      return h(
        'div',
        { 'data-term-glossary': 'root', style: { position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 60 } },
        h('style', null, CSS),
        !open && picked
          ? h(
              'button',
              {
                type: 'button',
                className: 'tg-pill',
                title: `${t('explain')}: ${picked.term}`,
                style: {
                  left: `${Math.min(picked.rect.right + 6, Math.max(12, window.innerWidth - 96))}px`,
                  top: `${Math.min(picked.rect.bottom + 6, Math.max(12, window.innerHeight - 40))}px`,
                },
                onMouseDown: (event) => event.preventDefault(),
                onClick: openPanel,
              },
              t('explain'),
            )
          : null,
        open && picked && panel
          ? h(
              'div',
              {
                ref: panelRef,
                className: 'tg-panel',
                role: 'dialog',
                'aria-label': t('title'),
                style: { left: `${panel.left}px`, top: `${panel.top}px`, width: `${panel.width}px`, maxHeight: `${PANEL_MAX_HEIGHT}px` },
              },
              h(
                'div',
                { className: 'tg-head' },
                h('span', { className: 'tg-term', title: picked.term }, picked.term),
                h('span', { className: 'tg-badge' }, t('title')),
                h('button', { type: 'button', className: 'tg-icon', 'aria-label': t('close'), onClick: close }, '×'),
              ),
              h(
                'div',
                { className: 'tg-body' },
                turns.length === 0 && !busy ? h('div', { className: 'tg-msg-answer' }, t('empty')) : null,
                turns.map((turn, index) =>
                  turn.role === 'user'
                    ? h('div', { key: `t${index}`, className: 'tg-msg-ask' }, turn.text)
                    : h('div', { key: `t${index}`, className: 'tg-msg-answer' }, renderRich(turn.text)),
                ),
              ),
              busy ? h('div', { className: 'tg-status' }, h('span', { className: 'tg-spin' }), t('thinking')) : null,
              error ? h('div', { className: 'tg-error' }, error) : null,
              h(
                'div',
                { className: 'tg-foot' },
                h('textarea', {
                  ref: inputRef,
                  className: 'tg-input',
                  rows: 1,
                  value: draft,
                  placeholder: t('placeholder'),
                  'aria-label': t('placeholder'),
                  onChange: (event) => setDraft(event.target.value),
                  onKeyDown: (event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      submit();
                    }
                  },
                }),
                h(
                  'button',
                  { type: 'button', className: 'tg-send', disabled: busy || draft.trim() === '', onClick: submit },
                  t('send'),
                ),
              ),
            )
          : null,
      );
    }

    /** Plugin body: one overlay entry, disposed with the Client run. */
    function apply(ctx) {
      attachHostLocale(ctx);
      ctx.slots.inject('shell.overlay', () =>
        ctx.slots.register({ name: 'shell.overlay', id: 'term-glossary', order: 40 }, GlossaryOverlay),
      );
    }

    exports.apply = apply;
    exports.inject = ['slots'];

    return module.exports;
  },
});
