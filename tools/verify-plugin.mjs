/**
 * Local smoke test for dsh-term-glossary, runnable before installation.
 *
 * It exercises the Host half against a fake Cordis context (route registration,
 * header check, body validation, model route resolution, conversation-background
 * collection, stream assembly) and loads the browser half's factory to confirm
 * it registers into `shell.overlay`.
 *
 * Usage: node tools/verify-plugin.mjs
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

/** The plugin package is the repository root, so the test resolves against its parent. */
const pkgDir = new URL('../', import.meta.url)
const host = await import(new URL('lib/impl.js', pkgDir).href)

/* ── fake Cordis context ──────────────────────────────────────────────── */

let route = null
const effects = []
let lastOptions = null

const fakeLlm = {
  stream(options) {
    lastOptions = options
    return (async function* () {
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: '**闭包**是' }
      yield { type: 'text-delta', index: 0, text: '一个函数加上它捕获的变量环境。' }
      yield { type: 'usage', usage: { inputTokens: 189, outputTokens: 395, totalTokens: 584, cacheReadTokens: 256 } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    })()
  },
}

const DOCUMENTS = [
  { type: 'system/message', seq: 0, text: '系统提示，不能当背景' },
  { type: 'user/message', seq: 1, text: '这份病历里的 "SOAP" 是什么意思？' },
  { type: 'assistant/message', seq: 2, text: '它指主观、客观、评估、计划四个部分。' },
  { type: 'tool/call', seq: 3, text: '{"name":"read"}' },
  { type: 'user/message', seq: 4, text: '那 "鉴别诊断" 呢？' },
  {
    type: 'user/message',
    seq: 5,
    text: 'Current runtime context. This snapshot supersedes earlier runtime-context snapshots.\nCurrent DSH file policy: workspace-write.',
  },
  { type: 'user/message', seq: 6, text: 'The approval policy changed from "ask" to "never" (changed by the user).' },
  { type: 'user/message', seq: 7, text: '那 "鉴别诊断" 呢？' },
]

const fakeSessionQuery = {
  async readTitle(sessionId) {
    return { title: '临床笔记整理' }
  },
  async filterEvents(sessionId, filters) {
    assert.ok(Array.isArray(filters) && filters[0].kind === 'type', 'filterEvents must be called with a type filter')
    return DOCUMENTS
  },
}

const PROFILE_DEFAULT = { provider: 'deepseek-official', model: 'deepseek-flash' }

function makeCtx(options = {}) {
  const registered = { route: null }
  const llm = options.llm ?? fakeLlm
  const ctx = {
    llm,
    webServer: {
      register(candidate) {
        registered.route = candidate
        return () => { registered.route = null }
      },
    },
    effect(callback) {
      effects.push(callback)
      return () => {}
    },
    get(name) {
      if (name === 'llm') return llm
      if (name === 'agentDefaultModel') {
        return options.withoutDefaultModel ? undefined : { currentSelection: () => PROFILE_DEFAULT }
      }
      if (name === 'sessionQuery') {
        if (options.withoutSessionQuery) return undefined
        if (options.throwingSessionQuery) {
          return {
            async readTitle() { throw new Error('no such session') },
            async filterEvents() { throw new Error('backend down') },
          }
        }
        return fakeSessionQuery
      }
      if (name === 'agents') {
        // A live agent whose logged request route differs from the profile default.
        if (!options.agentsSession) return undefined
        return {
          get: () => ({ session: { requestHeader: () => ({ config: options.agentsSession }) } }),
        }
      }
      return undefined
    },
  }
  return { ctx, registered }
}

const primary = makeCtx()
assert.deepEqual(host.inject, ['webServer', 'llm'], 'host half must declare its hard dependencies')
host.apply(primary.ctx, {})
route = primary.registered.route
assert.ok(route, 'apply() must register the explain route')
assert.equal(route.kind, 'exact')
assert.equal(route.path, '/api/term-glossary/explain')
assert.equal(effects.length, 1, 'route disposal must be owned by one ctx.effect')

/* ── fake request/response ────────────────────────────────────────────── */

function makeReq(method, headers, body) {
  const text = body === undefined ? '' : JSON.stringify(body)
  return {
    method,
    headers,
    async *[Symbol.asyncIterator]() {
      if (text !== '') yield Buffer.from(text, 'utf8')
    },
  }
}

