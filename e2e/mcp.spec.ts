// Owns: SPEC §12 phase 4 — the MCP endpoint Claude's connector uses: /mcp refuses a request without credentials (401
// with the OAuth challenge), and with the static bearer token it initializes, lists the review and week-plan tools,
// answers get_today, and refuses a misspelled argument as a tool error.
import type { APIRequestContext } from '@playwright/test'
import { expect, mcpToken, test, todayLocal } from './support'

const HEADERS = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }

/** One JSON-RPC call over streamable HTTP; the stateless server answers with one SSE message (or plain JSON). */
async function rpc(request: APIRequestContext, id: number, method: string, params: object = {}) {
  const response = await request.post('/mcp', {
    headers: { ...HEADERS, authorization: `Bearer ${mcpToken()}` },
    data: { jsonrpc: '2.0', id, method, params },
  })
  expect(response.status(), `${method} status`).toBe(200)
  const text = await response.text()
  const json = text.startsWith('{')
    ? text
    : text
        .split('\n')
        .find((line) => line.startsWith('data: '))
        ?.slice(6)
  const message = JSON.parse(json ?? 'null')
  expect(message.error, `${method} error`).toBeUndefined()
  return message.result
}

test('MCP: 401 without auth; with the bearer token it lists the tools and answers get_today', async ({
  request,
}) => {
  const anonymous = await request.post('/mcp', {
    headers: HEADERS,
    data: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
  })
  expect(anonymous.status()).toBe(401)
  expect(anonymous.headers()['www-authenticate']).toContain('resource_metadata=')

  const init = await rpc(request, 1, 'initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'playwright-e2e', version: '1.0.0' },
  })
  expect(init.serverInfo.name).toBe('fitness')
  expect(init.capabilities.tools).toBeTruthy()

  const { tools } = await rpc(request, 2, 'tools/list')
  const names = tools.map((tool: { name: string }) => tool.name)
  expect(names).toEqual(
    expect.arrayContaining(['get_today', 'apply_review', 'propose_week_plan', 'apply_week_plan']),
  )

  const today = await rpc(request, 3, 'tools/call', { name: 'get_today', arguments: {} })
  expect(today.isError ?? false).toBe(false)
  expect(today.content.length).toBeGreaterThan(0)
  expect(today.content[0].type).toBe('text')
  expect(today.content[0].text).toContain(todayLocal())

  // A misspelled argument is a tool error naming it, never a silent default (here: today's weigh-in replaced).
  const typo = await rpc(request, 4, 'tools/call', { name: 'log_weight', arguments: { weight_kg: 94, dat: '2026-01-01' } })
  expect(typo.isError).toBe(true)
  expect(typo.content[0].text).toContain('Unknown argument: dat')
})
