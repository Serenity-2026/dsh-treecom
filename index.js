/**
 * treecom — Host half.
 *
 * A read-only index over the user's conversation family. It does not write to
 * any session log: the only file it owns is the sidecar with branch labels.
 *
 * The index is a tree of TURNS, not of sessions. A DSH fork copies a prefix of
 * the parent log verbatim, so a turn below `inheritedEventCount` is the same
 * turn in every descendant. Canonicalising those turns to their owning session
 * makes the shared trunk appear once and makes a fork a child of the turn it
 * was cut from. That is the whole data model.
 *
 * The client asks for the family of one session, then either clicks a node
 * (fork at that turn's closing seq) or opens an existing branch. Forking and
 * archive/unarchive go through the normal Client session services; this route
 * never creates or mutates a session.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

const ROUTE = '/treecom'
const STATE_VERSION = 1
const SNAPSHOT_TTL_MS = 15_000
const LABEL_LIMIT = 120

export const name = 'treecom'
export const inject = ['webServer', 'sessionQuery', 'sessions']

export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE,
    handler: (request, response) => handle(ctx, request, response),
  }), 'treecom: index route')
}

/* --------------------------------------------------------------- route -- */

async function handle(ctx, request, response) {
  try {
    if (request.method === 'GET') {
      const url = new URL(request.url ?? ROUTE, 'http://treecom.local')
      const sessionId = url.searchParams.get('sessionId')
      if (typeof sessionId !== 'string' || sessionId.length === 0) {
        respond(response, 400, { error: 'sessionId 必须是非空字符串' })
        return
      }
      respond(response, 200, await buildTree(ctx, sessionId))
      return
    }
    if (request.method === 'POST') {
      const body = await readJson(request)
      if (body !== null && typeof body === 'object' && body.action === 'label') {
        const nodeId = typeof body.nodeId === 'string' ? body.nodeId : ''
        if (nodeId.length === 0) {
          respond(response, 400, { error: 'nodeId 必须是非空字符串' })
          return
        }
        const label = normalizeLabel(body.label)
        const state = await updateState((current) => {
          if (label.length === 0) delete current.labels[nodeId]
          else current.labels[nodeId] = label
          return current
        })
        respond(response, 200, { ok: true, labels: state.labels })
        return
      }
      respond(response, 400, { error: '未知操作' })
      return
    }
    response.writeHead(405)
    response.end()
  } catch (error) {
    respond(response, 500, { error: error instanceof Error ? error.message : String(error) })
  }
}

function respond(response, status, value) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(JSON.stringify(value))
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    const chunks = []
    request.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))))
    request.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8')
        resolve(text.length === 0 ? null : JSON.parse(text))
      } catch (error) {
        reject(new TypeError('请求体必须是 JSON'))
      }
    })
    request.on('error', reject)
  })
}

/* ---------------------------------------------------------------- tree -- */