function makeRes() {
  const captured = { status: 0, headers: null, payload: undefined }
  const listeners = new Map()
  const res = {
    captured,
    listeners,
    writableEnded: false,
    destroyed: false,
    once(event, listener) {
      if (!listeners.has(event)) listeners.set(event, [])
      listeners.get(event).push(listener)
      return res
    },
    off(event, listener) {
      const list = listeners.get(event)
      const at = list ? list.indexOf(listener) : -1
      if (at >= 0) list.splice(at, 1)
      return res
    },
    /** Simulate the reader closing the box: Node marks the response destroyed. */
    clientGone() {
      res.destroyed = true
      for (const listener of [...(listeners.get('close') ?? [])]) listener()
    },
    writeHead(status, headers) {
      captured.status = status
      captured.headers = headers
    },
    end(text) {
      captured.payload = text === undefined ? undefined : JSON.parse(text)
      res.writableEnded = true
    },
  }
  return res
}

async function call(handler, method, headers, body) {
  const res = makeRes()
  await handler(makeReq(method, headers, body), res)
  return res.captured
}

const PLUGIN_HEADERS = { 'x-dsh-plugin': 'dsh-term-glossary' }
const lastMessageText = () => lastOptions.messages.at(-1).content[0].text

/* ── conversation background (pure) ───────────────────────────────────── */

const lines = host.backgroundLines(DOCUMENTS)
assert.deepEqual(lines, [
  '读者：这份病历里的 "SOAP" 是什么意思？',
  '读者：那 "鉴别诊断" 呢？',
], 'background must keep only the reader\'s own turns, in order')

assert.deepEqual(
  host.backgroundLines([{ type: 'assistant/message', seq: 1, text: 'write {"content": "noise"}' }]),
  [],
  'assistant documents carry tool payloads and must not become clues',
)

const many = []
for (let index = 0; index < 40; index += 1) {
  many.push({ type: 'user/message', seq: index, text: `第 ${index} 条消息` })
}
const capped = host.backgroundLines(many)
assert.ok(capped.length <= 6, `background must cap the turn count, got ${capped.length}`)
assert.equal(capped.at(-1), '读者：第 39 条消息', 'background must keep the newest turns')
assert.ok(capped.join('').length <= 1500, 'background must stay inside its character budget')

const longLine = host.backgroundLines([{ type: 'user/message', seq: 0, text: 'x'.repeat(5000) }])
assert.equal(longLine[0].length, 3 + 400, 'each background turn must be clipped')

assert.deepEqual(host.backgroundLines([{ type: 'system/message', text: 'nope' }]), [])

/* ── cases ────────────────────────────────────────────────────────────── */

const happy = await call(route.handler, 'POST', PLUGIN_HEADERS, { term: '闭包', context: '于是我们用闭包保存状态。', history: [] })
assert.equal(happy.status, 200)
assert.equal(happy.payload.ok, true)
assert.equal(happy.payload.data.answer, '**闭包**是一个函数加上它捕获的变量环境。')
assert.equal(happy.payload.data.truncated, false)
assert.deepEqual(happy.payload.data.usage, { inputTokens: 189, outputTokens: 395, totalTokens: 584, cacheReadTokens: 256 }, 'the answer must report what it cost')
assert.deepEqual(happy.payload.data.model, PROFILE_DEFAULT)
assert.ok(lastOptions.maxTokens >= 2000, 'the output ceiling must leave room for hidden reasoning tokens')
assert.equal(lastOptions.provider, 'deepseek-official')
assert.equal(lastOptions.model, 'deepseek-flash')
assert.ok(typeof lastOptions.system === 'string' && lastOptions.system.length > 0, 'call must carry the system prompt')
assert.equal(lastOptions.messages.length, 1)
assert.equal(lastOptions.messages[0].role, 'user')
assert.match(lastMessageText(), /闭包/)
assert.ok(!lastMessageText().includes('【对话背景'), 'a request without a session id must not carry background')

