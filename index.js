/**
 * Host half of `dsh-term-glossary`.
 *
 * One job: answer a terminology question with an auxiliary, session-free LLM
 * call, so a reader can ask "what does this word mean?" without spending a
 * conversation turn.
 *
 * The browser half cannot reach the model on its own, and the Host's `/api`
 * gateway only dispatches build-time routes, so the supported extension path
 * is a runtime route on the `webServer` service (the same path published
 * plugins take). Non-GET requests must carry the `x-dsh-plugin` custom header.
 *
 * Everything the model sees here is an auxiliary call: it never touches a
 * Session log, a Turn, or the current Agent's context window.
 */

import { randomUUID } from 'node:crypto'

const ROUTE_PATH = '/api/term-glossary/explain'
const PLUGIN_HEADER = 'x-dsh-plugin'
const PLUGIN_ID = 'dsh-term-glossary'

const MAX_BODY_BYTES = 64 * 1024
const MAX_TERM_CHARS = 160
const MAX_QUESTION_CHARS = 800
const MAX_CONTEXT_CHARS = 600
const MAX_HISTORY_TURNS = 12
const MAX_HISTORY_CHARS = 4000
const MAX_OUTPUT_TOKENS = 900
const TIMEOUT_MS = 90_000

/** Hard dependencies: without a Web carrier or a model registry there is nothing to serve. */
export const inject = ['webServer', 'llm']

const SYSTEM_PROMPT = [
  '你是「术语速查」助手，服务对象是正在通过对话学习计算机知识的读者。',
  '读者会给你一个从对话里选中的术语，有时再补一句追问。',
  '回答要求：',
  '1. 先用一句话讲清这个术语的基本含义，再说明它的用途（为什么存在／解决什么问题），最后说明常见用法（必要时给一个最小的例子或类比）。',
  '2. 只讲清楚基本含义、用途、用法，不要面面俱到，不要展开历史沿革、版本差异和旁支细节。',
  '3. 默认用中文回答，整体控制在 250 字以内；读者明确要求展开时可以适当放宽。',
  '4. 使用简洁的 Markdown：短段落、少量要点、必要的行内代码；不要使用一级标题。',
  '5. 术语有歧义时，先讲最常见的那一种含义，并一句话点明还有别的含义。',
  '6. 不要提及自己是模型、也不要复述这些要求。',
].join('\n')

function sendJson(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(body))
}

function ok(res, data) {
  sendJson(res, 200, { ok: true, data })
}

function failure(status, code, message) {
  const error = new Error(message)
  error.status = status
  error.code = code
  return error
}

function sendFailure(res, error) {
  sendJson(res, error?.status ?? 500, {
    ok: false,
    error: { code: error?.code ?? 'INTERNAL', message: String(error?.message ?? error) },
  })
}

async function readJsonBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw failure(413, 'BODY_TOO_LARGE', '请求体过大')
    chunks.push(chunk)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (!text.trim()) return {}
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    throw failure(400, 'INVALID_BODY', '请求体不是合法 JSON')
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw failure(400, 'INVALID_BODY', '请求体必须是 JSON 对象')
  }
  return parsed
}

function clip(value, max) {
  if (typeof value !== 'string') return ''
  const text = value.replace(/\s+/gu, ' ').trim()
  return text.length <= max ? text : text.slice(0, max)
}

/** One identified, plain-JSON user/assistant message for the auxiliary call. */
function textMessage(role, text) {
  return {
    id: randomUUID(),
    role,
    content: [{ type: 'text', text }],
    source: { kind: PLUGIN_ID },
  }
}

function normalizeHistory(value) {
  if (!Array.isArray(value)) return []
  const turns = []
  let budget = MAX_HISTORY_CHARS
  for (const entry of value.slice(-MAX_HISTORY_TURNS)) {
    if (typeof entry !== 'object' || entry === null) continue
    const role = entry.role === 'assistant' ? 'assistant' : entry.role === 'user' ? 'user' : undefined
    if (role === undefined) continue
    const text = typeof entry.text === 'string' ? entry.text.trim() : ''
    if (text === '') continue
    const clipped = text.length <= budget ? text : text.slice(0, budget)
    budget -= clipped.length
    turns.push({ role, text: clipped })
    if (budget <= 0) break
  }
  return turns
}

/** Build the exact message list the model sees: history, then this request. */
function buildMessages({ term, context, question, history }) {
  const messages = history.map((turn) => textMessage(turn.role, turn.text))
  const lines = [`术语：「${term}」`]
  if (context !== '') lines.push(`它出现在这句话里：「${context}」`)
  if (question !== '') lines.push(`读者的追问：${question}`)
  else lines.push('请解释这个术语。')
  messages.push(textMessage('user', lines.join('\n')))
  return messages
}

