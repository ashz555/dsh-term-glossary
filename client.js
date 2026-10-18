/**
 * Browser half of `dsh-term-glossary`.
 *
 * Registers one entry in the frame-wide `shell.overlay` slot. Selecting text
 * only offers a trigger button; pressing it opens the explanation box, which
 * then STAYS open until it is dismissed (Esc, ×, or a click outside). While the
 * answer is on its way the box shows its progress, and when the answer lands
 * the box also reports how many tokens that answer cost.
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
    const PANEL_WIDTH = 380;
    const PANEL_MAX_HEIGHT = 480;

    const MESSAGES = {
      en: {
        title: 'Term look-up',
        thinking: 'Thinking…',
        close: 'Close',
        explain: 'Search',
        noAnswer: 'No answer returned',
        truncated: 'The answer reached the length limit.',
        usage: 'tokens',
        input: 'in',
        output: 'out',
        total: 'total',
      },
      zh: {
        title: '术语速查',
        thinking: '正在思考…',
        close: '关闭',
        explain: '搜索',
        noAnswer: '没有返回内容',
        truncated: '回答达到长度上限。',
        usage: 'token',
        input: '输入',
        output: '输出',
        total: '合计',
      },
    };

    const CSS = [
      '[data-term-glossary]{--tg-radius:10px;font-size:13px;line-height:1.6;}',
      // The trigger button follows the live selection; the box below does not.
      '.tg-pill{position:fixed;pointer-events:auto;display:inline-flex;align-items:center;gap:4px;',
      'padding:5px 11px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);',
      'background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);cursor:pointer;',
      'font:inherit;font-size:12px;box-shadow:0 6px 18px rgba(0,0,0,.18);}',
      '.tg-pill:hover{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary);}',
      '.tg-pill:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px;}',
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
      '.tg-body{flex:1;overflow-y:auto;padding:10px;word-break:break-word;}',
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
      '.tg-thinking{display:flex;align-items:center;color:var(--dsw-alias-label-secondary);font-size:12px;}',
      '.tg-truncated{margin-top:6px;color:var(--dsw-alias-state-warn-primary);font-size:12px;}',
      '.tg-error{color:var(--dsw-alias-state-error-primary);font-size:12px;word-break:break-word;}',
      '.tg-foot{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:6px 10px;',
      'border-top:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);font-size:11px;}',
      '.tg-usage{font-variant-numeric:tabular-nums;}',
      '.tg-model{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.tg-spin{display:inline-block;width:10px;height:10px;margin-right:6px;flex:none;',
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
        if (bound('thinking') !== 'thinking') hostTranslate = bound;
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
          parts.push(h('strong', { key: `${prefix}-b${i++}`, }, match[2]));
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

    /** ── selection and placement ─────────────────────────────────────────── */

    function elementOf(node) {
      if (!node) return null;
      return node.nodeType === 1 ? node : node.parentElement ?? null;
    }

    /** The sentence around the selected term, for a little grounding. */
    function contextAround(element, term) {
      try {
        // A conversation node can hold megabytes of text; running a regex over
        // all of it on every selection change would stall the page. Only the
        // neighbourhood of the selection is ever used, so slice it out first.
        const raw = String(element.textContent ?? '');
        const hit = term === '' ? -1 : raw.indexOf(term);
        const start = hit < 0 ? 0 : Math.max(0, hit - 240);
        const text = raw.slice(start, start + 1400).replace(/\s+/gu, ' ').trim();
        if (text === '') return '';
        const at = term === '' ? -1 : text.indexOf(term);
        if (at < 0) return text.slice(0, 240);
        const from = Math.max(0, at - 120);
        const to = Math.min(text.length, at + term.length + 120);
        return `${from > 0 ? '…' : ''}${text.slice(from, to)}${to < text.length ? '…' : ''}`;
      } catch {
        return '';
      }
    }

    /** Read the current page selection, or null when it is not a usable term. */
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

    /** How many tokens that answer cost, plus the route that produced it. */
    function usageLine(answer) {
      const usage = answer?.usage;
      if (!usage) return null;
      const input = Number(usage.inputTokens) || 0;
      const output = Number(usage.outputTokens) || 0;
      const total = Number(usage.totalTokens) || input + output;
      // Order matters for readability: the provider's total counts the cached
      // input too, so input + cache + output is what adds up to the total.
      const parts = [`${t('input')} ${input}`];
      if (Number(usage.cacheReadTokens) > 0) parts.push(`cache ${usage.cacheReadTokens}`);
      parts.push(`${t('output')} ${output}`, `${t('total')} ${total}`);
      return h(
        'div',
        { className: 'tg-foot' },
        h('span', { className: 'tg-usage' }, `${t('usage')}：${parts.join(' · ')}`),
        answer?.model
          ? h(
              'span',
              { className: 'tg-model', title: `${answer.model.provider}/${answer.model.model}` },
              `${answer.model.provider}/${answer.model.model}`,
            )
          : null,
      );
    }

    function GlossaryOverlay(props) {
      // Called unconditionally so the hook order stays stable for this entry.
      const useSessions = typeof props?.useSessions === 'function' ? props.useSessions : useNoSession;
      const sessionId = useSessions(selectMainSessionId);

      // Two independent pieces of state, on purpose:
      //  - `picked` follows the LIVE page selection and only drives the trigger
      //    button. It is allowed to disappear when the selection collapses.
      //  - `entry` is the open box. It is deliberately NOT cleared by a
      //    collapsing selection: clicking inside the box collapses the
      //    selection, and clearing it on that event would make the box flash
      //    away and its controls unclickable.
      const [picked, setPicked] = useState(null);
      const [entry, setEntry] = useState(null);
      const [answer, setAnswer] = useState(null);
      const [busy, setBusy] = useState(false);
      const [error, setError] = useState(null);

      const panelRef = useRef(null);
      const entryRef = useRef(null);
      const sessionRef = useRef(sessionId);
      const requestRef = useRef(null);
      const signatureRef = useRef('');
      // A press on the button may collapse the selection right before the click
      // lands; hold `picked` briefly so the button cannot unmount mid-click.
      const buttonGuardRef = useRef(0);

      entryRef.current = entry;
      sessionRef.current = sessionId;

      const request = useCallback(async (target) => {
        const previous = requestRef.current;
        if (previous?.controller?.abort) previous.controller.abort();
        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        requestRef.current = { controller };

        setBusy(true);
        setAnswer(null);
        setError(null);
        try {
          const response = await fetch(API_PATH, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-dsh-plugin': PLUGIN_ID },
            body: JSON.stringify({
              term: target.term,
              context: target.context,
              sessionId: sessionRef.current || undefined,
            }),
            signal: controller ? controller.signal : undefined,
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok || payload?.ok === false) {
            throw new Error(payload?.error?.message || `HTTP ${response.status}`);
          }
          setAnswer({
            text: String(payload?.data?.answer ?? '').trim() || t('noAnswer'),
            truncated: payload?.data?.truncated === true,
            usage: payload?.data?.usage,
            model: payload?.data?.model,
          });
        } catch (failure) {
          if (failure?.name !== 'AbortError') setError(String(failure?.message ?? failure));
        } finally {
          if (requestRef.current?.controller === controller) {
            requestRef.current = null;
            setBusy(false);
          }
        }
      }, []);

      const close = useCallback(() => {
        if (requestRef.current?.controller?.abort) requestRef.current.controller.abort();
        requestRef.current = null;
        setEntry(null);
        setAnswer(null);
        setError(null);
        setBusy(false);
      }, []);

      /** The reader pressed the button: open the box for that term and search. */
      const openPanel = useCallback(
        (target) => {
          setPicked(null);
          setEntry(target);
          void request(target);
        },
        [request],
      );

      // Selecting text only offers the button; it does not search on its own.
      useEffect(() => {
        let timer = 0;
        const schedule = () => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => {
            timer = 0;
            const next = readSelection();
            if (next === null && Date.now() < buttonGuardRef.current) return;
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

      // Escape closes; a click outside the box closes.
      useEffect(() => {
        if (!entry) return undefined;
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
      }, [entry, close]);

      const placement = entry ? clampPanel(entry.rect) : null;
      // The button follows the live selection, unless the open box already
      // answers exactly that term.
      const showButton = picked !== null && (entry === null || entry.term !== picked.term);

      return h(
        'div',
        { 'data-term-glossary': 'root', style: { position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 60 } },
        h('style', null, CSS),
        showButton
          ? h(
              'button',
              {
                type: 'button',
                className: 'tg-pill',
                title: `${t('explain')}：${picked.term}`,
                'aria-label': `${t('explain')}：${picked.term}`,
                style: {
                  left: `${Math.min(picked.rect.right + 6, Math.max(12, window.innerWidth - 96))}px`,
                  top: `${Math.min(picked.rect.bottom + 6, Math.max(12, window.innerHeight - 40))}px`,
                },
                onMouseDown: (event) => {
                  // Keep the selection alive so the click below still lands.
                  event.preventDefault();
                  buttonGuardRef.current = Date.now() + 800;
                },
                onClick: () => openPanel(picked),
              },
              t('explain'),
            )
          : null,
        entry && placement
          ? h(
              'div',
              {
                ref: panelRef,
                className: 'tg-panel',
                role: 'dialog',
                'aria-label': t('title'),
                style: {
                  left: `${placement.left}px`,
                  top: `${placement.top}px`,
                  width: `${placement.width}px`,
                  maxHeight: `${PANEL_MAX_HEIGHT}px`,
                },
              },
              h(
                'div',
                { className: 'tg-head' },
                h('span', { className: 'tg-term', title: entry.term }, entry.term),
                h('span', { className: 'tg-badge' }, t('title')),
                h('button', { type: 'button', className: 'tg-icon', 'aria-label': t('close'), onClick: close }, '×'),
              ),
              h(
                'div',
                { className: 'tg-body' },
                busy ? h('div', { className: 'tg-thinking' }, h('span', { className: 'tg-spin' }), t('thinking')) : null,
                answer ? renderRich(answer.text) : null,
                answer?.truncated ? h('div', { className: 'tg-truncated' }, t('truncated')) : null,
                error ? h('div', { className: 'tg-error' }, error) : null,
              ),
              usageLine(answer),
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