// A session id turns the reader's own conversation into domain evidence.
const withSession = await call(route.handler, 'POST', PLUGIN_HEADERS, {
  term: 'SOAP',
  question: '和 SOAP 协议有关系吗？',
  sessionId: 'session-1234-abcd',
  history: [{ role: 'user', text: '术语：「SOAP」' }, { role: 'assistant', text: '它是病历记录格式。' }],
})
assert.equal(withSession.status, 200)
assert.equal(lastOptions.messages.length, 3, 'history turns must precede the new question')
const rich = lastMessageText()
assert.ok(rich.startsWith('【对话背景'), 'background must lead the final user message')
assert.match(rich, /会话标题：临床笔记整理/)
assert.match(rich, /读者：这份病历里的 "SOAP" 是什么意思？/)
assert.ok(!rich.includes('系统提示，不能当背景'), 'background must ignore non-user events')
assert.ok(!rich.includes('它指主观、客观、评估、计划四个部分。'), 'background must ignore assistant tool payloads')
assert.match(rich, /读者的追问：和 SOAP 协议有关系吗？/)

// A malformed session id is ignored rather than rejected.
const badSession = await call(route.handler, 'POST', PLUGIN_HEADERS, { term: 'SOAP', sessionId: 'not a session id' })
assert.equal(badSession.status, 200)
assert.ok(!lastMessageText().includes('【对话背景'), 'a malformed session id must not produce background')

// A model that stops at the output ceiling reports a partial answer honestly
// instead of presenting a half sentence as complete (observed in real use: the
// reasoning tokens of one clue-carrying answer consumed 859 of 900).
const truncating = makeCtx({
  llm: {
    stream(options) {
      lastOptions = options
      return (async function* () {
        yield { type: 'text-delta', index: 0, text: '好处是解耦，' }
        yield { type: 'finish', reason: { kind: 'max-tokens' } }
      })()
    },
  },
})
host.apply(truncating.ctx, {})
const cut = await call(truncating.registered.route.handler, 'POST', PLUGIN_HEADERS, { term: '注入' })
assert.equal(cut.status, 200)
assert.equal(cut.payload.data.truncated, true, 'a capped answer must be reported as truncated')
assert.equal(cut.payload.data.answer, '好处是解耦，')

// A failing or absent sessionQuery degrades to a plain answer.
const throwing = makeCtx({ throwingSessionQuery: true })
host.apply(throwing.ctx, {})
const degraded = await call(throwing.registered.route.handler, 'POST', PLUGIN_HEADERS, { term: 'SOAP', sessionId: 'session-1234-abcd' })
assert.equal(degraded.status, 200)
assert.ok(!lastMessageText().includes('【对话背景'), 'a failing sessionQuery must degrade, not fail')

const withoutQuery = makeCtx({ withoutSessionQuery: true })
host.apply(withoutQuery.ctx, {})
const plain = await call(withoutQuery.registered.route.handler, 'POST', PLUGIN_HEADERS, { term: 'SOAP', sessionId: 'session-1234-abcd' })
assert.equal(plain.status, 200)

// Input guards.
const noTerm = await call(route.handler, 'POST', PLUGIN_HEADERS, { term: '   ' })
assert.equal(noTerm.status, 400)
assert.equal(noTerm.payload.error.code, 'MISSING_TERM')

const noHeader = await call(route.handler, 'POST', {}, { term: '闭包' })
assert.equal(noHeader.status, 403)
assert.equal(noHeader.payload.error.code, 'FORBIDDEN')

assert.equal((await call(route.handler, 'GET', PLUGIN_HEADERS, undefined)).status, 405)

const badJsonRes = makeRes()
await route.handler({ method: 'POST', headers: PLUGIN_HEADERS, async *[Symbol.asyncIterator]() { yield Buffer.from('{oops') } }, badJsonRes)
assert.equal(badJsonRes.captured.status, 400)
assert.equal(badJsonRes.captured.payload.error.code, 'INVALID_BODY')

// Row config overrides the profile default route.
const configured = makeCtx()
host.apply(configured.ctx, { provider: 'deepseek-official', model: 'deepseek-reasoner' })
await call(configured.registered.route.handler, 'POST', PLUGIN_HEADERS, { term: 'RAII' })
assert.equal(lastOptions.model, 'deepseek-reasoner', 'row config must override the default route')

/* ── route preference and the transport fallback ──────────────────────── */

