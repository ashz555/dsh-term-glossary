/**
 * Local smoke test for dsh-term-glossary, runnable before installation.
 *
 * It exercises the Host half against a fake Cordis context (route registration,
 * header check, body validation, model route resolution, stream assembly) and
 * loads the browser half's factory to confirm it registers into `shell.overlay`.
 *
 * Usage: node tools/verify-plugin.mjs
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

/** The plugin package is the repository root, so the test resolves against its parent. */
const pkgDir = new URL('../', import.meta.url)
const host = await import(new URL('index.js', pkgDir).href)

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
      yield { type: 'finish', reason: { kind: 'stop' } }
    })()
  },
}

const PROFILE_DEFAULT = { provider: 'deepseek-official', model: 'deepseek-flash' }

function makeCtx(options = {}) {
  const registered = { route: null }
  const ctx = {
    llm: fakeLlm,
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
      if (name === 'llm') return fakeLlm
      if (name === 'agentDefaultModel') {
        return options.withoutDefaultModel ? undefined : { currentSelection: () => PROFILE_DEFAULT }
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
  return {
    captured,
    writeHead(status, headers) {
      captured.status = status
      captured.headers = headers
    },
    end(text) {
      captured.payload = text === undefined ? undefined : JSON.parse(text)
    },
  }
}

async function call(handler, method, headers, body) {
  const res = makeRes()
  await handler(makeReq(method, headers, body), res)
  return res.captured
}

const PLUGIN_HEADERS = { 'x-dsh-plugin': 'dsh-term-glossary' }
const lastMessageText = () => lastOptions.messages.at(-1).content[0].text

/* ── cases ────────────────────────────────────────────────────────────── */

const happy = await call(route.handler, 'POST', PLUGIN_HEADERS, { term: '闭包', context: '于是我们用闭包保存状态。', history: [] })
assert.equal(happy.status, 200)
assert.equal(happy.payload.ok, true)
assert.equal(happy.payload.data.answer, '**闭包**是一个函数加上它捕获的变量环境。')
assert.deepEqual(happy.payload.data.model, PROFILE_DEFAULT)
assert.equal(lastOptions.provider, 'deepseek-official')
assert.equal(lastOptions.model, 'deepseek-flash')
assert.ok(typeof lastOptions.system === 'string' && lastOptions.system.length > 0, 'call must carry the system prompt')
assert.equal(lastOptions.messages.length, 1)
assert.equal(lastOptions.messages[0].role, 'user')
assert.match(lastMessageText(), /闭包/)
assert.match(lastMessageText(), /追问|请解释/)

const followUp = await call(route.handler, 'POST', PLUGIN_HEADERS, {
  term: '闭包',
  question: '它和匿名函数是一回事吗？',
  history: [
    { role: 'user', text: '术语：「闭包」' },
    { role: 'assistant', text: '闭包是……' },
  ],
})
assert.equal(followUp.status, 200)
assert.equal(lastOptions.messages.length, 3, 'history turns must precede the new question')
assert.match(lastOptions.messages[2].content[0].text, /匿名函数/)

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

// Without a default model and without row config the caller gets a usable error.
const bare = makeCtx({ withoutDefaultModel: true })
host.apply(bare.ctx, {})
const bareRes = await call(bare.registered.route.handler, 'POST', PLUGIN_HEADERS, { term: 'RAII' })
assert.equal(bareRes.status, 503)
assert.equal(bareRes.payload.error.code, 'NO_MODEL_ROUTE')

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

// The component must render without a DOM: one fixed, click-through layer.
const tree = registrations[0].component({})
assert.ok(tree && typeof tree === 'object', 'component must return a React element tree')
assert.equal(tree.args[0], 'div')
assert.equal(tree.args[1].style.pointerEvents, 'none')

console.log('verify-plugin: all checks passed')
