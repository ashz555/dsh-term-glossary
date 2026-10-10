/**
 * Node half of `dsh-term-glossary` — a byte-stable loader shim.
 *
 * All real logic lives in ./lib/impl.js. This file exists for one reason:
 * Node's ESM cache keys a module by URL, so a package re-imported from the same
 * path keeps executing the FIRST module object the process ever loaded.
 * Observed consequence: editing the Host half of a profile-installed plugin and
 * reinstalling it changes nothing until the whole dsh process restarts.
 *
 * The shim breaks that cycle. It must NEVER change (a cached old copy is
 * harmless because its only job is to load the CURRENT impl from disk), while
 * `apply()` imports the impl through `?v=<sha256 of the file>`: identical
 * content reuses the cached module, changed content gets a fresh URL and
 * therefore fresh code — in-process, no restart.
 *
 * Two rules inherited from this pattern:
 *  - No `export default`: the loader collapses `exports.default ?? exports`, and
 *    a default export would discard the named `inject` export, mounting the
 *    plugin with no dependencies and letting `apply()` run before the borrowed
 *    services exist.
 *  - `inject` is declared here as well, so activation still waits for the
 *    services the impl needs before this shim runs.
 */

import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

/** Implementation module, resolved next to this (possibly cached) shim. */
const IMPL_URL = new URL('./lib/impl.js', import.meta.url)

/**
 * Import the impl, cache-busted by its own content hash. An unreadable file
 * falls back to the plain URL so the import itself reports the real error
 * instead of silently reusing the cached module.
 */
async function loadImpl() {
  let href = IMPL_URL.href
  try {
    const bytes = await readFile(IMPL_URL)
    const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 16)
    href = `${IMPL_URL.href}?v=${hash}`
  } catch {
    // Fall through: the import below surfaces the actual failure.
  }
  return await import(/* @vite-ignore */ href)
}

/** Same hard dependencies as the impl: a Web carrier and a model registry. */
export const inject = ['webServer', 'llm']

/**
 * Mount the implementation on the owning context.
 * @param {import('@deepseek-ai/cordis').Context} ctx - owning plugin context.
 * @param {object} config - the loader row's config, passed through untouched.
 */
export async function apply(ctx, config) {
  const impl = await loadImpl()
  await impl.apply(ctx, config)
}
