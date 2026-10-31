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

    const ROUTE = '/treecom'
    const NS = 'treecom'
    const VIEW_ID = 'treecom'
    const CACHE_MS = 4_000
    const WIDTH_KEY = 'treecom:width'
    const REFRESH_MS = 8_000

    /* --------------------------------------------------------- locale -- */

    const ZH = {
      'panel.title': '对话树',
      'panel.hint': '点击任意节点，从那一轮分叉继续',
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
      'panel.resize': '拖动调整宽度',
      'node.leafHint': '切到这条分支',
      'action.branch': '分叉',
      'action.branchHint': '从这一轮分叉，开一条新的对话分支',
      'action.busy': '正在分叉…',
      'header.open': '对话树',
      'view.title': '树',
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
      'panel.hint': 'Click any node to branch from that turn',
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
      'panel.resize': 'Drag to resize',
      'node.leafHint': 'Switch to this branch',
      'action.branch': 'Branch',
      'action.branchHint': 'Branch from this turn into a new conversation branch',
      'action.busy': 'Branching…',
      'header.open': 'Conversation tree',
      'view.title': 'Tree',
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

    /* ----------------------------------------------------------- data -- */

    const cache = new Map()

    function fetchTree(sessionId, force) {
      const cached = cache.get(sessionId)
      if (!force && cached !== undefined && Date.now() - cached.at < CACHE_MS) return cached.promise
      const promise = (async () => {
        const response = await fetch(`${ROUTE}?sessionId=${encodeURIComponent(sessionId)}`, { cache: 'no-store' })
        const body = await response.json().catch(() => null)
        if (!response.ok || body === null || body.ok !== true) {
          throw new Error(body !== null && typeof body.error === 'string' ? body.error : `HTTP ${response.status}`)
        }
        return body
      })()
      cache.set(sessionId, { at: Date.now(), promise })
      promise.catch(() => cache.delete(sessionId))
      return promise
    }

    function refreshAll() {
      cache.clear()
      try {
        window.dispatchEvent(new Event('treecom:refresh'))
      } catch {
        /* a page without CustomEvent/Event is not a real client */
      }
    }

    function useTree(sessionId) {
      const [state, setState] = useState({ loading: true, data: null, error: null })
      const generation = useRef(0)
      const reload = useCallback(async (force = true) => {
        const token = generation.current
        try {
          const data = await fetchTree(sessionId, force)
          if (generation.current === token) setState({ loading: false, data, error: null })
          return data
        } catch (error) {
          if (generation.current === token) {
            setState((previous) => ({ loading: false, data: previous.data, error: error.message }))
          }
          throw error
        }
      }, [sessionId])
      useEffect(() => {
        generation.current += 1
        reload(false).catch(() => {})
        const timer = setInterval(() => { reload(true).catch(() => {}) }, REFRESH_MS)
        const onRefresh = () => { reload(true).catch(() => {}) }
        window.addEventListener('treecom:refresh', onRefresh)
        return () => {
          generation.current += 1
          clearInterval(timer)
          window.removeEventListener('treecom:refresh', onRefresh)
        }
      }, [reload])
      return { ...state, reload }
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
      const { node, activeId, onPath, isLeaf, running, busy, archived, canFork, hasChildren, collapsed, onToggle, onActivate, onFork, onRename, onArchive } = props
      const [renaming, setRenaming] = useState(false)
      const [value, setValue] = useState(node.label)
      const cancelled = useRef(false)
      const suppressClick = useRef(false)
      const inputRef = useRef(null)

      useEffect(() => {
        if (renaming && inputRef.current !== null) {
          inputRef.current.focus()
          inputRef.current.select()
        }
      }, [renaming])

      useEffect(() => {
        setValue(node.label)
      }, [node.label])

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

      const classes = [
        'tc-card',
        node.kind === 'blank' ? 'tc-card--blank' : '',
        node.id === activeId ? 'tc-card--active' : '',
        onPath ? 'tc-card--path' : '',
        running ? 'tc-card--running' : '',
        busy ? 'tc-card--busy' : '',
      ].filter(Boolean).join(' ')

      return h('div', {
        className: classes,
        style: { paddingLeft: '34px' },
        role: 'treeitem',
        tabIndex: 0,
        'aria-label': node.label,
        title: mode,
        onClick: () => {
          if (suppressClick.current || renaming) return
          onActivate(node)
        },
        onKeyDown: (event) => {
          if (event.target !== null && (event.target.tagName === 'INPUT' || event.target.tagName === 'BUTTON')) return
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
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
            : h('span', { className: 'tc-card-label-text' }, node.label)),
          h('span', { className: 'tc-card-badges' },
            node.kind === 'turn' && node.turn > 0 ? h('span', { className: 'tc-badge' }, fmt(translate('node.turn'), { n: node.turn })) : null,
            node.kind === 'blank' ? h('span', { className: 'tc-badge tc-badge--blank' }, translate('node.waiting')) : null,
            node.open === true ? h('span', { className: 'tc-badge tc-badge--open' }, translate('node.open')) : null,
            running ? h('span', { className: 'tc-badge tc-badge--running' }, translate('node.running')) : null,
            hasChildren === true && collapsed === true ? h('span', { className: 'tc-badge tc-badge--collapsed' }, translate('node.collapsed')) : null,
            node.id === activeId ? h('span', { className: 'tc-badge tc-badge--here' }, translate('node.youAreHere')) : null)),
        node.answer === '' ? null : h('div', { className: 'tc-card-answer' }, node.answer),
        h('div', { className: 'tc-card-actions' },
          archived ? null : h('button', {
            type: 'button',
            className: 'tc-mini-btn',
            title: running ? translate('node.running') : translate('node.archiveHint'),
            'aria-label': translate('node.archive'),
            disabled: running,
            onClick: (event) => {
              event.stopPropagation()
              onArchive(node.sessionId)
            },
          }, h(Icon, { name: 'archive', size: 12 }), h('span', null, translate('node.archive'))),
          h('button', {
            type: 'button',
            className: 'tc-mini-btn',
            title: translate('node.rename'),
            'aria-label': translate('node.rename'),
            onClick: (event) => {
              event.stopPropagation()
              setValue(node.label)
              setRenaming(true)
            },
          }, h(Icon, { name: 'pencil', size: 12 }), h('span', null, translate('node.rename'))),
          node.kind === 'blank' ? null : h('button', {
            type: 'button',
            className: 'tc-mini-btn',
            title: running ? translate('node.running') : canFork !== true ? translate('notice.noAccess') : translate('action.branchHint'),
            'aria-label': translate('action.branch'),
            disabled: running === true || canFork !== true,
            onClick: (event) => {
              event.stopPropagation()
              onFork(node)
            },
          }, h(Icon, { name: 'plus', size: 12 }), h('span', null, translate('action.branch')))))
    }

    /* ---------------------------------------------------------- panel -- */

    function TreePanel(props) {
      const { sessionId, variant, useAccess, useSession, useWorkspaces, useSessions } = props
      const { data, error, reload } = useTree(sessionId)
      const [busy, setBusy] = useState(false)
      const [notice, setNotice] = useState(null)
      const [overrides, setOverrides] = useState({})
      const [refreshing, setRefreshing] = useState(false)
      const [toast, setToast] = useState(null)
      const [selectedId, setSelectedId] = useState(null)
      const [collapsed, setCollapsed] = useState(() => new Set())
      const toastTimer = useRef(null)
      const canFork = useAccess ? useAccess('session/fork') : true
      const liveArchived = useWorkspaces ? useWorkspaces(selectArchived) : null
      const liveSessions = useSessions ? useSessions(selectSessionById) : null
      const runningActive = useSession ? useSession((snapshot) => snapshot.running) : (liveSessions?.[sessionId]?.running === true)
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
        h('div', { className: 'tc-hint' }, translate('panel.hint')),
        busy ? h('div', { className: 'tc-notice tc-notice--busy' }, translate('action.busy')) : null,
        notice === null ? null : h('div', { className: 'tc-notice' }, notice),
        error === null ? null : h('div', { className: 'tc-notice' }, `${translate('panel.error')}：${error}`),
        data.errors !== undefined && data.errors.length > 0 ? h('div', { className: 'tc-warn' }, translate('panel.partial')) : null,
        toast === null ? null : h('div', { className: 'tc-toast', role: 'status' }, toast),
        h('div', { className: 'tc-body', role: 'tree', 'aria-label': translate('panel.title') },
          visibleNodes.length <= 1
            ? h('div', { className: 'tc-empty' }, allArchived ? translate('panel.allArchived') : translate('panel.empty'))
            : index.roots.map((node) => renderBranch(node, 0))))
    }

    function ViewTree(props) {
      return h(TreePanel, { ...props, variant: 'view' })
    }

    /**
     * Self-contained floating tree. It is root-scoped on purpose: the right
     * sidebar controller is not always reachable from a dynamic Client plugin,
     * and a conversation View tab steals the Chat surface. This panel floats
     * over the frame, leaves the composer usable, and follows the active branch.
     */
    function readOverlayWidth() {
      try {
        const value = Number(localStorage.getItem(WIDTH_KEY))
        return Number.isFinite(value) && value >= 280 ? Math.min(value, 760) : 420
      } catch {
        return 420
      }
    }

    function TreeOverlay(props) {
      const state = useOverlay()
      const [width, setWidth] = useState(readOverlayWidth)
      const widthRef = useRef(width)
      useEffect(() => {
        widthRef.current = width
      }, [width])
      useEffect(() => {
        if (!state.open) return undefined
        const onKeyDown = (event) => {
          if (event.key === 'Escape') closePanel()
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
      }, [state.open])

      useEffect(() => {
        if (!state.open) return undefined
        const onPointerDown = (event) => {
          const target = event.target
          if (!(target instanceof Element)) return
          if (target.closest('.tc-overlay-panel') !== null) return
          // The header button is a toggle: its own click decides.
          if (target.closest('.tc-open-btn') !== null) return
          // A page/session switch in the left sidebar must keep the panel open;
          // only a click in the conversation retracts it.
          if (target.closest('[data-conversation-scroll], [data-composer-seat]') === null) return
          closePanel()
        }
        document.addEventListener('pointerdown', onPointerDown, true)
        return () => document.removeEventListener('pointerdown', onPointerDown, true)
      }, [state.open])
      const startResize = (event) => {
        event.preventDefault()
        event.stopPropagation()
        const onMove = (moveEvent) => {
          const max = Math.max(320, Math.min(760, window.innerWidth - 80))
          const next = Math.min(Math.max(280, window.innerWidth - moveEvent.clientX), max)
          setWidth(next)
        }
        const onUp = () => {
          window.removeEventListener('pointermove', onMove)
          window.removeEventListener('pointerup', onUp)
          try {
            localStorage.setItem(WIDTH_KEY, String(widthRef.current))
          } catch {
            /* storage may be unavailable */
          }
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
            useWorkspaces: props.useWorkspaces,
            useSessions: props.useSessions,
          })))
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
.tc-body{flex:1;min-height:0;overflow:auto;padding:8px 8px 18px}
.tc-panel--view .tc-body{max-width:760px;width:100%;margin:0 auto;padding:14px 20px 32px;box-sizing:border-box}
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
.tc-card-head{display:flex;align-items:flex-start;gap:6px}
.tc-card-label{flex:1;min-width:0;font-weight:500;font-size:12px;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:break-word}
.tc-card-label-text{pointer-events:none}
.tc-card-badges{display:inline-flex;flex-wrap:wrap;gap:3px;justify-content:flex-end;max-width:52%}
.tc-badge{padding:0 4px;border-radius:4px;border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:15px;white-space:nowrap}
.tc-badge--here{color:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary);font-weight:600}
.tc-badge--running{color:var(--dsw-alias-state-ongoing,var(--dsw-alias-state-success-primary));border-color:var(--dsw-alias-state-success-primary)}
.tc-badge--open{color:var(--dsw-alias-state-warn-label);border-color:var(--dsw-alias-state-warn-primary)}
.tc-card-answer{margin-top:3px;color:var(--dsw-alias-label-tertiary);font-size:11px;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:break-word}
.tc-card-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:5px;opacity:.78;transition:opacity .12s}
.tc-card:hover .tc-card-actions,.tc-card:focus-within .tc-card-actions,.tc-card--active .tc-card-actions{opacity:1}
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
.tc-overlay-panel{position:relative;pointer-events:auto;max-width:92vw;height:100%;display:flex;flex-direction:column;background:var(--dsw-alias-bg-base);border-left:1px solid var(--dsw-alias-border-l1);box-shadow:-12px 0 32px rgba(0,0,0,.18);will-change:transform;animation:tc-overlay-in .24s cubic-bezier(.22,1,.36,1)}
.tc-overlay-panel--closing{animation:tc-overlay-out .23s cubic-bezier(.4,0,.2,1) forwards;pointer-events:none}
@keyframes tc-overlay-in{from{transform:translateX(100%);opacity:.85}to{transform:translateX(0);opacity:1}}
@keyframes tc-overlay-out{from{transform:translateX(0);opacity:1}to{transform:translateX(100%);opacity:.9}}
.tc-overlay-bar{display:flex;align-items:center;gap:8px;height:40px;padding:0 12px;border-bottom:1px solid var(--dsw-alias-border-l1);flex-shrink:0}
.tc-overlay-title{font-weight:600;font-size:13px}
.tc-overlay .tc-panel{flex:1;min-height:0}
.tc-resize{position:absolute;left:-3px;top:0;bottom:0;width:8px;z-index:6;cursor:col-resize;touch-action:none}
.tc-resize::after{content:"";position:absolute;left:3px;top:50%;transform:translateY(-50%);width:2px;height:36px;border-radius:1px;background:var(--dsw-alias-border-l2);opacity:0;transition:opacity .12s}
.tc-overlay-panel:hover .tc-resize::after{opacity:1}
@media (max-width:640px){.tc-overlay-panel{width:100%!important}.tc-resize{display:none}}
@media (prefers-reduced-motion:reduce){.tc-overlay-panel{animation:none}.tc-overlay-panel--closing{animation:none;opacity:0}}
.tc-toast{position:absolute;top:46px;left:50%;transform:translateX(-50%);z-index:5;padding:5px 10px;border-radius:999px;background:var(--dsw-alias-bg-layer-3);border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);box-shadow:var(--dsw-elevation-panel);font-size:11px;white-space:nowrap;pointer-events:none;animation:tc-toast-in .15s ease-out}
@keyframes tc-toast-in{from{opacity:0;transform:translate(-50%,-4px)}to{opacity:1;transform:translate(-50%,0)}}
.tc-open-btn{display:inline-flex;align-items:center;gap:5px;height:28px;padding:0 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer}
.tc-open-btn:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
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
