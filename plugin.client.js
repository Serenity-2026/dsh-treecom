/**
 * treecom — Client half.
 *
 * One visible conversation, a tree of its turns. The tree is the only
 * navigation: a leaf click opens that branch, any other click forks at that
 * turn and lands in the new child. The underlying sessions are DSH's normal
 * fork sessions; the panel keeps exactly one of them in the sidebar.
 *
 * Plain JS, React from the page's module table, no build step.
 */
window.__ModuleLoader__.load({
  id: 'treecom',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useRef, useState } = React
    let createPortal = null
    try {
      const ReactDOM = require('react-dom')
      if (ReactDOM !== null && typeof ReactDOM.createPortal === 'function') createPortal = ReactDOM.createPortal
    } catch (error) {
      // The smoke test does not mount a DOM; the real page always has react-dom.
      console.warn('[treecom] react-dom is unavailable; hover details are disabled', error)
    }

    const ROUTE = '/treecom'
    const NS = 'treecom'
    const VIEW_ID = 'treecom'
    const WIDTH_KEY = 'treecom:width:v3'
    const DETAIL_CACHE_MS = 10_000

    /* --------------------------------------------------------- locale -- */

    const ZH = {
      'panel.title': '对话树',
      'panel.hint': '点击节点跳回该轮；悬停查看详情与操作',
      'panel.empty': '还没有分叉。继续提问，树上会自动长出节点。',
      'panel.loading': '正在读取对话树…',
      'panel.error': '读取对话树失败',
      'panel.refresh': '刷新',
      'panel.refreshed': '刷新成功',
      'panel.refreshFailed': '刷新失败：{message}',
      'panel.allArchived': '已归档的分支不显示在树里；在左侧取消归档即可恢复。',
      'panel.close': '关闭',
      'panel.turns': '{n} 轮',
      'panel.branches': '{n} 条分支',
      'panel.partial': '有分支暂时读不到',
      'node.youAreHere': '你在这里',
      'node.blank': '新分支',
      'node.waiting': '等待提问',
      'node.running': '生成中',
      'node.open': '未完成',
      'node.rename': '改名',
      'node.archive': '归档',
      'node.archiveHint': '归档这个分支',
      'node.archivedToast': '已归档',
      'node.renamePlaceholder': '给这个分支起个名字',
      'node.turn': '第 {n} 轮',
      'node.depth': '分支深度 {n}',
      'node.continueHint': '从这一轮分叉',
      'node.jumpHint': '跳转到这一轮',
      'node.collapse': '收起子节点',
      'node.expand': '展开子节点',
      'node.collapsed': '已收起',
      'node.contextLabel': '上下文',
      'node.contextTitle': '上下文 {used} / {window}（{pct}%）',
      'node.contextUnknown': '上下文未知',
      'node.afterShort': '+{n} 轮',
      'node.afterPathTitle': '当前分支之后还有 {n} 轮',
      'node.afterBranchTitle': '这条分支之后最多还有 {n} 轮',
      'node.afterZero': '之后没有更多轮次',
      'node.questionLabel': '提问',
      'node.answerLabel': '回答',
      'node.answerEmpty': '这一轮没有模型回答。',
      'node.detailWaiting': '等待回答…',
      'node.detailLoading': '正在读取完整对话…',
      'node.detailFailed': '详情读取失败：{message}',
      'node.detailTruncated': '内容较长，已截断。',
      'node.jump': '回到这一轮',
      'node.afterLabel': '后续轮数',
      'node.canvasHint': '拖动空白处平移 · 滚轮缩放 · 点击节点查看详情',
      'node.center': '回到当前',
      'node.fit': '居中',
      'node.selectHint': '点击树上的节点查看详情',
      'node.rootDetail': '这是这段对话的起点。',
      'node.hoverHint': '点击查看详情',
      'node.chainHint': '连续 {n} 轮 · 点击展开',
      'node.chainAria': '连续 {n} 轮，点击展开',
      'panel.resize': '拖动调整宽度，向左拖窄可关闭',
      'overlay.showComposer': '显示输入框',
      'overlay.hideComposer': '隐藏输入框',
      'node.leafHint': '切到这条分支',
      'action.branch': '分叉',
      'action.branchHint': '从这一轮分叉，开一条新的对话分支',
      'action.busy': '正在分叉…',
      'header.open': '对话树',
      'view.title': '对话树',
      'path.open': '打开对话树',
      'path.root': '起点',
      'path.siblings': '兄弟分支',
      'notice.forkFailed': '分叉失败：{message}',
      'notice.switchFailed': '切换分支失败：{message}',
      'notice.running': '当前分支还在生成，等这一轮结束再切换。',
      'notice.busyFork': '这一轮还在生成，等它结束再分叉。',
      'notice.noService': '这个环境缺少会话服务，无法分叉。',
      'notice.noAccess': '没有分叉这个会话的权限。',
      'notice.renameFailed': '改名失败：{message}',
      'notice.archiveFailed': '归档失败：{message}',
    }

    const EN = {
      'panel.title': 'Conversation tree',
      'panel.hint': 'Click a node to return to that turn; hover for details and actions',
      'panel.empty': 'No branches yet. Keep asking and the tree grows by itself.',
      'panel.loading': 'Reading the conversation tree…',
      'panel.error': 'Could not read the conversation tree',
      'panel.refresh': 'Refresh',
      'panel.refreshed': 'Refreshed',
      'panel.refreshFailed': 'Refresh failed: {message}',
      'panel.allArchived': 'Archived branches are hidden from the tree; unarchive one in the sidebar to bring it back.',
      'panel.close': 'Close',
      'panel.turns': '{n} turns',
      'panel.branches': '{n} branches',
      'panel.partial': 'Some branches could not be read',
      'node.youAreHere': 'You are here',
      'node.blank': 'New branch',
      'node.waiting': 'Waiting for a question',
      'node.running': 'Generating',
      'node.open': 'Open',
      'node.rename': 'Rename',
      'node.archive': 'Archive',
      'node.archiveHint': 'Archive this branch',
      'node.archivedToast': 'Archived',
      'node.renamePlaceholder': 'Name this branch',
      'node.turn': 'Turn {n}',
      'node.depth': 'Branch depth {n}',
      'node.continueHint': 'Branch from this turn',
      'node.jumpHint': 'Jump to this turn',
      'node.collapse': 'Collapse children',
      'node.expand': 'Expand children',
      'node.collapsed': 'Collapsed',
      'node.contextLabel': 'Context',
      'node.contextTitle': 'Context {used} / {window} ({pct}%)',
      'node.contextUnknown': 'Context unknown',
      'node.afterShort': '+{n} turns',
      'node.afterPathTitle': '{n} turns after this on the current branch',
      'node.afterBranchTitle': 'Up to {n} turns after this on this branch',
      'node.afterZero': 'No more turns after this',
      'node.questionLabel': 'Question',
      'node.answerLabel': 'Answer',
      'node.answerEmpty': 'No answer for this turn yet.',
      'node.detailWaiting': 'Waiting for an answer…',
      'node.detailLoading': 'Reading the full conversation…',
      'node.detailFailed': 'Could not read details: {message}',
      'node.detailTruncated': 'Long content truncated.',
      'node.jump': 'Go to this turn',
      'node.afterLabel': 'Turns after',
      'node.canvasHint': 'Drag blank space to pan · scroll to zoom · click a node for details',
      'node.center': 'Center current',
      'node.fit': 'Center',
      'node.selectHint': 'Click a node in the tree to see its details',
      'node.rootDetail': 'This is where the conversation starts.',
      'node.hoverHint': 'Click for details',
      'node.chainHint': '{n} turns · click to expand',
      'node.chainAria': '{n} consecutive turns; click to expand',
      'panel.resize': 'Drag to resize; drag narrow to close',
      'overlay.showComposer': 'Show input',
      'overlay.hideComposer': 'Hide input',
      'node.leafHint': 'Switch to this branch',
      'action.branch': 'Branch',
      'action.branchHint': 'Branch from this turn into a new conversation branch',
      'action.busy': 'Branching…',
      'header.open': 'Conversation tree',
      'view.title': 'Conversation tree',
      'path.open': 'Open the conversation tree',
      'path.root': 'Start',
      'path.siblings': 'Sibling branches',
      'notice.forkFailed': 'Branch failed: {message}',
      'notice.switchFailed': 'Could not switch branch: {message}',
      'notice.running': 'This branch is still generating; wait for the turn to finish.',
      'notice.busyFork': 'This turn is still generating; wait for it to finish before branching.',
      'notice.noService': 'Session services are unavailable here, so branching is disabled.',
      'notice.noAccess': 'This session cannot be forked.',
      'notice.renameFailed': 'Rename failed: {message}',
      'notice.archiveFailed': 'Archive failed: {message}',
    }

    let appCtx = null
    let translate = (key) => (ZH[key] ?? key)

    function fmt(template, vars) {
      return String(template).replace(/\{(\w+)\}/g, (match, key) => (
        Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match
      ))
    }

    const numberFormatter = new Intl.NumberFormat()
    function formatNumber(value) {
      return Number.isFinite(value) ? numberFormatter.format(value) : '0'
    }

    function formatTime(value) {
      if (typeof value !== 'string' || value === '') return ''
      const date = new Date(value)
      return Number.isNaN(date.getTime()) ? '' : date.toLocaleString()
    }

    const detailCache = new Map()

    async function fetchDetail(nodeId) {
      const response = await fetch(ROUTE, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'detail', nodeId }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok || body?.ok !== true) throw new Error(body?.error ?? `HTTP ${response.status}`)
      return body.detail
    }

    function detailPosition(rect) {
      const width = Math.min(360, Math.max(240, window.innerWidth - 24))
      const gap = 12
      const top = Math.max(8, Math.min(rect.top, window.innerHeight - 240))
      const maxHeight = Math.max(200, Math.min(520, window.innerHeight - top - 8))
      let left = rect.left - width - gap
      if (left < 8) left = rect.right + gap
      left = Math.max(8, Math.min(left, window.innerWidth - width - 8))
      return { left, top, width, maxHeight }
    }

    /* ----------------------------------------------------------- data -- */

    const inflight = new Map()
    const treeDataCache = new Map()

    function fetchTree(sessionId) {
      const existing = inflight.get(sessionId)
      if (existing !== undefined) return existing
      const promise = (async () => {
        const response = await fetch(`${ROUTE}?sessionId=${encodeURIComponent(sessionId)}`, { cache: 'no-store' })
        const body = await response.json().catch(() => null)
        if (!response.ok || body === null || body.ok !== true) {
          throw new Error(body !== null && typeof body.error === 'string' ? body.error : `HTTP ${response.status}`)
        }
        return body
      })()
      inflight.set(sessionId, promise)
      promise.finally(() => {
        if (inflight.get(sessionId) === promise) inflight.delete(sessionId)
      }).catch(() => {})
      return promise
    }

    function refreshAll() {
      treeDataCache.clear()
      try {
        window.dispatchEvent(new Event('treecom:refresh'))
      } catch {
        /* a page without CustomEvent/Event is not a real client */
      }
    }

    function sessionRevision(sessions) {
      if (sessions === null || sessions === undefined) return null
      const values = sessions instanceof Map ? [...sessions.values()] : Object.values(sessions)
      const parts = []
      for (const session of values) {
        if (session === null || session === undefined) continue
        const id = String(session.id ?? '')
        if (session.running === true) parts.push(`${id}:running`)
        else parts.push(`${id}:${session.updatedAt ?? ''}:${session.title ?? ''}:${session.blank === true ? 'blank' : ''}`)
      }
      parts.sort()
      return parts.join('|')
    }

    function useTree(sessionId, liveRevision, liveRunning) {
      const cachedAtMount = treeDataCache.get(sessionId)
      const [state, setState] = useState(cachedAtMount !== undefined
        ? { sessionId, loading: false, data: cachedAtMount.data, error: null }
        : { sessionId, loading: true, data: null, error: null })
      const generation = useRef(0)
      const revisionRef = useRef(liveRevision)
      useEffect(() => {
        revisionRef.current = liveRevision
      }, [liveRevision])
      const reload = useCallback(async () => {
        const token = generation.current
        try {
          const data = await fetchTree(sessionId)
          treeDataCache.set(sessionId, { data, revision: revisionRef.current })
          if (generation.current === token) setState({ sessionId, loading: false, data, error: null })
          return data
        } catch (error) {
          if (generation.current === token) {
            setState((previous) => ({
              sessionId,
              loading: false,
              data: previous.sessionId === sessionId ? previous.data : (treeDataCache.get(sessionId)?.data ?? null),
              error: noticeText(error),
            }))
          }
          throw error
        }
      }, [sessionId])
      useEffect(() => {
        generation.current += 1
        const cached = treeDataCache.get(sessionId)
        if (cached !== undefined) {
          setState({ sessionId, loading: false, data: cached.data, error: null })
          if (liveRevision !== null && liveRevision !== undefined && cached.revision !== liveRevision) {
            reload().catch(() => {})
          }
        } else {
          reload().catch(() => {})
        }
        const onRefresh = () => { reload().catch(() => {}) }
        window.addEventListener('treecom:refresh', onRefresh)
        const runningTimer = liveRunning === true
          ? setInterval(() => { reload().catch(() => {}) }, 5_000)
          : null
        return () => {
          generation.current += 1
          window.removeEventListener('treecom:refresh', onRefresh)
          if (runningTimer !== null) clearInterval(runningTimer)
        }
      }, [sessionId, liveRevision, liveRunning, reload])
      const visible = state.sessionId === sessionId
        ? state
        : (cachedAtMount !== undefined
            ? { sessionId, loading: false, data: cachedAtMount.data, error: null }
            : { sessionId, loading: true, data: null, error: null })
      return { ...visible, reload }
    }

    function indexOf(data) {
      const byId = new Map()
      const children = new Map()
      const leaves = new Map()
      for (const node of data.nodes) {
        byId.set(node.id, node)
        if (node.parentId === null || node.parentId === undefined) continue
        const list = children.get(node.parentId) ?? []
        list.push(node)
        children.set(node.parentId, list)
      }
      for (const list of children.values()) list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      for (const node of data.nodes) {
        if (node.kind === 'root') continue
        const previous = leaves.get(node.sessionId)
        if (previous === undefined || (node.order ?? 0) >= (previous.order ?? 0)) leaves.set(node.sessionId, node)
      }
      const leaf = leaves.get(data.sessionId) ?? null
      const path = new Set()
      const chain = []
      const seen = new Set()
      let cursor = leaf
      while (cursor !== null && cursor !== undefined && !seen.has(cursor.id)) {
        seen.add(cursor.id)
        path.add(cursor.id)
        chain.unshift(cursor)
        cursor = byId.get(cursor.parentId)
      }
      const roots = data.nodes.filter((node) => node.parentId === null || node.parentId === undefined)
      const sessionById = new Map(data.sessions.map((session) => [session.id, session]))
      return { byId, children, leaves, leaf, path, chain, roots, sessionById }
    }

    function buildDisplayIndex(index, hiddenIds, expandedChains) {
      const display = new Map()
      const chainByRep = new Map()
      const chainByMember = new Map()
      const visibleChildren = (node) => (index.children.get(node.id) ?? []).filter((child) => hiddenIds.has(child.id) !== true)
      const addNode = (node, parentId) => {
        display.set(node.id, { ...node, parentId })
      }
      const addSubtree = (node, parentId) => {
        const children = visibleChildren(node)
        if (node.kind !== 'root' && children.length === 1) {
          const members = [node]
          let current = node
          while (visibleChildren(current).length === 1) {
            current = visibleChildren(current)[0]
            members.push(current)
          }
          const key = `${members[0].id}~${current.id}`
          if (expandedChains.has(key) !== true) {
            addNode(current, parentId)
            for (const child of visibleChildren(current)) addSubtree(child, current.id)
            chainByRep.set(current.id, { key, count: members.length, startId: members[0].id, endId: current.id })
            for (const member of members.slice(0, -1)) chainByMember.set(member.id, current.id)
            return
          }
          let previous = parentId
          for (const member of members) {
            addNode(member, previous)
            previous = member.id
          }
          for (const child of visibleChildren(current)) addSubtree(child, current.id)
          return
        }
        addNode(node, parentId)
        for (const child of children) addSubtree(child, node.id)
      }
      for (const root of index.roots) {
        if (hiddenIds.has(root.id)) continue
        addSubtree(root, root.parentId ?? null)
      }
      const byId = new Map(display)
      const children = new Map()
      for (const node of display.values()) {
        if (node.parentId === null || node.parentId === undefined) continue
        const list = children.get(node.parentId) ?? []
        list.push(node)
        children.set(node.parentId, list)
      }
      for (const list of children.values()) list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      const leaves = new Map()
      for (const node of display.values()) {
        if (node.kind === 'root') continue
        const previous = leaves.get(node.sessionId)
        if (previous === undefined || (node.order ?? 0) >= (previous.order ?? 0)) leaves.set(node.sessionId, node)
      }
      const sessionId = index.leaf?.sessionId ?? null
      const leaf = sessionId === null ? null : (leaves.get(sessionId) ?? null)
      const path = new Set()
      const chain = []
      const seen = new Set()
      let cursor = leaf
      while (cursor !== null && cursor !== undefined && !seen.has(cursor.id)) {
        seen.add(cursor.id)
        path.add(cursor.id)
        chain.unshift(cursor)
        cursor = byId.get(cursor.parentId)
      }
      const roots = [...display.values()].filter((node) => node.parentId === null || node.parentId === undefined)
      return { byId, children, leaves, leaf, path, chain, roots, sessionById: index.sessionById, chainByRep, chainByMember }
    }

    /* -------------------------------------------------------- actions -- */

    const pending = { panelSession: null, focusSession: null }
    let selectionIntent = null
    const EMPTY_ARCHIVED = Object.freeze([])
    const selectArchived = (snapshot) => (
      snapshot !== undefined && snapshot !== null && Array.isArray(snapshot.archivedSessionIds)
        ? snapshot.archivedSessionIds
        : EMPTY_ARCHIVED
    )
    const selectSessionById = (snapshot) => (
      snapshot !== undefined && snapshot !== null && snapshot.byId !== undefined ? snapshot.byId : null
    )

    const overlay = { open: false, closing: false, sessionId: null, listeners: new Set() }
    let overlayCloseTimer = null

    function notifyOverlay() {
      for (const listener of [...overlay.listeners]) {
        try {
          listener()
        } catch (error) {
          console.warn('[treecom] overlay listener failed', error)
        }
      }
    }

    /** The panel is a self-contained frame overlay, so it never depends on the right sidebar. */
    function openPanel(sessionId) {
      if (overlayCloseTimer !== null) {
        clearTimeout(overlayCloseTimer)
        overlayCloseTimer = null
      }
      if (typeof sessionId === 'string' && sessionId.length > 0) overlay.sessionId = sessionId
      overlay.open = true
      overlay.closing = false
      notifyOverlay()
      return true
    }

    function closePanel() {
      if (!overlay.open || overlay.closing) return
      overlay.closing = true
      notifyOverlay()
      overlayCloseTimer = setTimeout(() => {
        overlayCloseTimer = null
        overlay.open = false
        overlay.closing = false
        notifyOverlay()
      }, 230)
    }

    /** Keep an open panel pointed at whichever branch is on screen now. */
    function syncOverlaySession(sessionId) {
      if (!overlay.open || overlay.sessionId === sessionId) return
      overlay.sessionId = sessionId
      notifyOverlay()
    }

    function useOverlay() {
      const [, bump] = useState(0)
      useEffect(() => {
        const listener = () => bump((value) => value + 1)
        overlay.listeners.add(listener)
        return () => overlay.listeners.delete(listener)
      }, [])
      return overlay
    }

    async function switchTo(targetId, focus) {
      const workspace = appCtx?.get('uiWorkspace')
      if (!workspace) throw new Error(translate('notice.noService'))
      if (focus === true) pending.focusSession = targetId
      try {
        await workspace.unarchiveSession(targetId)
      } catch {
        /* already visible */
      }
      workspace.openSession(targetId)
      refreshAll()
    }

    async function forkAt(node) {
      const sessions = appCtx?.get('sessions')
      const workspace = appCtx?.get('uiWorkspace')
      if (!sessions || !workspace) throw new Error(translate('notice.noService'))
      if (!Number.isSafeInteger(node.endSeq)) throw new Error(translate('notice.busyFork'))
      const childId = await sessions.fork({
        sessionId: node.sessionId,
        atSeq: node.endSeq,
        increaseTitle: true,
      })
      pending.panelSession = childId
      pending.focusSession = childId
      selectionIntent = { sessionId: childId, nodeId: null }
      try {
        await workspace.unarchiveSession(childId)
      } catch {
        /* a fresh child is normally visible already */
      }
      workspace.openSession(childId)
      refreshAll()
      return childId
    }

    /* ----------------------------------------------------------- bits -- */

    function Icon({ name, size = 14 }) {
      const common = {
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.5,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true,
      }
      switch (name) {
        case 'tree':
          return h('svg', common,
            h('path', { d: 'M8 3v4.2M8 7.2c0 2-3 2.2-3 4.2V13M8 7.2c0 2 3 2.2 3 4.2V13' }),
            h('circle', { cx: 8, cy: 2.6, r: 1.4 }),
            h('circle', { cx: 5, cy: 13.4, r: 1.4 }),
            h('circle', { cx: 11, cy: 13.4, r: 1.4 }))
        case 'plus':
          return h('svg', common, h('path', { d: 'M8 3.5v9M3.5 8h9' }))
        case 'pencil':
          return h('svg', common, h('path', { d: 'M10.8 2.9l2.3 2.3-7.3 7.3-3 .7.7-3 7.3-7.3z' }))
        case 'refresh':
          return h('svg', common, h('path', { d: 'M13 8a5 5 0 1 1-1.5-3.6M13 3v3.5H9.5' }))
        case 'left':
          return h('svg', common, h('path', { d: 'M9.5 3.5L5 8l4.5 4.5' }))
        case 'right':
          return h('svg', common, h('path', { d: 'M6.5 3.5L11 8l-4.5 4.5' }))
        case 'down':
          return h('svg', common, h('path', { d: 'M3.5 6.5L8 11l4.5-4.5' }))
        case 'x':
          return h('svg', common, h('path', { d: 'M4 4l8 8M12 4l-8 8' }))
        case 'archive':
          return h('svg', common, h('path', { d: 'M2.5 3.5h11v2.2h-11zM4 5.7v6.8h8V5.7M6.3 8.2h3.4' }))
        case 'dot':
          return h('svg', common, h('circle', { cx: 8, cy: 8, r: 2.4, fill: 'currentColor', stroke: 'none' }))
        default:
          return null
      }
    }

    function IconButton({ label, name, onClick, disabled, className, spinning }) {
      return h('button', {
        type: 'button',
        className: `tc-icon-btn${className === undefined ? '' : ` ${className}`}`,
        'aria-label': label,
        title: label,
        disabled: disabled === true,
        'data-spinning': spinning === true ? 'true' : undefined,
        onClick,
      }, h(Icon, { name }))
    }

    function noticeText(error) {
      return error instanceof Error ? error.message : String(error)
    }

    /* ----------------------------------------------------- turn jump -- */

    /**
     * Land the Chat view on one Turn. The host's own turn rail is the only
     * public control that can load and scroll a turn that is not mounted; a
     * loaded row is the fallback. Polls because the Chat view mounts after a
     * session switch and virtualization removes off-screen turns.
     */
    function jumpToTurn(turn, attempt = 0) {
      if (!Number.isSafeInteger(turn) || turn <= 0 || typeof document === 'undefined') return
      const marks = document.querySelectorAll('button[data-index][aria-label]')
      for (const mark of marks) {
        const match = /(\d+)/.exec(mark.getAttribute('aria-label') || '')
        if (match !== null && Number(match[1]) === turn) {
          mark.click()
          return
        }
      }
      const row = document.querySelector(`[data-chat-turn="${turn}"]`)
      if (row !== null) {
        row.scrollIntoView({ block: 'center', behavior: 'smooth' })
        return
      }
      if (attempt < 24) setTimeout(() => jumpToTurn(turn, attempt + 1), 120)
    }

    /* ------------------------------------------------------ tree card -- */

    function NodeCard(props) {
      const { node, activeId, onPath, isLeaf, running, busy, archived, canFork, hasChildren, collapsed, onToggle, onActivate, onFork, onRename, onArchive, after, afterOnPath } = props
      const [renaming, setRenaming] = useState(false)
      const [value, setValue] = useState(node.label)
      const [hovered, setHovered] = useState(false)
      const [detail, setDetail] = useState(null)
      const [detailError, setDetailError] = useState(null)
      const [detailLoading, setDetailLoading] = useState(false)
      const [pos, setPos] = useState(null)
      const cancelled = useRef(false)
      const suppressClick = useRef(false)
      const inputRef = useRef(null)
      const cardRef = useRef(null)
      const openTimer = useRef(null)
      const closeTimer = useRef(null)
      const detailToken = useRef(0)

      useEffect(() => {
        if (renaming && inputRef.current !== null) {
          inputRef.current.focus()
          inputRef.current.select()
        }
      }, [renaming])

      useEffect(() => {
        setValue(node.label)
      }, [node.label])

      useEffect(() => () => {
        if (openTimer.current !== null) clearTimeout(openTimer.current)
        if (closeTimer.current !== null) clearTimeout(closeTimer.current)
        detailToken.current += 1
      }, [])

      const closeDetail = (immediate = false) => {
        if (openTimer.current !== null) clearTimeout(openTimer.current)
        if (closeTimer.current !== null) clearTimeout(closeTimer.current)
        if (immediate) {
          detailToken.current += 1
          setHovered(false)
          setDetail(null)
          setDetailError(null)
          setDetailLoading(false)
          return
        }
        closeTimer.current = setTimeout(() => {
          closeTimer.current = null
          detailToken.current += 1
          setHovered(false)
          setDetail(null)
          setDetailError(null)
          setDetailLoading(false)
        }, 180)
      }

      const keepDetail = () => {
        if (openTimer.current !== null) clearTimeout(openTimer.current)
        if (closeTimer.current !== null) clearTimeout(closeTimer.current)
      }

      const openDetail = () => {
        if (renaming) return
        if (closeTimer.current !== null) clearTimeout(closeTimer.current)
        if (openTimer.current !== null) clearTimeout(openTimer.current)
        if (hovered) {
          const card = cardRef.current
          if (card !== null) setPos(detailPosition(card.getBoundingClientRect()))
          return
        }
        openTimer.current = setTimeout(() => {
          openTimer.current = null
          const card = cardRef.current
          if (card === null) return
          setPos(detailPosition(card.getBoundingClientRect()))
          setHovered(true)
          const token = ++detailToken.current
          const cached = detailCache.get(node.id)
          if (cached !== undefined && Date.now() - cached.at < DETAIL_CACHE_MS) {
            setDetail(cached.detail)
            setDetailError(null)
            setDetailLoading(false)
            return
          }
          setDetail(null)
          setDetailError(null)
          setDetailLoading(true)
          fetchDetail(node.id).then((nextDetail) => {
            if (detailToken.current !== token) return
            detailCache.set(node.id, { at: Date.now(), detail: nextDetail })
            setDetail(nextDetail)
            setDetailLoading(false)
          }).catch((error) => {
            if (detailToken.current !== token) return
            setDetailError(noticeText(error))
            setDetailLoading(false)
          })
        }, 180)
      }

      useEffect(() => {
        if (!hovered) return undefined
        const updatePosition = () => {
          const card = cardRef.current
          if (card === null) return
          const rect = card.getBoundingClientRect()
          if (rect.bottom < 0 || rect.top > window.innerHeight) {
            closeDetail(true)
            return
          }
          setPos(detailPosition(rect))
        }
        const onKeyDown = (event) => {
          if (event.key === 'Escape') closeDetail(true)
        }
        window.addEventListener('scroll', updatePosition, true)
        window.addEventListener('resize', updatePosition)
        window.addEventListener('keydown', onKeyDown)
        return () => {
          window.removeEventListener('scroll', updatePosition, true)
          window.removeEventListener('resize', updatePosition)
          window.removeEventListener('keydown', onKeyDown)
        }
      }, [hovered])

      const submit = () => {
        suppressClick.current = true
        setTimeout(() => { suppressClick.current = false }, 0)
        if (cancelled.current) {
          cancelled.current = false
          setRenaming(false)
          setValue(node.label)
          return
        }
        setRenaming(false)
        const next = value.trim()
        if (next !== '' && next !== node.label) onRename(node, next)
      }

      const mode = node.kind === 'blank'
        ? translate('node.blank')
        : isLeaf
          ? translate('node.leafHint')
          : translate('node.jumpHint')

      const question = node.prompt !== undefined && node.prompt !== ''
        ? node.prompt
        : (node.kind === 'blank' ? translate('node.blank') : node.label)
      const contextWindow = Number(node.contextWindow)
      const contextTokens = Number(node.contextTokens)
      const hasContext = Number.isFinite(contextWindow) && contextWindow > 0
      const usedContext = Number.isFinite(contextTokens) && contextTokens > 0 ? contextTokens : 0
      const contextPct = hasContext
        ? Math.max(0, Math.min(100, Math.round((usedContext / contextWindow) * 100)))
        : null
      const contextTitle = hasContext
        ? fmt(translate('node.contextTitle'), {
            used: formatNumber(usedContext),
            window: formatNumber(contextWindow),
            pct: contextPct,
          })
        : translate('node.contextUnknown')
      const afterCount = Number.isFinite(after) ? Math.max(0, after) : 0
      const afterTitle = afterCount === 0
        ? translate('node.afterZero')
        : fmt(afterOnPath === true ? translate('node.afterPathTitle') : translate('node.afterBranchTitle'), { n: afterCount })

      const classes = [
        'tc-card',
        node.kind === 'blank' ? 'tc-card--blank' : '',
        node.id === activeId ? 'tc-card--active' : '',
        onPath ? 'tc-card--path' : '',
        running ? 'tc-card--running' : '',
        busy ? 'tc-card--busy' : '',
      ].filter(Boolean).join(' ')

      const badges = []
      if (node.id === activeId) {
        badges.push(h('span', { key: 'here', className: 'tc-badge tc-badge--here' }, translate('node.youAreHere')))
      }
      if (node.open === true) {
        badges.push(h('span', { key: 'open', className: 'tc-badge tc-badge--open' }, translate('node.open')))
      }
      if (running) {
        badges.push(h('span', { key: 'running', className: 'tc-badge tc-badge--running' }, translate('node.running')))
      }

      const status = h('div', {
        className: 'tc-status',
        title: `${contextTitle} · ${afterTitle}`,
      },
        h('div', { className: 'tc-ctx' },
          h('div', { className: 'tc-ctx-top' },
            h('span', { className: 'tc-ctx-label' }, translate('node.contextLabel')),
            h('span', { className: 'tc-ctx-pct' }, contextPct === null ? '—' : `${contextPct}%`)),
          h('div', {
            className: `tc-ctx-bar${contextPct !== null && contextPct >= 90 ? ' tc-ctx-bar--error' : contextPct !== null && contextPct >= 70 ? ' tc-ctx-bar--warn' : ''}`,
          }, h('span', { style: { width: `${contextPct ?? 0}%` } }))),
        h('span', { className: `tc-after${afterCount === 0 ? ' tc-after--none' : ''}` }, fmt(translate('node.afterShort'), { n: afterCount })))

      const detailActions = h('div', { className: 'tc-detail-actions' },
        archived ? null : h('button', {
          key: 'archive',
          type: 'button',
          className: 'tc-mini-btn',
          title: running ? translate('node.running') : translate('node.archiveHint'),
          disabled: running,
          onClick: (event) => {
            event.stopPropagation()
            closeDetail(true)
            onArchive(node.sessionId)
          },
        }, h(Icon, { name: 'archive', size: 12 }), h('span', null, translate('node.archive'))),
        h('button', {
          key: 'rename',
          type: 'button',
          className: 'tc-mini-btn',
          title: translate('node.rename'),
          onClick: (event) => {
            event.stopPropagation()
            closeDetail(true)
            setValue(node.label)
            setRenaming(true)
          },
        }, h(Icon, { name: 'pencil', size: 12 }), h('span', null, translate('node.rename'))),
        node.kind === 'blank' ? null : h('button', {
          key: 'fork',
          type: 'button',
          className: 'tc-mini-btn',
          title: running ? translate('node.running') : canFork !== true ? translate('notice.noAccess') : translate('action.branchHint'),
          disabled: running === true || canFork !== true,
          onClick: (event) => {
            event.stopPropagation()
            closeDetail(true)
            onFork(node)
          },
        }, h(Icon, { name: 'plus', size: 12 }), h('span', null, translate('action.branch'))))

      const fullQuestion = detail?.prompt !== undefined && detail.prompt !== '' ? detail.prompt : question
      const fullAnswer = detail?.answer ?? ''
      const detailMeta = []
      const timeText = formatTime(node.time)
      if (timeText !== '') detailMeta.push(h('span', { key: 'time' }, timeText))
      detailMeta.push(h('span', { key: 'context' }, contextTitle))
      detailMeta.push(h('span', { key: 'after' }, afterTitle))

      const detailNode = hovered && pos !== null && createPortal !== null && typeof document !== 'undefined'
        ? createPortal(h('div', {
            className: 'tc-detail',
            role: 'dialog',
            'aria-label': question,
            style: {
              left: `${pos.left}px`,
              top: `${pos.top}px`,
              width: `${pos.width}px`,
              maxHeight: `${pos.maxHeight}px`,
            },
            onMouseEnter: keepDetail,
            onMouseLeave: () => closeDetail(),
            onFocus: keepDetail,
            onBlur: (event) => {
              if (event.relatedTarget === null || !event.currentTarget.contains(event.relatedTarget)) closeDetail()
            },
          },
            h('div', { className: 'tc-detail-head' },
              h('div', { className: 'tc-detail-title' }, node.kind === 'blank' ? translate('node.blank') : fmt(translate('node.turn'), { n: node.turn })),
              node.label !== question ? h('div', { className: 'tc-detail-name' }, node.label) : null),
            h('div', { className: 'tc-detail-meta' }, detailMeta),
            h('div', { className: 'tc-detail-section' },
              h('div', { className: 'tc-detail-label' }, translate('node.questionLabel')),
              h('div', { className: 'tc-detail-text' }, fullQuestion === '' ? translate('node.waiting') : fullQuestion)),
            h('div', { className: 'tc-detail-section' },
              h('div', { className: 'tc-detail-label' }, translate('node.answerLabel')),
              detailLoading
                ? h('div', { className: 'tc-detail-loading' }, translate('node.detailLoading'))
                : detailError !== null
                  ? h('div', { className: 'tc-detail-error' }, fmt(translate('node.detailFailed'), { message: detailError }))
                  : h('div', { className: 'tc-detail-text' }, fullAnswer !== ''
                      ? fullAnswer
                      : (node.open === true ? translate('node.detailWaiting') : translate('node.answerEmpty')))),
            detail?.truncated === true ? h('div', { className: 'tc-detail-note' }, translate('node.detailTruncated')) : null,
            detailActions),
          document.body)
        : null

      return h(React.Fragment, null,
        h('div', {
          ref: cardRef,
          className: classes,
          style: { paddingLeft: '34px' },
          role: 'treeitem',
          tabIndex: 0,
          'aria-label': question,
          title: mode,
          onMouseEnter: openDetail,
          onMouseLeave: () => closeDetail(),
          onFocus: () => { if (!renaming) openDetail() },
          onBlur: () => closeDetail(),
          onClick: () => {
            if (suppressClick.current || renaming) return
            closeDetail(true)
            onActivate(node)
          },
          onKeyDown: (event) => {
            if (event.target !== null && (event.target.tagName === 'INPUT' || event.target.tagName === 'BUTTON')) return
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              closeDetail(true)
              onActivate(node)
            }
          },
        },
          hasChildren
            ? h('button', {
                type: 'button',
                className: 'tc-card-rail',
                title: collapsed ? translate('node.expand') : translate('node.collapse'),
                'aria-label': collapsed ? translate('node.expand') : translate('node.collapse'),
                'aria-expanded': collapsed !== true,
                onClick: (event) => {
                  event.stopPropagation()
                  onToggle(node.id)
                },
              }, h(Icon, { name: collapsed ? 'right' : 'down', size: 14 }))
            : h('span', { className: 'tc-card-rail tc-card-rail--empty' }),
          h('div', { className: 'tc-card-body' },
            h('div', { className: 'tc-card-main' },
              h('div', { className: 'tc-card-head' },
                h('span', { className: 'tc-card-label' }, renaming
                  ? h('input', {
                      ref: inputRef,
                      className: 'tc-rename',
                      value,
                      placeholder: translate('node.renamePlaceholder'),
                      onClick: (event) => event.stopPropagation(),
                      onChange: (event) => setValue(event.target.value),
                      onKeyDown: (event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          event.stopPropagation()
                          submit()
                        } else if (event.key === 'Escape') {
                          event.preventDefault()
                          event.stopPropagation()
                          cancelled.current = true
                          suppressClick.current = true
                          setTimeout(() => { suppressClick.current = false }, 0)
                          setRenaming(false)
                          setValue(node.label)
                        }
                      },
                      onBlur: submit,
                    })
                  : h('span', { className: 'tc-card-label-text' }, question))),
              badges.length > 0 ? h('div', { className: 'tc-card-badges' }, badges) : null),
            status)),
        detailNode)
    }


    /* ---------------------------------------------------- canvas tree -- */

    function contextInfo(node) {
      const contextWindow = Number(node?.contextWindow)
      const contextTokens = Number(node?.contextTokens)
      const hasContext = Number.isFinite(contextWindow) && contextWindow > 0 && Number.isFinite(contextTokens) && contextTokens >= 0
      return {
        contextWindow,
        contextTokens,
        hasContext,
        contextPct: hasContext ? Math.max(0, Math.min(100, Math.round((contextTokens / contextWindow) * 100))) : null,
      }
    }

    /**
     * Tidy tree, drawn vertically from top to bottom: the root sits at the
     * top, siblings spread left to right, and the canvas itself can be
     * panned and zoomed without bounds.
     */
    function layoutTree(index, hiddenIds) {
      const positions = new Map()
      const edges = []
      const leafGap = 148
      const levelGap = 92
      const padding = 56
      let cursor = 0
      let maxDepth = 0
      const walk = (node, depth) => {
        const children = (index.children.get(node.id) ?? []).filter((child) => hiddenIds.has(child.id) !== true)
        let x
        if (children.length === 0) {
          x = padding + cursor * leafGap
          cursor += 1
        } else {
          const childXs = []
          for (const child of children) {
            const childPosition = walk(child, depth + 1)
            childXs.push(childPosition.x)
            edges.push([node.id, child.id])
          }
          x = childXs[0] + (childXs[childXs.length - 1] - childXs[0]) / 2
        }
        const y = padding + depth * levelGap
        const position = { x, y, depth }
        positions.set(node.id, position)
        if (depth > maxDepth) maxDepth = depth
        return position
      }
      for (const root of index.roots) {
        if (hiddenIds.has(root.id)) continue
        walk(root, 0)
      }
      const leafCount = Math.max(1, cursor)
      const width = padding * 2 + Math.max(0, leafCount - 1) * leafGap
      const height = padding * 2 + maxDepth * levelGap
      return { positions, edges, width: Math.max(160, width), height: Math.max(160, height) }
    }

    /* ------------------------------------------------------ markdown -- */

    function markdownInline(text, keyPrefix) {
      const source = String(text ?? '')
      const pattern = /(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|\*[^*\n]+\*|_[^_\n]+_|\[[^\]\n]+\]\([^)\s]+\))/g
      const nodes = []
      let last = 0
      let index = 0
      let match
      while ((match = pattern.exec(source)) !== null) {
        if (match.index > last) nodes.push(source.slice(last, match.index))
        const token = match[0]
        const key = `${keyPrefix}-i${index++}`
        if (token.startsWith('`')) {
          nodes.push(h('code', { key }, token.slice(1, -1)))
        } else if (token.startsWith('**') || token.startsWith('__')) {
          nodes.push(h('strong', { key }, markdownInline(token.slice(2, -2), key)))
        } else if (token.startsWith('~~')) {
          nodes.push(h('del', { key }, markdownInline(token.slice(2, -2), key)))
        } else if (token.startsWith('*') || token.startsWith('_')) {
          nodes.push(h('em', { key }, markdownInline(token.slice(1, -1), key)))
        } else {
          const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token)
          if (link !== null) {
            const href = /^(https?:|mailto:|#|\/)/i.test(link[2]) ? link[2] : '#'
            nodes.push(h('a', { key, href, target: '_blank', rel: 'noreferrer noopener' }, markdownInline(link[1], key)))
          } else {
            nodes.push(token)
          }
        }
        last = match.index + token.length
      }
      if (last < source.length) nodes.push(source.slice(last))
      return nodes.length > 0 ? nodes : [source]
    }

    function tableCells(line) {
      return line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((cell) => cell.trim())
    }

    function tableSeparator(line) {
      const cells = tableCells(line)
      return cells.length > 0 && cells.every((cell) => /^:?-{2,}:?$/.test(cell))
    }

    function markdownBlocks(source) {
      const lines = String(source ?? '').replace(/\r\n?/g, '\n').split('\n')
      const blocks = []
      let i = 0
      let key = 0
      const nextKey = () => `md-${key++}`
      const isBlockStart = (line) => /^\s*(```|#{1,6}\s|>|([-*+]|\d+\.)\s|---+|\*\*\*+|___+)/.test(line)
      while (i < lines.length) {
        const line = lines[i]
        if (/^\s*$/.test(line)) {
          i += 1
          continue
        }
        const fence = /^\s*```(\S*)\s*$/.exec(line)
        if (fence !== null) {
          const code = []
          i += 1
          while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) {
            code.push(lines[i])
            i += 1
          }
          if (i < lines.length) i += 1
          blocks.push(h('pre', { key: nextKey(), className: 'tc-md-pre' },
            h('code', { className: fence[1] !== '' ? `language-${fence[1]}` : undefined }, code.join('\n'))))
          continue
        }
        const heading = /^(#{1,6})\s+(.*)$/.exec(line)
        if (heading !== null) {
          const tag = `h${heading[1].length}`
          blocks.push(h(tag, { key: nextKey() }, markdownInline(heading[2], nextKey())))
          i += 1
          continue
        }
        if (/^\s*(?:---+|\*\*\*+|___+)\s*$/.test(line)) {
          blocks.push(h('hr', { key: nextKey() }))
          i += 1
          continue
        }
        if (/^\s*>\s?/.test(line)) {
          const quote = []
          while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
            quote.push(lines[i].replace(/^\s*>\s?/, ''))
            i += 1
          }
          blocks.push(h('blockquote', { key: nextKey() }, markdownBlocks(quote.join('\n'))))
          continue
        }
        const list = /^\s*([-*+]|\d+\.)\s+(.*)$/.exec(line)
        if (list !== null) {
          const ordered = /\d+\./.test(list[1])
          const items = []
          while (i < lines.length) {
            const item = /^\s*([-*+]|\d+\.)\s+(.*)$/.exec(lines[i])
            if (item === null || /\d+\./.test(item[1]) !== ordered) break
            items.push(item[2])
            i += 1
          }
          blocks.push(h(ordered ? 'ol' : 'ul', { key: nextKey() },
            items.map((item, itemIndex) => h('li', { key: `${nextKey()}-${itemIndex}` }, markdownInline(item, nextKey())))))
          continue
        }
        if (line.includes('|') && i + 1 < lines.length && tableSeparator(lines[i + 1])) {
          const headers = tableCells(line)
          i += 2
          const rows = []
          while (i < lines.length && lines[i].includes('|') && !/^\s*$/.test(lines[i])) {
            rows.push(tableCells(lines[i]))
            i += 1
          }
          blocks.push(h('div', { key: nextKey(), className: 'tc-md-table-wrap' },
            h('table', null,
              h('thead', null, h('tr', null, headers.map((cell, cellIndex) => h('th', { key: `${nextKey()}-${cellIndex}` }, markdownInline(cell, nextKey()))))),
              h('tbody', null, rows.map((row, rowIndex) => h('tr', { key: `${nextKey()}-${rowIndex}` }, row.map((cell, cellIndex) => h('td', { key: `${nextKey()}-${cellIndex}` }, markdownInline(cell, nextKey())))))))))
          continue
        }
        const paragraph = []
        while (i < lines.length && !/^\s*$/.test(lines[i]) && !(paragraph.length > 0 && isBlockStart(lines[i]))) {
          paragraph.push(lines[i])
          i += 1
        }
        if (paragraph.length > 0) {
          blocks.push(h('p', { key: nextKey() }, markdownInline(paragraph.join('\n'), nextKey())))
        }
      }
      return blocks
    }

    function MarkdownText(props) {
      const text = props.text === null || props.text === undefined ? '' : String(props.text)
      const className = typeof props.className === 'string' && props.className !== '' ? `tc-md ${props.className}` : 'tc-md'
      return h('div', { className }, markdownBlocks(text))
    }

    function TreeCanvas(props) {
      const { index, hiddenIds, selectedId, activeId, selectedPath, afterFor, chainByRep, onExpand, onSelect, sessionId } = props
      const layout = useMemo(() => layoutTree(index, hiddenIds), [index, hiddenIds])
      const wrapRef = useRef(null)
      const [pan, setPan] = useState({ x: 0, y: 0 })
      const [zoom, setZoom] = useState(1)
      const [dragging, setDragging] = useState(false)
      const [tip, setTip] = useState(null)
      const [tipDetail, setTipDetail] = useState(null)
      const [tipLoading, setTipLoading] = useState(false)
      const [tipError, setTipError] = useState(null)
      const tipCloseTimer = useRef(null)
      const dragRef = useRef(null)
      const suppressClick = useRef(false)
      const centeredSession = useRef(null)
      const panRef = useRef(pan)
      const zoomRef = useRef(1)

      useEffect(() => {
        panRef.current = pan
      }, [pan])

      const centerOn = (id, alignTop = false) => {
        const wrap = wrapRef.current
        if (wrap === null) return
        const rect = wrap.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) return
        const scale = zoomRef.current
        const anchorY = alignTop ? Math.max(24, rect.height * 0.16) : rect.height / 2
        const position = id === null ? null : layout.positions.get(id)
        const nextPan = position === undefined || position === null
          ? { x: rect.width / 2 - (layout.width * scale) / 2, y: rect.height / 2 - (layout.height * scale) / 2 }
          : { x: rect.width / 2 - position.x * scale, y: anchorY - position.y * scale }
        panRef.current = nextPan
        setPan(nextPan)
      }

      useEffect(() => {
        if (tipCloseTimer.current !== null) {
          clearTimeout(tipCloseTimer.current)
          tipCloseTimer.current = null
        }
        setTip(null)
        centeredSession.current = null
      }, [sessionId])

      useEffect(() => {
        const node = tip?.node ?? null
        if (node === null || node.kind === 'root') {
          setTipDetail(null)
          setTipLoading(false)
          setTipError(null)
          return undefined
        }
        const cacheKey = `${node.id}:${node.endSeq ?? ''}`
        const cached = detailCache.get(cacheKey)
        if (cached !== undefined && Date.now() - cached.at < DETAIL_CACHE_MS) {
          setTipDetail(cached.detail)
          setTipLoading(false)
          setTipError(null)
          return undefined
        }
        let cancelled = false
        setTipDetail(null)
        setTipLoading(true)
        setTipError(null)
        fetchDetail(node.id).then((detail) => {
          if (cancelled) return
          detailCache.set(cacheKey, { at: Date.now(), detail })
          setTipDetail(detail)
        }).catch((error) => {
          if (!cancelled) setTipError(noticeText(error))
        }).finally(() => {
          if (!cancelled) setTipLoading(false)
        })
        return () => { cancelled = true }
      }, [tip?.node.id, tip?.node.endSeq])

      useEffect(() => () => {
        if (tipCloseTimer.current !== null) {
          clearTimeout(tipCloseTimer.current)
          tipCloseTimer.current = null
        }
      }, [])

      useEffect(() => {
        const wrap = wrapRef.current
        if (wrap === null || layout.positions.size === 0) return
        if (centeredSession.current === sessionId) return
        centeredSession.current = sessionId
        centerOn(index.roots[0]?.id ?? selectedId ?? activeId ?? null, true)
      }, [sessionId, layout, selectedId, activeId])

      useEffect(() => {
        const wrap = wrapRef.current
        if (wrap === null) return undefined
        const onWheel = (event) => {
          if (typeof Element !== 'undefined' && event.target instanceof Element && event.target.closest('.tc-canvas-tip') !== null) return
          event.preventDefault()
          const rect = wrap.getBoundingClientRect()
          if (rect.width === 0 || rect.height === 0) return
          const factor = Math.exp(-event.deltaY * 0.0015)
          const next = Math.min(3, Math.max(0.3, zoomRef.current * factor))
          if (Math.abs(next - zoomRef.current) < 0.0001) return
          const px = event.clientX - rect.left
          const py = event.clientY - rect.top
          const current = panRef.current
          const worldX = (px - current.x) / zoomRef.current
          const worldY = (py - current.y) / zoomRef.current
          const nextPan = { x: px - worldX * next, y: py - worldY * next }
          zoomRef.current = next
          panRef.current = nextPan
          setZoom(next)
          setPan(nextPan)
        }
        wrap.addEventListener('wheel', onWheel, { passive: false })
        return () => { wrap.removeEventListener('wheel', onWheel) }
      }, [])

      const isElement = (value) => typeof Element !== 'undefined' && value instanceof Element

      const clearTipTimer = () => {
        if (tipCloseTimer.current !== null) {
          clearTimeout(tipCloseTimer.current)
          tipCloseTimer.current = null
        }
      }

      const hideTipNow = () => {
        clearTipTimer()
        setTip(null)
      }

      const scheduleHideTip = () => {
        clearTipTimer()
        tipCloseTimer.current = setTimeout(() => {
          tipCloseTimer.current = null
          setTip(null)
        }, 180)
      }

      const cancelHideTip = () => {
        clearTipTimer()
      }

      const startDrag = (event) => {
        if (event.button !== 0) return
        if (isElement(event.target) && event.target.closest('.tc-canvas-node, .tc-canvas-toolbar, .tc-canvas-tip') !== null) return
        const wrap = wrapRef.current
        if (wrap === null) return
        dragRef.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          panX: pan.x,
          panY: pan.y,
          moved: false,
        }
        setDragging(true)
        hideTipNow()
        try {
          wrap.setPointerCapture(event.pointerId)
        } catch {
          /* pointer capture can be unavailable in tests */
        }
      }

      const moveDrag = (event) => {
        const drag = dragRef.current
        if (drag === null || drag.pointerId !== event.pointerId) return
        const dx = event.clientX - drag.startX
        const dy = event.clientY - drag.startY
        if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true
        if (drag.moved) setPan({ x: drag.panX + dx, y: drag.panY + dy })
      }

      const endDrag = (event) => {
        const drag = dragRef.current
        if (drag === null || drag.pointerId !== event.pointerId) return
        if (drag.moved) {
          suppressClick.current = true
          setTimeout(() => {
            suppressClick.current = false
          }, 0)
        }
        dragRef.current = null
        setDragging(false)
      }

      const showTip = (node, element) => {
        const wrap = wrapRef.current
        if (wrap === null) return
        cancelHideTip()
        const wrapRect = wrap.getBoundingClientRect()
        const rect = element.getBoundingClientRect()
        const half = Math.min(160, Math.max(80, (wrapRect.width - 24) / 2))
        const centerX = rect.left - wrapRect.left + rect.width / 2
        const x = Math.max(half, Math.min(Math.max(half, wrapRect.width - half), centerX))
        const y = rect.top - wrapRect.top + rect.height / 2
        const spaceBelow = Math.max(0, wrapRect.height - y - 24)
        const spaceAbove = Math.max(0, y - 24)
        const below = spaceBelow >= 160 && (spaceBelow >= spaceAbove || spaceAbove < 160)
        const maxHeight = Math.max(160, Math.min(420, below ? spaceBelow : spaceAbove))
        setTip({ node, x, y, after: afterFor(node), below, maxHeight })
      }

      const nodes = []
      for (const [id, position] of layout.positions) {
        const node = index.byId.get(id)
        if (node === undefined) continue
        const chain = chainByRep?.get(id) ?? null
        const classes = [
          'tc-canvas-node',
          node.kind === 'root' ? 'tc-canvas-node--root' : '',
          node.kind === 'blank' ? 'tc-canvas-node--blank' : '',
          chain !== null ? 'tc-canvas-node--collapsed' : '',
          id === selectedId ? 'tc-canvas-node--selected' : '',
          id === activeId ? 'tc-canvas-node--active' : '',
          selectedPath.has(id) ? 'tc-canvas-node--path' : '',
          index.sessionById.get(node.sessionId)?.running === true ? 'tc-canvas-node--running' : '',
        ].filter((value) => value !== '').join(' ')
        const question = node.prompt || node.label || translate('node.blank')
        nodes.push(h('button', {
          key: id,
          type: 'button',
          className: classes,
          style: { left: `${position.x}px`, top: `${position.y}px` },
          'aria-label': chain !== null
            ? fmt(translate('node.chainAria'), { n: chain.count })
            : (node.kind === 'root' ? translate('path.root') : question),
          onClick: (event) => {
            event.stopPropagation()
            if (suppressClick.current) return
            setTip(null)
            if (chain !== null) onExpand(chain)
            else onSelect(node)
          },
          onPointerDown: (event) => event.stopPropagation(),
          onMouseEnter: (event) => showTip(node, event.currentTarget),
          onMouseLeave: scheduleHideTip,
        },
          h('span', { className: 'tc-canvas-node-halo', 'aria-hidden': 'true' },
            chain !== null ? h('span', { className: 'tc-canvas-node-count' }, String(chain.count)) : null),
          h('span', { className: 'tc-canvas-node-dot' }, node.kind === 'root' ? h(Icon, { name: 'tree', size: 11 }) : null)))
      }

      const edges = layout.edges.map(([fromId, toId]) => {
        const from = layout.positions.get(fromId)
        const to = layout.positions.get(toId)
        if (from === undefined || to === undefined) return null
        const midY = (from.y + to.y) / 2
        const d = `M ${from.x} ${from.y} C ${from.x} ${midY}, ${to.x} ${midY}, ${to.x} ${to.y}`
        return h('path', {
          key: `${fromId}>${toId}`,
          d,
          className: `tc-canvas-edge${selectedPath.has(toId) ? ' tc-canvas-edge--path' : ''}`,
        })
      }).filter((edge) => edge !== null)

      let tipElement = null
      if (tip !== null) {
        const tipChain = chainByRep?.get(tip.node.id) ?? null
        const tipContext = contextInfo(tip.node)
        const tipTurn = tip.node.kind === 'root'
          ? translate('path.root')
          : tip.node.kind === 'blank'
            ? translate('node.blank')
            : fmt(translate('node.turn'), { n: tip.node.turn })
        const tipQuestion = tip.node.kind === 'root'
          ? translate('node.rootDetail')
          : (tipDetail?.prompt ?? tip.node.prompt ?? tip.node.label ?? translate('node.blank'))
        const tipAnswer = tipDetail?.answer ?? tip.node.answer ?? ''
        const tipAnswerText = tip.node.kind === 'root'
          ? ''
          : tipAnswer !== ''
            ? tipAnswer
            : tipLoading
              ? translate('node.detailLoading')
              : tip.node.open === true
                ? translate('node.detailWaiting')
                : translate('node.answerEmpty')
        const tipErrorText = tipError === null ? null : fmt(translate('node.detailFailed'), { message: tipError })
        tipElement = h('div', {
          className: 'tc-canvas-tip',
          role: 'tooltip',
          style: {
            left: `${tip.x}px`,
            top: `${tip.below ? tip.y + 20 : tip.y - 14}px`,
            transform: tip.below ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
            maxHeight: `${tip.maxHeight}px`,
          },
          onMouseEnter: cancelHideTip,
          onMouseLeave: scheduleHideTip,
          onPointerDown: (event) => event.stopPropagation(),
          onClick: (event) => event.stopPropagation(),
        },
          h('div', { className: 'tc-tip-head' },
            h('span', { className: 'tc-tip-turn' }, tipTurn),
            tip.node.id === activeId ? h('span', { className: 'tc-tip-here' }, translate('node.youAreHere')) : null),
          tipChain !== null ? h('div', { className: 'tc-tip-chain' }, fmt(translate('node.chainHint'), { n: tipChain.count })) : null,
          h('div', { className: 'tc-tip-meta' },
            tipContext.hasContext ? `${tipContext.contextPct}%` : translate('node.contextUnknown'),
            ' · ',
            fmt(translate('node.afterShort'), { n: tip.after.n })),
          h('div', { className: 'tc-tip-body' },
            h('div', { className: 'tc-tip-section' },
              h('div', { className: 'tc-tip-label' }, translate('node.questionLabel')),
              h('div', { className: 'tc-tip-text' }, h(MarkdownText, { text: tipQuestion, className: 'tc-md--tip' }))),
            tip.node.kind === 'root' ? null : h('div', { className: 'tc-tip-section' },
              h('div', { className: 'tc-tip-label' }, translate('node.answerLabel')),
              h('div', { className: 'tc-tip-text' }, h(MarkdownText, { text: tipAnswerText, className: 'tc-md--tip' }))),
            tipErrorText !== null ? h('div', { className: 'tc-tip-error' }, tipErrorText) : null,
            tipDetail?.truncated === true ? h('div', { className: 'tc-tip-note' }, translate('node.detailTruncated')) : null),
          h('div', { className: 'tc-tip-hint' }, translate('node.hoverHint')))
      }

      return h('div', {
        ref: wrapRef,
        className: `tc-canvas-wrap${dragging ? ' tc-canvas-wrap--dragging' : ''}`,
        style: { backgroundPosition: `${pan.x}px ${pan.y}px` },
        onPointerDown: startDrag,
        onPointerMove: moveDrag,
        onPointerUp: endDrag,
        onPointerCancel: endDrag,
        onClick: () => {
          if (!suppressClick.current) hideTipNow()
        },
      },
        h('div', {
          className: 'tc-canvas-world',
          style: {
            width: `${layout.width}px`,
            height: `${layout.height}px`,
            transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
          },
        },
          h('svg', {
            className: 'tc-canvas-edges',
            width: layout.width,
            height: layout.height,
            viewBox: `0 0 ${layout.width} ${layout.height}`,
            'aria-hidden': 'true',
          }, edges),
          nodes),
        h('div', { className: 'tc-canvas-toolbar' },
          h('button', {
            type: 'button',
            className: 'tc-canvas-btn',
            title: translate('node.center'),
            onPointerDown: (event) => event.stopPropagation(),
            onClick: (event) => {
              event.stopPropagation()
              centerOn(activeId ?? selectedId ?? null)
            },
          }, translate('node.center')),
          h('button', {
            type: 'button',
            className: 'tc-canvas-btn',
            title: translate('node.fit'),
            onPointerDown: (event) => event.stopPropagation(),
            onClick: (event) => {
              event.stopPropagation()
              centerOn(null)
            },
          }, translate('node.fit'))),
        h('div', { className: 'tc-canvas-hint' }, translate('node.canvasHint')),
        tipElement)
    }

    function NodeDetailPane(props) {
      const {
        node, after, afterOnPath, isHere, isLeaf, running, archived,
        canFork, busy, onJump, onFork, onRename, onArchive,
      } = props
      const [detail, setDetail] = useState(null)
      const [loading, setLoading] = useState(false)
      const [loadError, setLoadError] = useState(null)
      const [renaming, setRenaming] = useState(false)
      const [value, setValue] = useState('')
      const inputRef = useRef(null)
      const bodyRef = useRef(null)
      const renamingRef = useRef(false)
      const nodeId = node?.id ?? null
      const endSeq = node?.endSeq ?? null
      const cacheKey = nodeId === null ? null : `${nodeId}:${endSeq ?? ''}`

      useEffect(() => {
        renamingRef.current = false
        setRenaming(false)
        setValue(node?.label ?? '')
        setDetail(null)
        setLoadError(null)
        if (bodyRef.current !== null) bodyRef.current.scrollTop = 0
      }, [nodeId])

      useEffect(() => {
        if (!renaming) return undefined
        renamingRef.current = true
        const timer = setTimeout(() => {
          if (inputRef.current !== null) {
            inputRef.current.focus()
            inputRef.current.select()
          }
        }, 0)
        return () => clearTimeout(timer)
      }, [renaming])

      useEffect(() => {
        setLoadError(null)
        if (node === null || node.kind === 'root' || cacheKey === null) {
          setLoading(false)
          return undefined
        }
        const cached = detailCache.get(cacheKey)
        if (cached !== undefined && Date.now() - cached.at < DETAIL_CACHE_MS) {
          setDetail(cached.detail)
          setLoading(false)
          return undefined
        }
        let cancelled = false
        setLoading(true)
        fetchDetail(node.id).then((next) => {
          if (cancelled) return
          detailCache.set(cacheKey, { at: Date.now(), detail: next })
          setDetail(next)
        }).catch((error) => {
          if (!cancelled) setLoadError(noticeText(error))
        }).finally(() => {
          if (!cancelled) setLoading(false)
        })
        return () => {
          cancelled = true
        }
      }, [nodeId, endSeq, node?.kind, cacheKey])

      const submitRename = () => {
        if (node === null || !renamingRef.current) return
        renamingRef.current = false
        setRenaming(false)
        const next = value.trim()
        if (next !== '' && next !== node.label) onRename(node, next)
      }

      const startRename = () => {
        if (node === null) return
        renamingRef.current = true
        setRenaming(true)
        setValue(node.label ?? '')
      }

      const cancelRename = () => {
        renamingRef.current = false
        setRenaming(false)
        setValue(node?.label ?? '')
      }

      if (node === null) {
        return h('aside', { className: 'tc-side', 'aria-label': translate('node.selectHint') },
          h('div', { className: 'tc-side-empty' }, translate('node.selectHint')))
      }

      const context = contextInfo(node)
      const question = detail?.prompt ?? node.prompt ?? ''
      const answer = detail?.answer ?? node.answer ?? ''
      const answerText = answer !== ''
        ? answer
        : loading === true
          ? translate('node.detailLoading')
          : node.open === true
            ? translate('node.detailWaiting')
            : translate('node.answerEmpty')
      const title = node.kind === 'root'
        ? translate('path.root')
        : node.kind === 'blank'
          ? translate('node.blank')
          : fmt(translate('node.turn'), { n: node.turn })
      const afterTitle = after === 0
        ? translate('node.afterZero')
        : fmt(translate(afterOnPath ? 'node.afterPathTitle' : 'node.afterBranchTitle'), { n: after })
      const contextTitle = context.hasContext
        ? fmt(translate('node.contextTitle'), {
            used: formatNumber(context.contextTokens),
            window: formatNumber(context.contextWindow),
            pct: context.contextPct,
          })
        : translate('node.contextUnknown')
      const barClass = `tc-side-ctx-bar${context.contextPct !== null && context.contextPct >= 90 ? ' tc-side-ctx-bar--error' : context.contextPct !== null && context.contextPct >= 70 ? ' tc-side-ctx-bar--warn' : ''}`

      const badges = []
      if (isHere) badges.push(h('span', { key: 'here', className: 'tc-side-badge tc-side-badge--here' }, translate('node.youAreHere')))
      if (running) badges.push(h('span', { key: 'running', className: 'tc-side-badge tc-side-badge--running' }, translate('node.running')))
      else if (node.open === true) badges.push(h('span', { key: 'open', className: 'tc-side-badge' }, translate('node.open')))
      if (archived) badges.push(h('span', { key: 'archived', className: 'tc-side-badge' }, translate('node.archive')))

      const actions = []
      if (node.kind === 'turn') {
        actions.push(h('button', {
          key: 'jump',
          type: 'button',
          className: 'tc-side-act',
          title: translate('node.jumpHint'),
          disabled: busy,
          onClick: () => onJump(node),
        }, h(Icon, { name: 'right', size: 13 }), translate('node.jump')))
        actions.push(h('button', {
          key: 'fork',
          type: 'button',
          className: 'tc-side-act tc-side-act--primary',
          title: translate('action.branchHint'),
          disabled: busy || running || canFork !== true,
          onClick: () => onFork(node),
        }, h(Icon, { name: 'plus', size: 13 }), translate('action.branch')))
      }
      actions.push(h('button', {
        key: 'rename',
        type: 'button',
        className: 'tc-side-act',
        disabled: busy,
        onClick: startRename,
      }, h(Icon, { name: 'pencil', size: 13 }), translate('node.rename')))
      if (node.kind !== 'root') {
        actions.push(h('button', {
          key: 'archive',
          type: 'button',
          className: 'tc-side-act',
          title: translate('node.archiveHint'),
          disabled: busy || running,
          onClick: () => onArchive(node.sessionId),
        }, h(Icon, { name: 'archive', size: 13 }), translate('node.archive')))
      }

      return h('aside', { className: 'tc-side', 'aria-label': title },
        h('div', { className: 'tc-side-head' },
          h('div', { className: 'tc-side-title-row' },
            renaming
              ? h('input', {
                  ref: inputRef,
                  className: 'tc-side-rename',
                  value,
                  placeholder: translate('node.renamePlaceholder'),
                  onChange: (event) => setValue(event.target.value),
                  onKeyDown: (event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      event.stopPropagation()
                      submitRename()
                    } else if (event.key === 'Escape') {
                      event.preventDefault()
                      event.stopPropagation()
                      cancelRename()
                    }
                  },
                  onBlur: submitRename,
                })
              : h('div', { className: 'tc-side-title', title }, title)),
          isLeaf && node.label !== '' && node.label !== title
            ? h('div', { className: 'tc-side-sub' }, node.label)
            : null,
          badges.length > 0 ? h('div', { className: 'tc-side-badges' }, badges) : null,
          actions.length > 0 ? h('div', { className: 'tc-side-actions tc-side-actions--head' }, actions) : null),
        h('div', { ref: bodyRef, className: 'tc-side-body' },
          h('div', { className: 'tc-side-stats' },
            h('div', { className: 'tc-side-stat' },
              h('div', { className: 'tc-side-stat-label' }, translate('node.contextLabel')),
              h('div', { className: 'tc-side-stat-value' }, context.hasContext ? `${context.contextPct}%` : '—'),
              h('div', { className: barClass }, context.hasContext ? h('span', { style: { width: `${context.contextPct}%` } }) : null),
              h('div', { className: 'tc-side-stat-note', title: contextTitle },
                context.hasContext
                  ? `${formatNumber(context.contextTokens)} / ${formatNumber(context.contextWindow)}`
                  : translate('node.contextUnknown'))),
            h('div', { className: 'tc-side-stat' },
              h('div', { className: 'tc-side-stat-label' }, translate('node.afterLabel')),
              h('div', { className: 'tc-side-stat-value' }, `+${after}`),
              h('div', { className: 'tc-side-stat-note', title: afterTitle }, afterTitle))),
          node.kind === 'root'
            ? h('div', { className: 'tc-side-empty' }, translate('node.rootDetail'))
            : h('div', { className: 'tc-chat' },
                loadError !== null ? h('div', { className: 'tc-side-error' }, fmt(translate('node.detailFailed'), { message: loadError })) : null,
                h('div', { className: 'tc-chat-label' }, translate('node.questionLabel')),
                h('div', { className: 'tc-chat-bubble tc-chat-bubble--user' }, question !== '' ? h(MarkdownText, { text: question }) : h('div', { className: 'tc-md-placeholder' }, translate('node.waiting'))),
                h('div', { className: 'tc-chat-label' }, translate('node.answerLabel')),
                h('div', { className: `tc-chat-bubble tc-chat-bubble--assistant${loading ? ' tc-chat-bubble--loading' : ''}` }, h(MarkdownText, { text: answerText })),
                detail?.truncated === true ? h('div', { className: 'tc-side-note' }, translate('node.detailTruncated')) : null,
                detail?.time ? h('div', { className: 'tc-side-note' }, formatTime(detail.time)) : null)))
    }

    /* ---------------------------------------------------------- panel -- */

    function TreePanel(props) {
      const { sessionId, variant, useAccess, useSession, useWorkspaces, useSessions } = props
      const [busy, setBusy] = useState(false)
      const [notice, setNotice] = useState(null)
      const [overrides, setOverrides] = useState({})
      const [refreshing, setRefreshing] = useState(false)
      const [toast, setToast] = useState(null)
      const [selectedId, setSelectedId] = useState(null)
      const [collapsed, setCollapsed] = useState(() => new Set())
      const [expandedChains, setExpandedChains] = useState(() => new Set())
      const toastTimer = useRef(null)
      const canFork = useAccess ? useAccess('session/fork') : true
      const liveArchived = useWorkspaces ? useWorkspaces(selectArchived) : null
      const liveSessions = useSessions ? useSessions(selectSessionById) : null
      const runningActive = useSession ? useSession((snapshot) => snapshot.running) : (liveSessions?.[sessionId]?.running === true)
      const liveRevision = useMemo(() => sessionRevision(liveSessions), [liveSessions])
      const { data, error, reload } = useTree(sessionId, liveRevision, runningActive)
      const index = useMemo(() => (data === null ? null : indexOf(data)), [data])
      const selectedNodeId = selectedId !== null && index !== null && index.byId.has(selectedId)
        ? selectedId
        : (index?.leaf?.id ?? null)
      const archivedIds = useMemo(() => {
        const set = new Set()
        if (Array.isArray(liveArchived)) {
          for (const id of liveArchived) set.add(id)
        } else if (data !== null) {
          for (const session of data.sessions) if (session.archived === true) set.add(session.id)
        }
        return set
      }, [liveArchived, data])

      const showToast = (text) => {
        setToast(text)
        if (toastTimer.current !== null) clearTimeout(toastTimer.current)
        toastTimer.current = setTimeout(() => {
          toastTimer.current = null
          setToast(null)
        }, 2200)
      }

      useEffect(() => () => {
        if (toastTimer.current !== null) clearTimeout(toastTimer.current)
      }, [])

      useEffect(() => {
        if (notice === null) return undefined
        const timer = setTimeout(() => setNotice(null), 7000)
        return () => clearTimeout(timer)
      }, [notice])

      useEffect(() => {
        setExpandedChains(new Set())
      }, [sessionId])

      useEffect(() => {
        setOverrides({})
      }, [data?.rootId])

      useEffect(() => {
        if (data === null || index === null || liveSessions === null) return
        setOverrides((current) => {
          let changed = false
          const next = { ...current }
          for (const [nodeId, label] of Object.entries(current)) {
            const node = index.byId.get(nodeId)
            if (node === undefined) continue
            const isLeaf = index.leaves.get(node.sessionId)?.id === node.id
            if (!isLeaf) continue
            const live = liveSessions[node.sessionId]?.title
            if (typeof live === 'string' && live.trim() === label) {
              delete next[nodeId]
              changed = true
            }
          }
          return changed ? next : current
        })
      }, [data, index, liveSessions])

      const refreshNow = async () => {
        if (refreshing) return
        setRefreshing(true)
        try {
          await reload(true)
          showToast(translate('panel.refreshed'))
        } catch (refreshError) {
          showToast(fmt(translate('panel.refreshFailed'), { message: noticeText(refreshError) }))
        } finally {
          setRefreshing(false)
        }
      }

      const targetSessionFor = (node) => {
        if (index.path.has(node.id)) return sessionId
        const queue = [node]
        const seen = new Set()
        while (queue.length > 0) {
          const current = queue.shift()
          if (seen.has(current.id)) continue
          seen.add(current.id)
          const leaf = index.leaves.get(current.sessionId)
          if (leaf?.id === current.id && !archivedIds.has(current.sessionId)) return current.sessionId
          for (const child of index.children.get(current.id) ?? []) queue.push(child)
        }
        return node.sessionId
      }

      const activate = (node) => {
        if (busy) return
        if (node.kind === 'root') return
        const targetSession = targetSessionFor(node)
        setSelectedId(node.id)
        if (targetSession !== sessionId) {
          selectionIntent = { sessionId: targetSession, nodeId: node.id }
          setBusy(true)
          switchTo(targetSession, false).then(() => {
            if (node.turn > 0) jumpToTurn(node.turn)
          }).catch((switchError) => {
            setNotice(fmt(translate('notice.switchFailed'), { message: noticeText(switchError) }))
          }).finally(() => setBusy(false))
          return
        }
        selectionIntent = null
        if (node.turn > 0) jumpToTurn(node.turn)
      }

      const forkFromNode = (node) => {
        if (busy) return
        if (node.kind === 'blank' || !Number.isSafeInteger(node.endSeq)) {
          setNotice(translate('notice.busyFork'))
          return
        }
        if (canFork !== true) {
          setNotice(translate('notice.noAccess'))
          return
        }
        if (runningActive === true) {
          setNotice(translate('notice.running'))
          return
        }
        if (index.sessionById.get(node.sessionId)?.running === true) {
          setNotice(translate('notice.busyFork'))
          return
        }
        setBusy(true)
        forkAt(node).catch((forkError) => {
          setNotice(fmt(translate('notice.forkFailed'), { message: noticeText(forkError) }))
        }).finally(() => setBusy(false))
      }

      const renameSessionTitle = async (targetSessionId, title) => {
        const sessions = appCtx?.get('sessions')
        if (sessions === undefined) throw new Error(translate('notice.noService'))
        await sessions.using(targetSessionId, { source: 'workspaceOperation' }, async (reference) => {
          const result = await reference.binding.session.rename(title)
          if (result !== null && result !== undefined && result.ok === false) {
            throw new Error(result.error?.message ?? 'rename failed')
          }
        })
      }

      const rename = (node, label) => {
        setOverrides((current) => ({ ...current, [node.id]: label }))
        renameSessionTitle(node.sessionId, label)
          .then(() => fetch(ROUTE, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: 'label', nodeId: node.id, label }),
          }))
          .then(async (response) => {
            const body = await response.json().catch(() => null)
            if (!response.ok || body?.ok !== true) throw new Error(body?.error ?? `HTTP ${response.status}`)
            refreshAll()
          })
          .catch((renameError) => {
            setOverrides((current) => {
              const next = { ...current }
              delete next[node.id]
              return next
            })
            const message = fmt(translate('notice.renameFailed'), { message: noticeText(renameError) })
            setNotice(message)
            showToast(message)
          })
      }

      const archiveBranch = async (targetSessionId) => {
        const workspace = appCtx?.get('uiWorkspace')
        if (!workspace) {
          setNotice(translate('notice.noService'))
          return
        }
        try {
          await workspace.archiveSession(targetSessionId)
          showToast(translate('node.archivedToast'))
          refreshAll()
        } catch (archiveError) {
          setNotice(fmt(translate('notice.archiveFailed'), { message: noticeText(archiveError) }))
        }
      }

      const toggleCollapsed = (id) => {
        setCollapsed((current) => {
          const next = new Set(current)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return next
        })
      }

      const sessionTitleOf = (targetSessionId) => {
        const live = liveSessions?.[targetSessionId]?.title
        if (typeof live === 'string' && live.trim() !== '') return live.trim()
        const host = index?.sessionById.get(targetSessionId)?.title
        return typeof host === 'string' && host.trim() !== '' ? host.trim() : null
      }

      const labelOf = (node) => {
        const isLeaf = index !== null && index.leaves.get(node.sessionId)?.id === node.id
        if (isLeaf) {
          const override = overrides[node.id]
          if (override !== undefined) return override
          const title = sessionTitleOf(node.sessionId)
          if (title !== null) return title
        }
        return overrides[node.id] ?? node.label
      }

      const hiddenIds = useMemo(() => {
        const hidden = new Set()
        if (data === null || index === null || archivedIds.size === 0) return hidden
        const required = new Set()
        for (const session of data.sessions) {
          if (archivedIds.has(session.id)) continue
          let node = index.leaves.get(session.id)
          const guard = new Set()
          while (node !== undefined && node !== null && !guard.has(node.id)) {
            guard.add(node.id)
            required.add(node.id)
            node = index.byId.get(node.parentId)
          }
        }
        for (const node of data.nodes) {
          if (node.kind === 'root') continue
          if (archivedIds.has(node.sessionId) && !required.has(node.id)) hidden.add(node.id)
        }
        return hidden
      }, [data, index, archivedIds])

      const displayIndex = useMemo(() => (
        index === null ? null : buildDisplayIndex(index, hiddenIds, expandedChains)
      ), [index, hiddenIds, expandedChains])

      const activeLeafId = index?.leaf?.id ?? null
      const effectiveSelectedId = selectedNodeId !== null && !hiddenIds.has(selectedNodeId)
        ? selectedNodeId
        : (activeLeafId !== null && !hiddenIds.has(activeLeafId) ? activeLeafId : null)
      const selectedPath = useMemo(() => {
        const path = new Set()
        if (index === null || effectiveSelectedId === null) return path
        let node = index.byId.get(effectiveSelectedId)
        const guard = new Set()
        while (node !== undefined && node !== null && !guard.has(node.id)) {
          guard.add(node.id)
          path.add(node.id)
          node = index.byId.get(node.parentId)
        }
        return path
      }, [index, effectiveSelectedId])

      const resolveDisplayId = (id) => {
        if (displayIndex === null || id === null) return null
        if (displayIndex.byId.has(id)) return id
        return displayIndex.chainByMember.get(id) ?? null
      }
      const displaySelectedId = resolveDisplayId(effectiveSelectedId)
      const displayActiveId = resolveDisplayId(activeLeafId)

      const expandChain = (chain) => {
        if (chain === null || chain === undefined) return
        setExpandedChains((current) => {
          if (current.has(chain.key)) return current
          const next = new Set(current)
          next.add(chain.key)
          return next
        })
        if (chain.endId !== undefined) setSelectedId(chain.endId)
      }

      const afterInfo = useMemo(() => {
        const pathAfter = new Map()
        const maxAfter = new Map()
        const activePath = new Set()
        if (index !== null) {
          const path = []
          let current = activeLeafId !== null ? index.byId.get(activeLeafId) : null
          const guard = new Set()
          while (current !== undefined && current !== null && !guard.has(current.id)) {
            guard.add(current.id)
            path.push(current)
            current = index.byId.get(current.parentId)
          }
          path.reverse()
          for (const node of path) activePath.add(node.id)
          let turnsAfter = 0
          for (let i = path.length - 1; i >= 0; i -= 1) {
            const node = path[i]
            pathAfter.set(node.id, turnsAfter)
            if (node.kind === 'turn') turnsAfter += 1
          }
          const visit = (node) => {
            let best = 0
            for (const child of index.children.get(node.id) ?? []) {
              const value = (child.kind === 'turn' ? 1 : 0) + visit(child)
              if (value > best) best = value
            }
            maxAfter.set(node.id, best)
            return best
          }
          for (const root of index.roots) visit(root)
        }
        return { pathAfter, maxAfter, activePath }
      }, [index, activeLeafId])

      const afterFor = (node) => {
        if (afterInfo.activePath.has(node.id)) {
          return { n: afterInfo.pathAfter.get(node.id) ?? 0, onPath: true }
        }
        return { n: afterInfo.maxAfter.get(node.id) ?? 0, onPath: false }
      }

      useEffect(() => {
        if (selectionIntent === null) setSelectedId(null)
      }, [sessionId])

      useEffect(() => {
        if (data === null || index === null || data.sessionId !== sessionId) return
        if (selectionIntent === null || selectionIntent.sessionId !== sessionId) return
        const intent = selectionIntent
        selectionIntent = null
        setSelectedId(intent.nodeId !== null && index.byId.has(intent.nodeId) ? intent.nodeId : null)
      }, [sessionId, data, index])

      useEffect(() => {
        if (index === null || effectiveSelectedId === null) return
        const ancestors = new Set()
        let node = index.byId.get(effectiveSelectedId)
        const guard = new Set()
        while (node !== undefined && node !== null && !guard.has(node.id)) {
          guard.add(node.id)
          ancestors.add(node.id)
          node = index.byId.get(node.parentId)
        }
        setCollapsed((current) => {
          let changed = false
          const next = new Set(current)
          for (const id of ancestors) if (next.delete(id)) changed = true
          return changed ? next : current
        })
        // Only a selection change auto-expands its path; a background refresh
        // must not undo a collapse the user chose.
      }, [effectiveSelectedId])

      const renderBranch = (node, depth) => {
        if (hiddenIds.has(node.id)) return null
        const children = index.children.get(node.id) ?? []
        const hasChildren = children.length > 0
        const collapsedNow = collapsed.has(node.id)
        const isRoot = node.kind === 'root'
        const isLeaf = index.leaves.get(node.sessionId)?.id === node.id
        const onPath = selectedPath.has(node.id)
        const after = afterFor(node)
        return h('div', { key: node.id, className: 'tc-branch' },
          isRoot
            ? h('div', { className: 'tc-root' },
                hasChildren
                  ? h('button', {
                      type: 'button',
                      className: 'tc-collapse-btn',
                      title: collapsedNow ? translate('node.expand') : translate('node.collapse'),
                      'aria-label': collapsedNow ? translate('node.expand') : translate('node.collapse'),
                      'aria-expanded': collapsedNow !== true,
                      onClick: (event) => {
                        event.stopPropagation()
                        toggleCollapsed(node.id)
                      },
                    }, h(Icon, { name: collapsedNow ? 'right' : 'down', size: 14 }))
                  : h('span', { className: 'tc-collapse-spacer' }),
                h('span', { className: 'tc-root-mark' }, h(Icon, { name: 'tree', size: 13 })),
                h('span', { className: 'tc-root-title' }, translate('path.root')),
                collapsedNow ? h('span', { className: 'tc-badge tc-badge--collapsed' }, translate('node.collapsed')) : null)
            : h('div', { className: 'tc-row' },
                h('div', {
                  className: `tc-gutter${onPath ? ' tc-gutter--path' : ''}${node.id === effectiveSelectedId ? ' tc-gutter--active' : ''}`,
                  title: fmt(translate('node.depth'), { n: depth }),
                  'aria-hidden': 'true',
                }, h('span', { className: 'tc-depth' }, depth === 0 ? '·' : String(depth))),
                h(NodeCard, {
                  node: { ...node, label: labelOf(node) },
                  activeId: effectiveSelectedId,
                  onPath,
                  isLeaf,
                  running: index.sessionById.get(node.sessionId)?.running === true,
                  archived: archivedIds.has(node.sessionId),
                  canFork,
                  hasChildren,
                  collapsed: collapsedNow,
                  busy,
                  onToggle: toggleCollapsed,
                  onActivate: activate,
                  onFork: forkFromNode,
                  onRename: rename,
                  onArchive: archiveBranch,
                  after: after.n,
                  afterOnPath: after.onPath,
                })),
          children.length === 0 || collapsedNow
            ? null
            : h('div', { className: `tc-children${children.length > 1 ? ' tc-children--fork' : ''}` },
                children.map((child) => renderBranch(child, depth + (children.length > 1 ? 1 : 0)))))
      }

      if (data === null) {
        return h('div', { className: `tc-panel tc-panel--${variant}` },
          h('div', { className: 'tc-head' },
            h('span', { className: 'tc-title' }, translate('panel.title')),
            h('span', { className: 'tc-spacer' }),
            h(IconButton, {
              label: translate('panel.refresh'),
              name: 'refresh',
              onClick: refreshNow,
              disabled: refreshing,
              spinning: refreshing,
            })),
          toast === null ? null : h('div', { className: 'tc-toast', role: 'status' }, toast),
          h('div', { className: 'tc-empty' }, error === null ? translate('panel.loading') : `${translate('panel.error')}：${error}`))
      }

      const visibleNodes = data.nodes.filter((node) => !hiddenIds.has(node.id))
      const turns = visibleNodes.filter((node) => node.kind === 'turn').length
      const branches = data.sessions.filter((session) => !archivedIds.has(session.id)).length
      const allArchived = data.sessions.length > 0 && branches === 0
      const selectedNode = effectiveSelectedId !== null && index !== null
        ? (index.byId.get(effectiveSelectedId) ?? null)
        : null
      const paneNode = selectedNode === null ? null : { ...selectedNode, label: labelOf(selectedNode) }
      const paneAfter = selectedNode === null ? { n: 0, onPath: false } : afterFor(selectedNode)
      const paneIsHere = selectedNode !== null && activeLeafId === selectedNode.id
      const paneIsLeaf = selectedNode !== null && index.leaves.get(selectedNode.sessionId)?.id === selectedNode.id
      const paneRunning = selectedNode !== null && index.sessionById.get(selectedNode.sessionId)?.running === true
      const paneArchived = selectedNode !== null && archivedIds.has(selectedNode.sessionId)
      return h('div', { className: `tc-panel tc-panel--${variant}`, 'aria-busy': busy || refreshing },
        h('div', { className: 'tc-head' },
          h('div', { className: 'tc-head-text' },
            h('div', { className: 'tc-title' }, translate('panel.title')),
            h('div', { className: 'tc-sub' }, `${fmt(translate('panel.turns'), { n: turns })} · ${fmt(translate('panel.branches'), { n: branches })}`)),
          h('span', { className: 'tc-spacer' }),
          h(IconButton, {
            label: translate('panel.refresh'),
            name: 'refresh',
            onClick: refreshNow,
            disabled: refreshing,
            spinning: refreshing,
          })),
        busy ? h('div', { className: 'tc-notice tc-notice--busy' }, translate('action.busy')) : null,
        notice === null ? null : h('div', { className: 'tc-notice' }, notice),
        error === null ? null : h('div', { className: 'tc-notice' }, `${translate('panel.error')}：${error}`),
        data.errors !== undefined && data.errors.length > 0 ? h('div', { className: 'tc-warn' }, translate('panel.partial')) : null,
        toast === null ? null : h('div', { className: 'tc-toast', role: 'status' }, toast),
        h('div', { className: 'tc-body', 'aria-label': translate('panel.title') },
          visibleNodes.length === 0
            ? h('div', { className: 'tc-empty' }, allArchived ? translate('panel.allArchived') : translate('panel.empty'))
            : h('div', { className: 'tc-workspace' },
                h(TreeCanvas, {
                  index: displayIndex ?? index,
                  hiddenIds,
                  selectedId: displaySelectedId,
                  activeId: displayActiveId,
                  selectedPath,
                  afterFor,
                  chainByRep: displayIndex?.chainByRep ?? null,
                  onExpand: expandChain,
                  onSelect: (node) => setSelectedId(node.id),
                  sessionId,
                }),
                h(NodeDetailPane, {
                  node: paneNode,
                  after: paneAfter.n,
                  afterOnPath: paneAfter.onPath,
                  isHere: paneIsHere,
                  isLeaf: paneIsLeaf,
                  running: paneRunning,
                  archived: paneArchived,
                  canFork,
                  busy,
                  onJump: activate,
                  onFork: forkFromNode,
                  onRename: rename,
                  onArchive: archiveBranch,
                }))))
    }

    function ViewTree(props) {
      return h(TreePanel, { ...props, variant: 'view' })
    }

    /**
     * Self-contained floating tree. It is root-scoped on purpose: the right
     * sidebar controller is not always reachable from a dynamic Client plugin,
     * and a conversation View tab steals the Chat surface. This panel floats
     * over the frame, hides the composer while open, and follows the active branch.
     */
    function readOverlayWidth() {
      const max = typeof window === 'undefined' ? 1100 : Math.max(560, Math.min(1100, window.innerWidth - 80))
      const fallback = Math.min(820, max)
      try {
        const value = Number(localStorage.getItem(WIDTH_KEY))
        return Number.isFinite(value) && value > 0 ? Math.min(Math.max(value, 560), max) : fallback
      } catch {
        return fallback
      }
    }

    function TreeOverlay(props) {
      const state = useOverlay()
      const [width, setWidth] = useState(readOverlayWidth)
      const [composerOpen, setComposerOpen] = useState(false)
      const widthRef = useRef(width)
      useEffect(() => {
        widthRef.current = width
      }, [width])
      useEffect(() => {
        if (!state.open) setComposerOpen(false)
      }, [state.open])
      useEffect(() => {
        if (!state.open) return undefined
        const onKeyDown = (event) => {
          if (event.key === 'Escape') closePanel()
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
      }, [state.open])

      useEffect(() => {
        const root = document.documentElement
        if (!state.open) {
          document.body.classList.remove('tc-overlay-open', 'tc-overlay-composer')
          delete root.dataset.treecomOverlay
          return undefined
        }
        document.body.classList.add('tc-overlay-open')
        if (composerOpen) document.body.classList.add('tc-overlay-composer')
        else document.body.classList.remove('tc-overlay-composer')
        root.dataset.treecomOverlay = 'open'
        return () => {
          document.body.classList.remove('tc-overlay-open', 'tc-overlay-composer')
          delete root.dataset.treecomOverlay
        }
      }, [state.open, composerOpen])

      const startResize = (event) => {
        event.preventDefault()
        event.stopPropagation()
        const startWidth = width
        let latest = startWidth
        const max = Math.max(560, Math.min(1100, window.innerWidth - 80))
        const onMove = (moveEvent) => {
          const raw = window.innerWidth - moveEvent.clientX
          latest = raw
          setWidth(Math.max(320, Math.min(max, raw)))
        }
        const onUp = () => {
          window.removeEventListener('pointermove', onMove)
          window.removeEventListener('pointerup', onUp)
          const closeByDrag = latest < 480
          const next = closeByDrag ? startWidth : Math.min(max, Math.max(560, latest))
          setWidth(next)
          try {
            localStorage.setItem(WIDTH_KEY, String(next))
          } catch {
            /* storage may be unavailable */
          }
          if (closeByDrag) closePanel()
        }
        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerup', onUp)
      }
      if (!state.open || state.sessionId === null) return null
      return h('div', {
        className: 'tc-overlay',
        role: 'dialog',
        'aria-label': translate('panel.title'),
      },
        h('div', { className: `tc-overlay-panel${state.closing ? ' tc-overlay-panel--closing' : ''}`, style: { width: `${width}px` } },
          h('div', {
            className: 'tc-resize',
            role: 'separator',
            'aria-orientation': 'vertical',
            'aria-label': translate('panel.resize'),
            title: translate('panel.resize'),
            onPointerDown: startResize,
          }),
          h('div', { className: 'tc-overlay-bar' },
            h('span', { className: 'tc-overlay-title' }, translate('panel.title')),
            h('span', { className: 'tc-spacer' }),
            h(IconButton, { label: translate('panel.close'), name: 'x', onClick: closePanel })),
          h(TreePanel, {
            sessionId: state.sessionId,
            variant: 'overlay',
            useAccess: props.useAccess,
            useSession: props.useSession,
            useWorkspaces: props.useWorkspaces,
            useSessions: props.useSessions,
          }),
          h('div', { className: 'tc-overlay-foot' },
            h('button', {
              type: 'button',
              className: 'tc-overlay-composer-toggle',
              onClick: () => {
                if (composerOpen) {
                  setComposerOpen(false)
                  return
                }
                setComposerOpen(true)
                setTimeout(() => {
                  try {
                    const input = document.querySelector('[data-composer-input]')
                    if (input !== null && typeof input.focus === 'function') input.focus()
                  } catch {
                    /* composer may not be mounted */
                  }
                }, 80)
              },
            }, h(Icon, { name: composerOpen ? 'down' : 'plus', size: 13 }),
              translate(composerOpen ? 'overlay.hideComposer' : 'overlay.showComposer')))))
    }

    /* ------------------------------------------------- header opener -- */

    function OpenButton(props) {
      const { sessionId, inputActions } = props
      useEffect(() => {
        if (overlay.open) syncOverlaySession(sessionId)
        if (pending.panelSession === sessionId) {
          pending.panelSession = null
          setTimeout(() => { openPanel(sessionId) }, 60)
        }
        if (pending.focusSession === sessionId) {
          pending.focusSession = null
          setTimeout(() => {
            try {
              inputActions?.focus?.()
            } catch (focusError) {
              console.warn('[treecom] focus failed', focusError)
            }
          }, 280)
        }
      }, [sessionId, inputActions])

      return h('button', {
        type: 'button',
        className: 'tc-open-btn',
        title: translate('header.open'),
        'aria-label': translate('header.open'),
        onClick: () => {
          if (overlay.open && !overlay.closing) closePanel()
          else openPanel(sessionId)
        },
      }, h(Icon, { name: 'tree', size: 14 }), h('span', null, translate('header.open')))
    }

    /* ---------------------------------------------------------- styles -- */

    const CSS = `
.tc-panel{position:relative;height:100%;min-height:0;display:flex;flex-direction:column;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:12px;line-height:1.45}
.tc-head{display:flex;align-items:center;gap:8px;padding:10px 12px 8px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.tc-head-text{min-width:0}
.tc-title{font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tc-sub{color:var(--dsw-alias-label-tertiary);font-size:11px;margin-top:1px}
.tc-spacer{flex:1}
.tc-hint{padding:7px 12px 0;color:var(--dsw-alias-label-tertiary);font-size:11px}
.tc-body{flex:1;min-height:0;overflow:hidden;padding:0}
.tc-panel--view .tc-body{max-width:none;width:100%;margin:0;padding:0;box-sizing:border-box}
.tc-empty{padding:18px 12px;color:var(--dsw-alias-label-tertiary);font-size:12px}
.tc-notice{margin:8px 12px 0;padding:6px 8px;border-radius:6px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-label-primary);font-size:11px}
.tc-notice--busy{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary)}
.tc-warn{margin:8px 12px 0;color:var(--dsw-alias-state-warn-label);font-size:11px}
.tc-branch{min-width:0}
/* Every card stays full width; hierarchy lives in a fixed-width left gutter.
   A long linear conversation therefore never loses horizontal room. */
.tc-children{min-width:0}
.tc-row{display:flex;align-items:stretch;gap:6px;min-width:0}
.tc-row > .tc-card{flex:1 1 0%;min-width:0;box-sizing:border-box}
.tc-gutter{position:relative;flex:0 0 22px;min-width:22px;display:flex;align-items:flex-start;justify-content:center;pointer-events:none}
.tc-gutter::before{content:"";position:absolute;top:0;bottom:0;left:10px;width:1px;background:var(--dsw-alias-border-l1)}
.tc-gutter--path::before{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 45%,var(--dsw-alias-border-l1))}
.tc-gutter--active::before{background:var(--dsw-alias-state-business-primary)}
.tc-depth{position:relative;z-index:1;margin-top:7px;display:inline-flex;align-items:center;justify-content:center;min-width:16px;height:16px;padding:0 3px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-tertiary);font-size:9px;line-height:1;box-sizing:border-box}
.tc-gutter--path .tc-depth{color:var(--dsw-alias-state-business-primary);border-color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 8%,var(--dsw-alias-bg-layer-1))}
.tc-gutter--active .tc-depth{color:var(--dsw-alias-state-business-primary);border-color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 14%,var(--dsw-alias-bg-layer-1))}
.tc-root{display:flex;align-items:center;gap:6px;padding:4px 4px 6px 2px;color:var(--dsw-alias-label-tertiary);font-size:11px;min-width:0}
.tc-root-mark{display:inline-flex}
.tc-root-title{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tc-card{position:relative;overflow:hidden;margin:4px 0;padding:7px 8px 6px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);cursor:pointer;transition:border-color .12s,background-color .12s;min-width:0}
.tc-card:hover{border-color:var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-layer-2)}
.tc-card:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}
.tc-card--blank{border-style:dashed;background:transparent}
.tc-card--path{background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 5%, var(--dsw-alias-bg-layer-1));border-color:var(--dsw-alias-state-business-primary)}
.tc-card--active{background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 10%, var(--dsw-alias-bg-layer-1));border-color:var(--dsw-alias-state-business-primary);box-shadow:inset 3px 0 0 var(--dsw-alias-state-business-primary),0 0 0 1px var(--dsw-alias-state-business-primary)}
.tc-card--active .tc-card-label{color:var(--dsw-alias-state-business-primary)}
.tc-card--path:hover{background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 5%, var(--dsw-alias-bg-layer-1));border-color:var(--dsw-alias-state-business-primary)}
.tc-card--active:hover{background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 10%, var(--dsw-alias-bg-layer-1));border-color:var(--dsw-alias-state-business-primary)}
.tc-card--running{opacity:.85}
.tc-card--busy{cursor:progress}
.tc-card-body{display:flex;align-items:stretch;gap:8px;min-width:0}
.tc-card-main{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1 1 auto}
.tc-status{flex:0 0 64px;width:64px;min-width:64px;box-sizing:border-box;display:flex;flex-direction:column;justify-content:center;gap:4px;padding-left:7px;border-left:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-tertiary)}
.tc-ctx{display:flex;flex-direction:column;gap:2px;min-width:0}
.tc-ctx-top{display:flex;align-items:baseline;justify-content:space-between;gap:2px;font-size:9px;line-height:1.2}
.tc-ctx-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tc-ctx-pct{font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary);font-weight:600}
.tc-ctx-bar{height:3px;border-radius:2px;background:var(--dsw-alias-border-l1);overflow:hidden}
.tc-ctx-bar > span{display:block;height:100%;border-radius:2px;background:var(--dsw-alias-state-business-primary,#4d6bfe);transition:width .2s}
.tc-ctx-bar--warn > span{background:var(--dsw-alias-state-warn-primary,#d97706)}
.tc-ctx-bar--error > span{background:var(--dsw-alias-state-error-primary,#dc2626)}
.tc-after{font-size:9px;line-height:1.2;white-space:nowrap;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-tertiary)}
.tc-after--none{opacity:.55}
.tc-card-head{display:flex;align-items:flex-start;gap:6px}
.tc-card-label{flex:1;min-width:0;font-weight:500;font-size:12px;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:break-word}
.tc-card-label-text{pointer-events:none}
.tc-card-badges{display:flex;flex-wrap:wrap;gap:3px;justify-content:flex-start;max-width:100%;margin-top:1px}
.tc-badge{padding:0 4px;border-radius:4px;border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:15px;white-space:nowrap}
.tc-badge--here{color:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary);font-weight:600}
.tc-badge--running{color:var(--dsw-alias-state-ongoing,var(--dsw-alias-state-success-primary));border-color:var(--dsw-alias-state-success-primary)}
.tc-badge--open{color:var(--dsw-alias-state-warn-label);border-color:var(--dsw-alias-state-warn-primary)}
.tc-detail{position:fixed;z-index:2147483002;box-sizing:border-box;display:flex;flex-direction:column;gap:7px;padding:12px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);box-shadow:var(--dsw-elevation-panel,0 12px 36px rgba(0,0,0,.24));font-size:12px;line-height:1.45;overflow:auto;overscroll-behavior:contain;pointer-events:auto}
.tc-detail-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;min-width:0}
.tc-detail-title{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tc-detail-name{font-size:10px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.tc-detail-meta{display:flex;flex-wrap:wrap;gap:4px 8px;color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:1.3}
.tc-detail-section{display:flex;flex-direction:column;gap:3px;min-width:0}
.tc-detail-label{font-size:10px;font-weight:600;color:var(--dsw-alias-label-secondary);letter-spacing:.02em}
.tc-detail-text{white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-primary)}
.tc-detail-loading,.tc-detail-note{color:var(--dsw-alias-label-tertiary);font-size:11px}
.tc-detail-error{color:var(--dsw-alias-state-error-primary);font-size:11px}
.tc-detail-note{font-size:10px}
.tc-detail-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:2px;padding-top:8px;border-top:1px solid var(--dsw-alias-border-l1)}
.tc-card-rail{position:absolute;left:0;top:0;bottom:0;width:26px;display:flex;align-items:center;justify-content:center;padding:0;border:0;border-right:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;cursor:pointer;transition:background-color .12s,color .12s}
.tc-card-rail:hover{background:rgba(0,0,0,.12);color:var(--dsw-alias-label-primary)}
.tc-card-rail--empty{cursor:default;pointer-events:none;background:transparent;border-right-color:transparent}
.tc-card-rail--empty:hover{background:transparent}
.tc-collapse-btn{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;padding:0;border:0;border-radius:5px;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;flex-shrink:0}
.tc-collapse-btn:hover{background:rgba(0,0,0,.12);color:var(--dsw-alias-label-primary)}
.tc-collapse-spacer{width:22px;flex-shrink:0}
.tc-badge--collapsed{color:var(--dsw-alias-label-tertiary);border-color:var(--dsw-alias-border-l1)}
.tc-mini-btn{display:inline-flex;align-items:center;gap:3px;height:20px;padding:0 5px;border:1px solid transparent;border-radius:4px;background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:10px;cursor:pointer}
.tc-mini-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l1);color:var(--dsw-alias-label-primary)}
.tc-mini-btn:disabled{opacity:.45;cursor:not-allowed}
.tc-icon-btn{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;border:1px solid transparent;border-radius:6px;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer}
.tc-icon-btn:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l1)}
.tc-icon-btn:disabled{opacity:.4;cursor:not-allowed}
.tc-icon-btn--tiny{width:18px;height:18px}
.tc-icon-btn[data-spinning="true"] svg{animation:tc-spin .8s linear infinite}
@keyframes tc-spin{to{transform:rotate(360deg)}}
.tc-rename{width:100%;box-sizing:border-box;height:22px;padding:0 4px;border:1px solid var(--dsw-alias-state-business-primary);border-radius:4px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;outline:none}
.tc-path{display:flex;align-items:center;gap:5px;min-height:22px;padding:1px 2px 4px;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:15px;min-width:0;overflow:hidden}
.tc-path-open{display:inline-flex;align-items:center;gap:4px;height:20px;padding:0 5px;border:1px solid transparent;border-radius:5px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;cursor:pointer;white-space:nowrap}
.tc-path-open:hover{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l1);color:var(--dsw-alias-label-primary)}
.tc-path-chain{display:flex;align-items:center;gap:4px;min-width:0;flex:1;overflow:hidden;white-space:nowrap}
.tc-path-part{display:inline-flex;align-items:center;gap:4px;min-width:0}
.tc-path-open,.tc-path-siblings,.tc-path-error{flex-shrink:0}
.tc-path-crumb{max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}
.tc-path-crumb:hover{color:var(--dsw-alias-label-primary)}
.tc-path-current{color:var(--dsw-alias-label-primary);font-weight:500}
.tc-path-dots{opacity:.7}
.tc-path-sep{opacity:.5}
.tc-path-siblings{display:inline-flex;align-items:center;gap:1px;margin-left:2px}
.tc-path-count{font-size:10px;min-width:22px;text-align:center;color:var(--dsw-alias-label-tertiary)}
.tc-path-error{display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;border-radius:50%;background:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-bg-base);font-size:10px;font-weight:700;cursor:help}
.tc-branch-action{display:inline-flex;align-items:center;gap:4px;height:24px;padding:0 7px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;cursor:pointer;white-space:nowrap}
.tc-branch-action:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary)}
.tc-branch-action:disabled{opacity:.45;cursor:not-allowed}
.tc-action-error{margin-left:2px;color:var(--dsw-alias-state-error-primary);font-weight:700;cursor:help}
.tc-overlay{position:fixed;inset:0;z-index:2147483000;display:flex;justify-content:flex-end;pointer-events:none}
body.tc-overlay-open:not(.tc-overlay-composer) [data-composer-seat],body.tc-overlay-open:not(.tc-overlay-composer) [data-conversation-region="composer"],body.tc-overlay-open:not(.tc-overlay-composer) [data-composer-card],body.tc-overlay-open:not(.tc-overlay-composer) [data-composer-input],body.tc-overlay-open:not(.tc-overlay-composer) [data-composer-dock],body.tc-overlay-open:not(.tc-overlay-composer) [data-composer-overlay],body.tc-overlay-open:not(.tc-overlay-composer) [data-conversation-composer-overlay]{display:none!important}
.tc-overlay-panel{position:relative;pointer-events:auto;max-width:92vw;height:100%;display:flex;flex-direction:column;background:var(--dsw-alias-bg-base);border-left:1px solid var(--dsw-alias-border-l1);box-shadow:-12px 0 32px rgba(0,0,0,.18);will-change:transform;animation:tc-overlay-in .24s cubic-bezier(.22,1,.36,1)}
.tc-overlay-panel--closing{animation:tc-overlay-out .23s cubic-bezier(.4,0,.2,1) forwards;pointer-events:none}
@keyframes tc-overlay-in{from{transform:translateX(100%);opacity:.85}to{transform:translateX(0);opacity:1}}
@keyframes tc-overlay-out{from{transform:translateX(0);opacity:1}to{transform:translateX(100%);opacity:.9}}
.tc-overlay-bar{display:flex;align-items:center;gap:8px;height:40px;padding:0 12px;border-bottom:1px solid var(--dsw-alias-border-l1);flex-shrink:0}
.tc-overlay-title{font-weight:600;font-size:13px}
.tc-overlay .tc-panel{flex:1;min-height:0}
.tc-overlay-foot{flex-shrink:0;display:flex;justify-content:center;padding:8px 12px;border-top:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base)}
.tc-overlay-composer-toggle{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;cursor:pointer}
.tc-overlay-composer-toggle:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.tc-resize{position:absolute;left:-3px;top:0;bottom:0;width:8px;z-index:6;cursor:col-resize;touch-action:none}
.tc-resize::after{content:"";position:absolute;left:3px;top:50%;transform:translateY(-50%);width:2px;height:36px;border-radius:1px;background:var(--dsw-alias-border-l2);opacity:0;transition:opacity .12s}
.tc-overlay-panel:hover .tc-resize::after{opacity:1}
@media (max-width:640px){.tc-overlay-panel{width:100%!important}.tc-resize{display:none}}
@media (prefers-reduced-motion:reduce){.tc-overlay-panel{animation:none}.tc-overlay-panel--closing{animation:none;opacity:0}}
.tc-toast{position:absolute;top:46px;left:50%;transform:translateX(-50%);z-index:5;padding:5px 10px;border-radius:999px;background:var(--dsw-alias-bg-layer-3);border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);box-shadow:var(--dsw-elevation-panel);font-size:11px;white-space:nowrap;pointer-events:none;animation:tc-toast-in .15s ease-out}
@keyframes tc-toast-in{from{opacity:0;transform:translate(-50%,-4px)}to{opacity:1;transform:translate(-50%,0)}}
.tc-open-btn{display:inline-flex;align-items:center;gap:5px;height:28px;padding:0 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer}
.tc-open-btn:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
/* --------------------------------------------------- canvas workspace -- */
.tc-workspace{display:flex;height:100%;min-height:0;width:100%}
.tc-canvas-wrap{position:relative;flex:1 1 auto;min-width:0;min-height:0;height:100%;overflow:hidden;background-color:var(--dsw-alias-bg-base);background-image:radial-gradient(circle,var(--dsw-alias-border-l1) 1px,transparent 1px);background-size:18px 18px;cursor:grab;touch-action:none;user-select:none}
.tc-canvas-wrap--dragging{cursor:grabbing}
.tc-canvas-world{position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform}
.tc-canvas-edges{position:absolute;left:0;top:0;overflow:visible;pointer-events:none}
.tc-canvas-edge{fill:none;stroke:var(--dsw-alias-border-l2);stroke-width:1.4;stroke-linecap:round}
.tc-canvas-edge--path{stroke:var(--dsw-alias-state-business-primary);stroke-width:2;opacity:.8}
.tc-canvas-node{position:absolute;transform:translate(-50%,-50%);display:flex;align-items:center;justify-content:center;width:30px;height:30px;padding:0;border:0;border-radius:50%;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;outline:none}
.tc-canvas-node-halo{position:absolute;inset:2px;border-radius:50%;background:transparent;transition:background-color .12s,box-shadow .12s}
.tc-canvas-node-dot{position:relative;display:flex;align-items:center;justify-content:center;width:12px;height:12px;border-radius:50%;border:1.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-tertiary);transition:background-color .12s,border-color .12s,transform .12s}
.tc-canvas-node:hover .tc-canvas-node-halo{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 12%,transparent)}
.tc-canvas-node:hover .tc-canvas-node-dot{transform:scale(1.12)}
.tc-canvas-node:focus-visible .tc-canvas-node-halo{box-shadow:0 0 0 2px var(--dsw-alias-state-business-primary)}
.tc-canvas-node--root .tc-canvas-node-dot{width:22px;height:22px;border-color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 10%,var(--dsw-alias-bg-base));color:var(--dsw-alias-state-business-primary)}
.tc-canvas-node--blank .tc-canvas-node-dot{border-style:dashed;background:transparent}
.tc-canvas-node--collapsed .tc-canvas-node-dot{box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-state-business-primary) 8%,transparent)}
.tc-canvas-node-count{position:absolute;left:50%;top:50%;transform:translate(8px,-50%);min-width:17px;height:15px;padding:0 4px;border-radius:8px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);font-size:9px;line-height:13px;text-align:center;font-variant-numeric:tabular-nums;white-space:nowrap;pointer-events:none}
.tc-canvas-node--path .tc-canvas-node-dot{border-color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 12%,var(--dsw-alias-bg-base))}
.tc-canvas-node--selected .tc-canvas-node-halo{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 16%,transparent);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-state-business-primary) 18%,transparent)}
.tc-canvas-node--selected .tc-canvas-node-dot{border-color:var(--dsw-alias-state-business-primary);background:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-bg-base)}
.tc-canvas-node--active .tc-canvas-node-halo{background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 18%,transparent);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-state-success-primary) 20%,transparent)}
.tc-canvas-node--active .tc-canvas-node-dot{border-color:var(--dsw-alias-state-success-primary);background:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-bg-base)}
.tc-canvas-node--running .tc-canvas-node-dot{animation:tc-node-pulse 1.6s ease-in-out infinite}
@keyframes tc-node-pulse{0%,100%{box-shadow:0 0 0 0 color-mix(in srgb,var(--dsw-alias-state-success-primary) 0%,transparent)}50%{box-shadow:0 0 0 6px color-mix(in srgb,var(--dsw-alias-state-success-primary) 18%,transparent)}}
.tc-canvas-toolbar{position:absolute;left:12px;top:10px;z-index:6;display:flex;gap:6px}
.tc-canvas-btn{height:24px;padding:0 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;cursor:pointer;white-space:nowrap}
.tc-canvas-btn:hover{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary)}
.tc-canvas-hint{position:absolute;left:12px;bottom:10px;right:12px;z-index:5;color:var(--dsw-alias-label-tertiary);font-size:10px;pointer-events:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tc-canvas-tip{position:absolute;z-index:30;width:320px;max-width:calc(100% - 24px);max-height:calc(100% - 16px);box-sizing:border-box;padding:9px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);box-shadow:var(--dsw-elevation-panel,0 10px 28px rgba(0,0,0,.22));pointer-events:auto;font-size:11px;line-height:1.45;display:flex;flex-direction:column}
.tc-tip-head{display:flex;align-items:center;gap:6px;min-width:0}
.tc-tip-turn{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tc-tip-here{margin-left:auto;padding:0 4px;border:1px solid var(--dsw-alias-state-success-primary);border-radius:4px;color:var(--dsw-alias-state-success-primary);font-size:10px;line-height:15px;white-space:nowrap}
.tc-tip-q{margin-top:4px;color:var(--dsw-alias-label-secondary);font-size:11px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}
.tc-tip-body{margin-top:6px;min-height:0;overflow-y:auto;overscroll-behavior:contain;display:flex;flex-direction:column;gap:7px;padding-right:2px}
.tc-tip-section{min-width:0}
.tc-tip-label{margin-bottom:2px;color:var(--dsw-alias-label-tertiary);font-size:10px;font-weight:600;letter-spacing:.02em}
.tc-tip-text{white-space:pre-wrap;word-break:break-word;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:1.5}
.tc-tip-error{color:var(--dsw-alias-state-error-label);font-size:10px}
.tc-tip-note{color:var(--dsw-alias-label-tertiary);font-size:10px}
.tc-tip-meta{margin-top:5px;color:var(--dsw-alias-label-tertiary);font-size:10px;font-variant-numeric:tabular-nums}
.tc-tip-hint{margin-top:3px;color:var(--dsw-alias-label-tertiary);font-size:10px}
.tc-tip-chain{margin-top:5px;color:var(--dsw-alias-state-business-primary);font-size:10px;font-weight:500}
.tc-md{min-width:0;color:inherit;line-height:1.65;font-size:12px;overflow-wrap:anywhere;white-space:pre-wrap}
.tc-md > :first-child{margin-top:0}
.tc-md > :last-child{margin-bottom:0}
.tc-md p{margin:0 0 8px}
.tc-md h1,.tc-md h2,.tc-md h3,.tc-md h4,.tc-md h5,.tc-md h6{margin:10px 0 6px;color:var(--dsw-alias-label-primary);font-weight:600;line-height:1.35;letter-spacing:0}
.tc-md h1{font-size:16px}
.tc-md h2{font-size:15px}
.tc-md h3{font-size:14px}
.tc-md h4,.tc-md h5,.tc-md h6{font-size:13px}
.tc-md ul,.tc-md ol{margin:0 0 8px;padding-left:20px}
.tc-md li{margin:2px 0}
.tc-md li > p{margin:0}
.tc-md code{padding:1px 4px;border-radius:4px;background:var(--dsw-alias-bg-layer-3);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px}
.tc-md pre{margin:0 0 8px;padding:8px 10px;border-radius:6px;background:var(--dsw-alias-bg-layer-3);overflow:auto;max-height:260px;white-space:pre}
.tc-md pre code{padding:0;background:transparent;font-size:11px;white-space:pre}
.tc-md blockquote{margin:0 0 8px;padding:2px 0 2px 10px;border-left:2px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary)}
.tc-md a{color:var(--dsw-alias-state-business-primary);text-decoration:none}
.tc-md a:hover{text-decoration:underline}
.tc-md hr{margin:10px 0;border:0;border-top:1px solid var(--dsw-alias-border-l1)}
.tc-md .tc-md-table-wrap{margin:0 0 8px;max-width:100%;overflow-x:auto}
.tc-md table{border-collapse:collapse;font-size:11px;min-width:0}
.tc-md th,.tc-md td{padding:4px 7px;border:1px solid var(--dsw-alias-border-l1);text-align:left;vertical-align:top}
.tc-md th{background:var(--dsw-alias-bg-layer-2);font-weight:600;color:var(--dsw-alias-label-primary)}
.tc-md--tip{font-size:11px;line-height:1.55}
.tc-md--tip h1,.tc-md--tip h2,.tc-md--tip h3,.tc-md--tip h4{font-size:12px}
.tc-md--tip pre{max-height:180px}
.tc-md-placeholder{color:var(--dsw-alias-label-tertiary)}
.tc-side{flex:0 0 360px;width:360px;min-width:0;height:100%;min-height:0;display:flex;flex-direction:column;border-left:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base)}
.tc-panel--view .tc-side{flex-basis:380px;width:380px}
.tc-side-head{padding:14px 16px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);flex-shrink:0}
.tc-side-title-row{display:flex;align-items:center;gap:8px;min-width:0}
.tc-side-title{flex:1;min-width:0;font-weight:600;font-size:14px;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tc-side-sub{margin-top:3px;color:var(--dsw-alias-label-tertiary);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tc-side-badges{display:flex;flex-wrap:wrap;gap:4px;margin-top:5px}
.tc-side-badge{padding:0 4px;border:1px solid var(--dsw-alias-border-l1);border-radius:4px;color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:15px;white-space:nowrap}
.tc-side-badge--here{border-color:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-state-success-primary);font-weight:600}
.tc-side-badge--running{border-color:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-state-success-primary)}
.tc-side-body{flex:1 1 auto;min-height:0;overflow:auto;padding:12px 16px 18px;display:flex;flex-direction:column;gap:12px;overscroll-behavior:contain}
.tc-side-empty{padding:18px 0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.6}
.tc-side-stats{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px}
.tc-side-stat{min-width:0;padding:8px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1)}
.tc-side-stat-label{color:var(--dsw-alias-label-tertiary);font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tc-side-stat-value{margin-top:2px;font-size:18px;font-weight:600;line-height:1.2;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary)}
.tc-side-stat-note{margin-top:3px;color:var(--dsw-alias-label-tertiary);font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums}
.tc-side-ctx-bar{height:4px;margin-top:5px;border-radius:2px;background:var(--dsw-alias-border-l1);overflow:hidden}
.tc-side-ctx-bar > span{display:block;height:100%;border-radius:2px;background:var(--dsw-alias-state-business-primary,#4d6bfe);transition:width .2s}
.tc-side-ctx-bar--warn > span{background:var(--dsw-alias-state-warn-primary,#d97706)}
.tc-side-ctx-bar--error > span{background:var(--dsw-alias-state-error-primary,#dc2626)}
.tc-chat{display:flex;flex-direction:column;gap:6px;min-width:0}
.tc-chat-label{margin-top:2px;color:var(--dsw-alias-label-secondary);font-size:10px;font-weight:600;letter-spacing:.02em}
.tc-chat-bubble{padding:8px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:12px;line-height:1.55;white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere}
.tc-chat-bubble--user{border-color:color-mix(in srgb,var(--dsw-alias-state-business-primary) 34%,var(--dsw-alias-border-l1));background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 6%,var(--dsw-alias-bg-layer-1))}
.tc-chat-bubble--assistant{background:var(--dsw-alias-bg-layer-1)}
.tc-chat-bubble--loading{color:var(--dsw-alias-label-tertiary);font-style:italic}
.tc-side-note{color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:1.45}
.tc-side-error{padding:6px 8px;border:1px solid var(--dsw-alias-state-error-primary);border-radius:6px;color:var(--dsw-alias-state-error-primary);font-size:11px;line-height:1.45}
.tc-side-actions{display:flex;flex-wrap:wrap;gap:6px;padding:10px 16px;border-top:1px solid var(--dsw-alias-border-l1);flex-shrink:0}
.tc-side-actions--head{padding:9px 0 0;border-top:0;background:transparent}
.tc-side-act{display:inline-flex;align-items:center;gap:4px;height:26px;padding:0 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;cursor:pointer;white-space:nowrap}
.tc-side-act:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary)}
.tc-side-act:disabled{opacity:.45;cursor:not-allowed}
.tc-side-act--primary{border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-state-business-primary)}
.tc-side-act--primary:hover:not(:disabled){border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 8%,transparent)}
.tc-side-rename{width:100%;box-sizing:border-box;height:28px;padding:0 6px;border:1px solid var(--dsw-alias-state-business-primary);border-radius:6px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;outline:none}
@media (max-width:980px){.tc-side,.tc-panel--view .tc-side{flex-basis:320px;width:320px}}
@media (max-width:760px){.tc-workspace{flex-direction:column}.tc-canvas-wrap{flex:1 1 auto;min-height:220px}.tc-side,.tc-panel--view .tc-side{flex:0 0 45%;width:100%;border-left:0;border-top:1px solid var(--dsw-alias-border-l1)}}

`

    /* ----------------------------------------------------------- apply -- */

    return {
      inject: ['slots'],
      apply(ctx) {
        appCtx = ctx
        const slots = ctx.get('slots')
        if (!slots) throw new Error('treecom: slots service missing')
        const locale = ctx.get('locale')
        if (locale) {
          ctx.effect(() => locale.register(NS, { zh: ZH, en: EN }), 'treecom: locale')
          translate = locale.bind(NS)
        }

        ctx.effect(() => {
          const style = document.createElement('style')
          style.setAttribute('data-treecom-style', '')
          style.textContent = CSS
          document.head.appendChild(style)
          return () => style.remove()
        }, 'treecom: styles')

        ctx.slots.inject('conversation.view', () => ctx.slots.register({
          name: 'conversation.view',
          id: VIEW_ID,
          order: 30,
          label: () => translate('view.title'),
        }, ViewTree))

        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'treecom-overlay',
          order: 90,
        }, TreeOverlay))

        ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
          name: 'conversation.session.header.utilities',
          id: 'treecom-open',
          order: 20,
          label: () => translate('header.open'),
        }, OpenButton))
      },
    }
  },
})