async function buildTree(ctx, sessionId) {
  const records = await ctx.sessionQuery.listSessions()
  const byId = new Map(records.map((record) => [record.header.id, record]))
  let target = byId.get(sessionId)
  if (target === undefined) {
    // A freshly forked child can be readable before the catalogue lists it.
    // Read it once and splice it into this request's family.
    const snapshot = await ctx.sessionQuery.readSession(sessionId)
    target = { header: snapshot.session, live: false, persisted: true }
    records.push(target)
    byId.set(sessionId, target)
  }

  const root = rootOf(target, byId)
  const family = familyOf(root, records)
  if (!family.some((record) => record.header.id === sessionId)) family.push(target)

  const snapshots = new Map()
  const errors = []
  for (const record of family) {
    try {
      snapshots.set(record.header.id, await readSnapshot(ctx, record))
    } catch (error) {
      errors.push({ sessionId: record.header.id, message: messageOf(error) })
    }
  }
  if (!snapshots.has(sessionId)) {
    const detail = errors.find((entry) => entry.sessionId === sessionId)
    throw new Error(detail === undefined ? `读不到会话 ${sessionId}` : `读不到会话 ${sessionId}: ${detail.message}`)
  }

  const turnsBySession = new Map()
  for (const [id, snapshot] of snapshots) turnsBySession.set(id, cachedTurns(id, snapshot.events))

  const rootId = root.header.id
  const rootSnapshot = snapshots.get(rootId)
  const treeTitle = rootSnapshot === undefined
    ? shortId(rootId)
    : titleOf(rootSnapshot.events) || firstPrompt(turnsBySession.get(rootId) ?? []) || shortId(rootId)

  const nodes = []
  const nodeById = new Map()
  const rootNode = {
    id: `${rootId}:root`,
    kind: 'root',
    sessionId: rootId,
    turn: 0,
    startSeq: 0,
    endSeq: 0,
    parentId: null,
    label: treeTitle,
    prompt: '',
    answer: '',
    time: root.header.createdAt,
    order: 0,
  }
  nodes.push(rootNode)
  nodeById.set(rootNode.id, rootNode)

  for (const record of family) {
    const id = record.header.id
    const snapshot = snapshots.get(id)
    if (snapshot === undefined) continue
    const turns = turnsBySession.get(id) ?? []
    let previousId = rootNode.id
    for (const turn of turns) {
      const owner = ownerOf(id, turn.startSeq, byId, snapshots)
      const nodeId = `${owner}:${turn.startSeq}`
      let node = nodeById.get(nodeId)
      if (node === undefined) {
        node = {
          id: nodeId,
          kind: 'turn',
          sessionId: owner,
          turn: turn.turn,
          startSeq: turn.startSeq,
          endSeq: turn.endSeq,
          parentId: previousId,
          label: turn.prompt === '' ? `第 ${turn.turn} 轮` : turn.prompt,
          prompt: turn.prompt,
          answer: turn.answer,
          time: turn.time,
          order: turn.startSeq,
          ...turn.open === true ? { open: true } : {},
        }
        nodes.push(node)
        nodeById.set(nodeId, node)
      }
      previousId = nodeId
    }
    const ownTurns = turns.filter((turn) => turn.startSeq >= snapshot.inheritedEventCount)
    if (ownTurns.length === 0 && id !== rootId) {
      const stub = blankStub({ record, snapshot, nodes, byId, snapshots, rootNode })
      if (stub !== null && !nodeById.has(stub.id)) {
        nodes.push(stub)
        nodeById.set(stub.id, stub)
      }
    }
  }

  const state = await readState()
  const archived = new Set(ctx.get?.('workspaceRegistry')?.archivedSessionIds ?? [])
  for (const node of nodes) {
    if (node.kind !== 'root' && typeof state.labels[node.id] === 'string') node.label = state.labels[node.id]
  }

  const sessions = family
    .filter((record) => snapshots.has(record.header.id))
    .map((record) => {
      const snapshot = snapshots.get(record.header.id)
      const turns = turnsBySession.get(record.header.id) ?? []
      return {
        id: record.header.id,
        parentSessionId: record.header.parentSession,
        title: titleOf(snapshot.events) || firstPrompt(turns) || shortId(record.header.id),
        createdAt: record.header.createdAt,
        inheritedEventCount: snapshot.inheritedEventCount,
        turnCount: turns.length,
        running: isRunning(ctx, record.header.id),
        blank: turns.length === 0,
        archived: archived.has(record.header.id),
        active: record.header.id === sessionId,
      }
    })

  return {
    ok: true,
    sessionId,
    rootId,
    treeTitle,
    nodes,
    sessions,
    labels: state.labels,
    archivedSessionIds: [...archived],
    errors,
  }
}