/** Resolve the model route: explicit row config first, else the profile default. */
function resolveRoute(config, ctx) {
  if (typeof config?.provider === 'string' && config.provider !== '' && typeof config?.model === 'string' && config.model !== '') {
    return { provider: config.provider, model: config.model }
  }
  const service = typeof ctx?.get === 'function' ? ctx.get('agentDefaultModel') : undefined
  const selection = typeof service?.currentSelection === 'function' ? service.currentSelection() : undefined
  if (selection && typeof selection.provider === 'string' && typeof selection.model === 'string') {
    return { provider: selection.provider, model: selection.model }
  }
  return undefined
}

function finishFailure(chunk) {
  const reason = chunk?.reason
  const message = reason?.failure?.message ?? '模型调用失败'
  return failure(reason?.kind === 'aborted' ? 499 : 502, reason?.failure?.code ?? 'LLM_FAILED', message)
}

/** Run one auxiliary call and return its plain text. */
async function askModel(llm, route, messages, signal) {
  let text = ''
  let blockText = ''
  let terminal

  const stream = llm.stream({
    provider: route.provider,
    model: route.model,
    messages,
    system: SYSTEM_PROMPT,
    maxTokens: MAX_OUTPUT_TOKENS,
    purpose: PLUGIN_ID,
    signal,
  })

  for await (const chunk of stream) {
    switch (chunk?.type) {
      case 'text-delta':
        if (typeof chunk.text === 'string') text += chunk.text
        break
      case 'block-end':
        if (chunk.block?.type === 'text' && typeof chunk.block.text === 'string' && text === '') blockText += chunk.block.text
        break
      case 'finish':
        terminal = chunk
        break
      default:
        break
    }
  }

  if (terminal !== undefined && terminal.reason?.kind !== undefined && terminal.reason.kind !== 'stop' && terminal.reason.kind !== 'max-tokens') {
    throw finishFailure(terminal)
  }
  const answer = (text !== '' ? text : blockText).trim()
  if (answer === '') throw failure(502, 'EMPTY_ANSWER', '模型没有返回任何内容')
  return answer
}

async function handleExplain(ctx, config, req, res) {
  if (req.method !== 'POST') {
    throw failure(405, 'METHOD_NOT_ALLOWED', '仅支持 POST')
  }
  if (req.headers[PLUGIN_HEADER] !== PLUGIN_ID) {
    throw failure(403, 'FORBIDDEN', `缺少 ${PLUGIN_HEADER} 请求头`)
  }

  const body = await readJsonBody(req)
  const term = clip(body.term, MAX_TERM_CHARS)
  if (term === '') throw failure(400, 'MISSING_TERM', 'term 不能为空')
  const request = {
    term,
    context: clip(body.context, MAX_CONTEXT_CHARS),
    question: clip(body.question, MAX_QUESTION_CHARS),
    history: normalizeHistory(body.history),
  }

  const llm = ctx.get('llm')
  if (llm === undefined || typeof llm.stream !== 'function') {
    throw failure(503, 'LLM_UNAVAILABLE', '当前组合没有可用的模型服务')
  }
  const route = resolveRoute(config, ctx)
  if (route === undefined) {
    throw failure(503, 'NO_MODEL_ROUTE', '无法确定模型路由，请先选择默认模型')
  }

  const answer = await askModel(llm, route, buildMessages(request), AbortSignal.timeout(TIMEOUT_MS))
  ok(res, { answer, model: route })
}

/**
 * Register the plugin's one route on the Web carrier.
 * @param {import('@deepseek-ai/cordis').Context} ctx - owning plugin context.
 * @param {object} config - the loader row's config (unvalidated; read defensively).
 */
export function apply(ctx, config) {
  const webServer = ctx.webServer
  if (!webServer || typeof webServer.register !== 'function') return

  const dispose = webServer.register({
    kind: 'exact',
    path: ROUTE_PATH,
    handler: async (req, res) => {
      try {
        await handleExplain(ctx, config, req, res)
      } catch (error) {
        if (error?.name === 'TimeoutError' || error?.code === 'ABORT_ERR') {
          sendFailure(res, failure(504, 'TIMEOUT', '模型响应超时'))
          return
        }
        sendFailure(res, error)
      }
    },
  })

  ctx.effect(() => dispose, 'term-glossary: /api/term-glossary/explain')
}