const routeCtx = {
  get: (name) => {
    if (name === 'agents') return { get: () => ({ session: { requestHeader: () => ({ config: { provider: 'session-p', model: 'session-m' } }) } }) }
    if (name === 'agentDefaultModel') return { currentSelection: () => ({ provider: 'default-p', model: 'default-m' }) }
    return undefined
  },
}
assert.deepEqual(
  host.candidateRoutes({}, routeCtx, 'session-1234-abcd').map((route) => `${route.provider}/${route.model}`),
  ['session-p/session-m', 'default-p/default-m'],
  'the reader\'s own conversation route must be tried before the profile default',
)
assert.deepEqual(
  host.candidateRoutes({ provider: 'session-p', model: 'session-m' }, routeCtx, 'session-1234-abcd').map((route) => `${route.provider}/${route.model}`),
  ['session-p/session-m', 'default-p/default-m'],
  'duplicate routes must be dropped',
)
assert.deepEqual(
  host.candidateRoutes({}, routeCtx, '').map((route) => `${route.provider}/${route.model}`),
  ['default-p/default-m'],
  'without a session id there is no conversation route to prefer',
)

// A transport failure (the reader's machine cannot reach that route) moves on
// to the next candidate instead of showing a raw English provider error.
let attempts = 0
const flakyLlm = {
  stream(options) {
    lastOptions = options
    attempts += 1
    const attempt = attempts
    return (async function* () {
      if (attempt === 1) {
        yield { type: 'finish', reason: { kind: 'error', failure: { code: 'TRANSPORT', message: 'DeepSeek Messages transport failed' } } }
        return
      }
      yield { type: 'text-delta', index: 0, text: '第二次路由成功。' }
      yield { type: 'finish', reason: { kind: 'stop' } }
    })()
  },
}
const flaky = makeCtx({ llm: flakyLlm, agentsSession: { provider: 'session-p', model: 'session-m' } })
host.apply(flaky.ctx, {})
const recovered = await call(flaky.registered.route.handler, 'POST', PLUGIN_HEADERS, { term: '闭包', sessionId: 'session-1234-abcd' })
assert.equal(recovered.status, 200, 'a transport failure must be retried on the next route')
assert.equal(attempts, 2, 'exactly one fallback attempt')
assert.equal(recovered.payload.data.answer, '第二次路由成功。')
assert.deepEqual(recovered.payload.data.model, PROFILE_DEFAULT, 'the fallback used the profile default')

// When every route fails, the reader gets a plain-language message naming the
// routes that were tried, not just the provider's English error.
const deadLlm = {
  stream() {
    return (async function* () {
      yield { type: 'finish', reason: { kind: 'error', failure: { code: 'TRANSPORT', message: 'DeepSeek Messages transport failed' } } }
    })()
  },
}
const dead = makeCtx({ llm: deadLlm, agentsSession: { provider: 'session-p', model: 'session-m' } })
host.apply(dead.ctx, {})
const deadRes = await call(dead.registered.route.handler, 'POST', PLUGIN_HEADERS, { term: '闭包', sessionId: 'session-1234-abcd' })
assert.equal(deadRes.status, 502)
assert.equal(deadRes.payload.error.code, 'TRANSPORT')
assert.match(deadRes.payload.error.message, /模型调用失败/, 'the message must say what happened in Chinese')
assert.match(deadRes.payload.error.message, /session-p\/session-m/, 'the message must name the routes tried')
assert.match(deadRes.payload.error.message, /不是插件本身/, 'the message must point away from the plugin as the fault')

/* ── hardening: disconnect, partial output, error hygiene ─────────────── */