/** The topmost surviving ancestor. A missing parent ends the walk at the last known session. */
function rootOf(target, byId) {
  let current = target
  const seen = new Set()
  while (current.header.parentSession !== undefined) {
    if (seen.has(current.header.id)) break
    seen.add(current.header.id)
    const parent = byId.get(current.header.parentSession)
    if (parent === undefined) break
    current = parent
  }
  return current
}

/** Root and every non-subagent descendant, parents before children. */
function familyOf(root, records) {
  const children = new Map()
  for (const record of records) {
    const parent = record.header.parentSession
    if (parent === undefined) continue
    const list = children.get(parent) ?? []
    list.push(record)
    children.set(parent, list)
  }
  const family = []
  const seen = new Set()
  const queue = [root]
  while (queue.length > 0) {
    const record = queue.shift()
    if (seen.has(record.header.id)) continue
    seen.add(record.header.id)
    if (record.header.origin === 'subagent') continue
    family.push(record)
    for (const child of children.get(record.header.id) ?? []) queue.push(child)
  }
  return family
}

/**
 * The session that actually owns one event seq. Below `inheritedEventCount`
 * the child's events are a verbatim copy of the parent's, so the owner is the
 * first ancestor whose own log still contains that seq.
 */
function ownerOf(sessionId, seq, byId, snapshots) {
  let current = sessionId
  const seen = new Set()
  for (;;) {
    if (seen.has(current)) return current
    seen.add(current)
    const snapshot = snapshots.get(current)
    const parentId = byId.get(current)?.header.parentSession
    if (snapshot === undefined || seq >= snapshot.inheritedEventCount) return current
    if (parentId === undefined || !byId.has(parentId) || !snapshots.has(parentId)) return current
    current = parentId
  }
}

/**
 * A forked child that has not asked anything yet is still a branch. Hang it
 * under the turn it was cut from, so the panel can show "新分支 · 等待提问".
 */
function blankStub({ record, snapshot, nodes, byId, snapshots, rootNode }) {
  const cut = snapshot.inheritedEventCount
  let parentNode = rootNode
  for (let index = cut - 1; index >= 0; index--) {
    const event = snapshot.events[index]
    if (event?.type !== 'turn/end') continue
    const owner = ownerOf(record.header.id, event.seq, byId, snapshots)
    const candidate = nodes.find((node) => node.sessionId === owner && node.endSeq === event.seq)
    if (candidate !== undefined) {
      parentNode = candidate
      break
    }
  }
  const ownPrompt = firstOwnPrompt(snapshot.events, cut)
  const last = snapshot.events.at(-1)
  return {
    id: `${record.header.id}:blank`,
    kind: 'blank',
    sessionId: record.header.id,
    turn: 0,
    startSeq: cut,
    endSeq: typeof last?.seq === 'number' ? last.seq : cut,
    parentId: parentNode.id,
    label: ownPrompt === '' ? '新分支' : ownPrompt,
    prompt: ownPrompt,
    answer: '',
    time: last?.time ?? record.header.createdAt,
    order: typeof last?.seq === 'number' ? last.seq : cut,
    blank: true,
    ...ownPrompt === '' ? {} : { open: true },
  }
}

const turnCache = new Map()

/** Parse once per log revision; the tree panel polls while a branch is open. */
function cachedTurns(sessionId, events) {
  const last = events.at(-1)?.seq ?? -1
  const hit = turnCache.get(sessionId)
  if (hit !== undefined && hit.last === last) return hit.turns
  const turns = turnsOf(events)
  turnCache.set(sessionId, { last, turns })
  return turns
}

