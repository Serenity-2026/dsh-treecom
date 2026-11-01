# Changelog

## 0.5.0 — 2026-11-01

- The canvas remembers its camera per conversation tree (zoom, center, and pan), so opening the right sidebar, switching to the Conversation tree tab, or returning to a branch resumes the previous view instead of snapping back to the root.
- Branch growth is now detected per conversation root and only animates nodes that actually appeared; first mounts and session switches no longer trigger false growth animations.
- Node positions animate when the tree relayouts, and the active branch's chain is expanded once when switching sessions so its leaf stays visible.
- New branches now grow from their parent over about 0.6 seconds instead of appearing in a fraction of a second.
- After a fork, the tree selects and centers the new branch (the conversation itself still stays on the current branch).
- A freshly forked empty branch now shows “回到这一轮” in its detail pane, so it can be opened and continued immediately.
- Forking a node now shows a persistent “branch created, refreshing the tree…” toast with a spinner, locks tree interactions until the forced refresh finishes, and then reports success.
- Forking from a tree node now keeps the current conversation tree open (no unarchive/open-session focus) instead of switching to the newly created child conversation.
- Newly visible tree nodes and their edges animate out from their parent node instead of appearing abruptly.

## 0.3.0 — 2026-10-31

- The question and answer bubbles in the right detail pane now use max-heights: they shrink to the content and scroll internally only when the content exceeds the limit.
- Hover preview uses the normal arrow over its frame and an I-beam over text, so text selection/copy is discoverable without dragging first.
- Disabled the host conversation width-resize handles while the Conversation "对话树" tab is active, so the tree page no longer shows a col-resize cursor.
- The chain collapse control now collapses only the turns above the hovered node ("折叠上方 N 轮") instead of the whole chain.
- Chain nodes can be collapsed again: after expanding a linear stretch, hover any node in the chain and click “折叠 N 轮” in the preview.
- Hover preview now uses a default arrow cursor, supports text selection (I-beam while dragging), and its bottom “点击查看详情” hint is clickable like the node itself.
- Added copy buttons above the question and answer bubbles in the right detail pane, with a transient “已复制” state.
- Manual refresh now clears the per-session cache and forces a fresh `/treecom` request instead of possibly reusing cached data.

## 0.2.0 — 2026-10-31

- Replaced the floating overlay with the host right sidebar: the header "对话树" button now opens a `sidebar.right.pane.tab` tab, the conversation stays visible, and the host sidebar owns close/resize. Removed the overlay registration, overlay state, and overlay CSS entirely; the remaining entries are the Conversation "对话树" view tab and the header button.
- Tree data is cached per session and refreshed only when the live session revision changes (new turns, session switches/additions, title/running/blank changes); the 8-second polling loop is gone, a running session refreshes at a low 5-second cadence, and the refresh button forces a reload.
- Linear stretches with no branch collapse into one representative node with a turn count; clicking it expands the whole chain.
- Rename/archive/fork actions moved from the bottom of the detail pane into its header, so they are always visible.
- Canvas now grows vertically from the top (root at top, branches below); the initial view focuses the root, and "Go to this turn" centers the active leaf.
- Scroll wheel / trackpad zooms the canvas around the pointer (0.3x–3x), with pan preserved.
- Renamed the Conversation view tab from "Tree" to "对话树 / Conversation tree" to match the header entry.
- Replaced the list tree with a pannable canvas: circular nodes and curved edges, root at the top with branches growing down; drag empty space to pan without bounds.
- Clicking a node now selects it and opens a right-side detail pane instead of switching branches; a "Go to this turn" action performs the switch and jump.
- Right pane shows context-window usage (percentage, bar, exact tokens), turns following the node, a scrollable full question/answer preview, and archive/rename/fork actions.
- Hovering a node shows an interactive preview with the turn, full question and answer, context usage, and turns after; the preview stays open when the pointer moves into it and scrolls internally with the wheel.
- Question and answer text in the right pane and the hover preview now renders Markdown (headings, lists, fenced code, tables, links, emphasis).
- Host `/treecom` serves per-turn context usage and an on-demand `detail` action for full conversation text.

## 0.1.0 — 2026-10-31

- Initial public release.
- Tree-shaped conversation management on top of DeepSeek Harness fork sessions.
- Click a node to jump back to that turn; fork from any completed turn.
- Collapsible branches, rename sync between session title and leaf node, archive sync.
- Floating tree panel from the header button and a Conversation "Tree" view.
- Theme-aware DeepSeek accents, light/dark support, resizable panel, slide-in/out animation.
- Native end-of-turn fork only; plugin adds no duplicate fork action.