// A reader who closes the box must abort the in-flight model call instead of
// letting it run to the 60 s deadline, and must not trigger a second attempt.
{
  let started = 0
  let seenSignal
  const gatedLlm = {
    stream(options) {
      started += 1
      seenSignal = options.signal
      return (async function* () {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, 3000)
          options.signal?.addEventListener('abort', () => {
            clearTimeout(timer)
            const error = new Error('aborted')
            error.name = 'AbortError'
            reject(error)
          }, { once: true })
        })
        yield { type: 'text-delta', index: 0, text: '迟到的答案' }
        yield { type: 'finish', reason: { kind: 'stop' } }
      })()
    },
  }
  const gated = makeCtx({ llm: gatedLlm, agentsSession: { provider: 'session-p', model: 'session-m' } })
  host.apply(gated.ctx, {})
  const res = makeRes()
  const pending = gated.registered.route.handler(
    makeReq('POST', PLUGIN_HEADERS, { term: '闭包', sessionId: 'session-1234-abcd' }),
    res,
  )
  await new Promise((resolve) => setTimeout(resolve, 40))
  res.clientGone()
  await pending
  assert.equal(started, 1, 'a disconnect must not walk to another route')
  assert.equal(seenSignal?.aborted, true, 'the model call must be aborted when the reader leaves')
  assert.equal(res.captured.payload, undefined, 'nothing is written to a response the reader already closed')
}

// A failure that already streamed visible text must NOT be retried: the reader
// has been charged for that generation once.
{
  let attempts = 0
  const partialLlm = {
    stream() {
      attempts += 1
      if (attempts === 1) {
        return (async function* () {
          yield { type: 'text-delta', index: 0, text: '已经生成了一部分内容' }
          yield { type: 'finish', reason: { kind: 'error', failure: { code: 'TRANSPORT', message: 'socket hang up' } } }
        })()
      }
      return (async function* () {
        yield { type: 'text-delta', index: 0, text: '不该出现的第二次' }
        yield { type: 'finish', reason: { kind: 'stop' } }
      })()
    },
  }
  const partial = makeCtx({ llm: partialLlm, agentsSession: { provider: 'session-p', model: 'session-m' } })
  host.apply(partial.ctx, {})
  const partialRes = await call(partial.registered.route.handler, 'POST', PLUGIN_HEADERS, { term: '闭包', sessionId: 'session-1234-abcd' })
  assert.equal(attempts, 1, 'a failure after partial output must not be retried on the next route')
  assert.equal(partialRes.status, 502)
  assert.equal(partialRes.payload.error.code, 'TRANSPORT')
  assert.doesNotMatch(partialRes.payload.error.message, /不该出现的第二次/)
}