/** Extract completed and open turns from one log. Prompts are human-authored only. */
function turnsOf(events) {
  const turns = []
  let current = null
  for (const event of events) {
    if (event.type === 'turn/start') {
      current = {
        turn: event.data.turn,
        startSeq: event.seq,
        endSeq: null,
        time: event.time,
        prompt: '',
        answer: '',
        open: true,
      }
      continue
    }
    if (current === null) continue
    if (event.type === 'user/message') {
      if (current.prompt === '' && event.data?.source?.kind === 'user') {
        current.prompt = preview(textOf(event.data.content), 140)
      }
      continue
    }
    if (event.type === 'assistant/message') {
      const text = textOf(event.data?.message?.content)
      if (text !== '') current.answer = preview(text, 220)
      continue
    }
    if (event.type === 'turn/end' && event.data?.turn === current.turn) {
      current.endSeq = event.seq
      current.time = event.time
      current.open = false
      turns.push(current)
      current = null
    }
  }
  if (current !== null) {
    current.endSeq = events.at(-1)?.seq ?? current.startSeq
    turns.push(current)
  }
  return turns
}

function firstOwnPrompt(events, cut) {
  for (const event of events) {
    if (event.seq < cut || event.type !== 'user/message') continue
    if (event.data?.source?.kind !== 'user') continue
    const text = preview(textOf(event.data.content), 140)
    if (text !== '') return text
  }
  return ''
}

function firstPrompt(turns) {
  for (const turn of turns) if (turn.prompt !== '') return turn.prompt
  return ''
}

function titleOf(events) {
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index]
    if (event.type === 'session/title' && typeof event.data?.title === 'string' && event.data.title.trim() !== '') {
      return event.data.title.trim()
    }
  }
  return ''
}

function textOf(content) {
  if (!Array.isArray(content)) return ''
  const parts = []
  for (const block of content) {
    if (block?.type === 'text' && typeof block.text === 'string') parts.push(block.text)
  }
  return collapse(parts.join(' '))
}

function collapse(text) {
  return text.replace(/\s+/g, ' ').trim()
}

function preview(text, limit) {
  const value = collapse(text)
  return value.length <= limit ? value : `${value.slice(0, limit - 1)}…`
}

function shortId(id) {
  return String(id).replace(/^session-/, '').slice(0, 8)
}

function isRunning(ctx, sessionId) {
  try {
    const agent = ctx.get?.('agents')?.get(sessionId)
    return agent?.phase?.kind === 'running'
  } catch {
    return false
  }
}

/* ---------------------------------------------------------- snapshots -- */

const snapshotCache = new Map()

async function readSnapshot(ctx, record) {
  const id = record.header.id
  const live = ctx.sessions.get(id)
  const key = live === undefined ? 'persisted' : `live:${live.seq}`
  const cached = snapshotCache.get(id)
  if (cached !== undefined && cached.key === key && Date.now() - cached.at < SNAPSHOT_TTL_MS) {
    return cached.snapshot
  }
  const snapshot = live === undefined
    ? await ctx.sessionQuery.readSession(id)
    : {
        session: live.header,
        header: live.header,
        inheritedEventCount: live.inheritedEventCount,
        events: live.snapshotEvents(),
      }
  snapshotCache.set(id, { key, at: Date.now(), snapshot })
  return snapshot
}

/* -------------------------------------------------------------- state -- */

let stateQueue = Promise.resolve()

function stateFile() {
  const home = process.env.DSH_HOME || join(homedir(), '.dsh')
  return join(home, 'storages', 'treecom', 'state.json')
}

async function readState() {
  try {
    const parsed = JSON.parse(await readFile(stateFile(), 'utf8'))
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return emptyState()
    const labels = parsed.labels !== null && typeof parsed.labels === 'object' && !Array.isArray(parsed.labels)
      ? parsed.labels
      : {}
    return { version: STATE_VERSION, labels }
  } catch {
    return emptyState()
  }
}

function emptyState() {
  return { version: STATE_VERSION, labels: {} }
}

function updateState(mutate) {
  const run = stateQueue.then(async () => {
    const current = await readState()
    const next = mutate(current)
    const file = stateFile()
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
    return next
  })
  stateQueue = run.catch(() => {})
  return run
}

function normalizeLabel(value) {
  if (typeof value !== 'string') return ''
  return collapse(value).slice(0, LABEL_LIMIT)
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}