// Host errors are not echoed verbatim: URLs are redacted and the text is capped.
{
  const leakyLlm = {
    stream() {
      return (async function* () {
        yield {
          type: 'finish',
          reason: {
            kind: 'error',
            failure: { code: 'UPSTREAM', message: `POST https://api.internal.example/v1/chat failed: ${'x'.repeat(400)}` },
          },
        }
      })()
    },
  }
  const leaky = makeCtx({ llm: leakyLlm })
  host.apply(leaky.ctx, {})
  const leakyRes = await call(leaky.registered.route.handler, 'POST', PLUGIN_HEADERS, { term: '闭包' })
  assert.equal(leakyRes.status, 502)
  const text = leakyRes.payload.error.message
  assert.doesNotMatch(text, /https?:\/\//, 'URLs from host errors must not reach the page')
  assert.match(text, /\[url\]/, 'the URL is replaced with a placeholder')
  assert.ok(text.length <= 401, `error text must be capped (got ${text.length} chars)`)
}

// Without a default model and without row config the caller gets a usable error.
const bare = makeCtx({ withoutDefaultModel: true })
host.apply(bare.ctx, {})
const bareRes = await call(bare.registered.route.handler, 'POST', PLUGIN_HEADERS, { term: 'RAII' })
assert.equal(bareRes.status, 503)
assert.equal(bareRes.payload.error.code, 'NO_MODEL_ROUTE')

/* ── loader shim: the entry must mount the impl in-process ────────────── */

const shim = await import(new URL('index.js', pkgDir).href)
assert.equal(Array.from(shim.inject).join(','), 'webServer,llm', 'the shim must declare the same hard dependencies')
const shimmed = makeCtx()
await shim.apply(shimmed.ctx, {})
assert.ok(shimmed.registered.route, 'the shim must pass the impl\'s route registration through')
const shimRes = await call(shimmed.registered.route.handler, 'POST', PLUGIN_HEADERS, { term: '闭包' })
assert.equal(shimRes.status, 200)
assert.equal(shimRes.payload.data.answer, '**闭包**是一个函数加上它捕获的变量环境。')

/* ── browser half: the factory must register one overlay entry ─────────── */

const clientSource = readFileSync(fileURLToPath(new URL('client.js', pkgDir)), 'utf8')
let loaded = null
const sandbox = { window: { __ModuleLoader__: { load: (entry) => { loaded = entry } } }, console }
sandbox.window.navigator = { language: 'zh-CN' }
vm.createContext(sandbox)
vm.runInContext(clientSource, sandbox)

assert.ok(loaded, 'client.js must register a module-loader factory')
assert.equal(loaded.id, 'dsh-term-glossary')

const registrations = []
let injectedSlot = null
const clientCtx = {
  get: () => undefined,
  effect: () => () => {},
  slots: {
    inject(slot, callback) {
      injectedSlot = slot
      return callback()
    },
    register(options, component) {
      registrations.push({ options, component })
      return () => {}
    },
  },
}

const fakeReact = {
  createElement: (...args) => ({ args }),
  useState: (value) => [value, () => {}],
  useEffect: () => {},
  useRef: () => ({ current: null }),
  useCallback: (fn) => fn,
}

const clientExports = loaded.factory((name) => {
  if (name === 'react') return fakeReact
  throw new Error(`unexpected require(${name})`)
})
assert.equal(typeof clientExports.apply, 'function')
assert.equal(Array.from(clientExports.inject).join(','), 'slots')
clientExports.apply(clientCtx)
assert.equal(injectedSlot, 'shell.overlay')
assert.equal(registrations.length, 1)
assert.equal(registrations[0].options.name, 'shell.overlay')
assert.equal(registrations[0].options.id, 'term-glossary')
assert.equal(typeof registrations[0].component, 'function')
assert.equal(registrations[0].options.order, 40)

// The component must render without a DOM: one fixed, click-through layer.
const tree = registrations[0].component({})
assert.ok(tree && typeof tree === 'object', 'component must return a React element tree')
assert.equal(tree.args[0], 'div')
assert.equal(tree.args[1].style.pointerEvents, 'none')

// The owner's session selector is consulted for the current Session id.
const seen = []
const treeWithSessions = registrations[0].component({
  useSessions: (selector) => {
    seen.push(selector)
    return selector({ byId: { 'session-1234-abcd': { id: 'session-1234-abcd', retainedBy: { mainView: 1 } } } })
  },
})
assert.equal(seen.length, 1, 'the component must read the owner selector hook exactly once')
assert.equal(seen[0]({ byId: {} }), undefined, 'the selector must tolerate an empty store')
assert.equal(seen[0]({ byId: { a: { id: 'a', retainedBy: { mainView: 0 } }, b: { id: 'b', retainedBy: { mainView: 2 } } } }), 'b')
assert.ok(treeWithSessions && typeof treeWithSessions === 'object')

// Selecting text only offers a button; the search itself starts on that click.
const countOf = (text, needle) => text.split(needle).length - 1
assert.ok(clientSource.includes('tg-pill'), 'the trigger button must exist')
assert.ok(clientSource.includes("t('explain')"), 'the button must carry a label')
assert.ok(clientSource.includes('onClick: () => openPanel(picked)'), 'the button click is what opens the box')
assert.equal(countOf(clientSource, 'void request('), 1, 'the search must start from exactly one place (openPanel)')
assert.ok(clientSource.includes('buttonGuardRef'), 'a press on the button must not unmount it before the click lands')

// The follow-up input stays removed.
assert.ok(!clientSource.includes("h('textarea'"), 'the follow-up input must be gone')
assert.ok(!clientSource.includes('tg-send'), 'the send control must be gone')

// Progress and cost still surface inside the box.
assert.ok(clientSource.includes('tg-thinking'), 'the box must be able to show its progress')
assert.ok(clientSource.includes('正在思考'), 'the progress label must exist')
assert.ok(clientSource.includes('tg-usage'), 'the box must be able to show token usage')
assert.ok(clientSource.includes('usageLine'), 'usage must be rendered from the response')

// The overlay box must not be torn down by a collapsing page selection: the
// state it hangs on is only cleared by close().
assert.ok(!/setEntry\(null\)[\s\S]{0,80}readSelection/.test(clientSource), 'selection tracking must not clear the open box')

console.log('verify-plugin: all checks passed')
