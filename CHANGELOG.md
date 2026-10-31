# Changelog

## Unreleased

- Opening the header overlay now hides the conversation and composer and fills the workspace by default; drag the left edge to narrow it.
- Tree data is cached per session and refreshed only when the live session revision changes (new turns, session switches/additions, title/running/blank changes); the 8-second polling loop is gone, a running session refreshes at a low 5-second cadence, and the refresh button forces a reload.
- Linear stretches with no branch collapse into one representative node with a turn count; clicking it expands the whole chain.
- Rename/archive/fork actions moved from the bottom of the detail pane into its header, so they are always visible.
- Canvas now grows vertically from the top (root at top, branches below); the initial view focuses the root, and "Go to this turn" centers the active leaf.
- Scroll wheel / trackpad zooms the canvas around the pointer (0.3x–3x), with pan preserved.
- Renamed the Conversation view tab from "Tree" to "对话树 / Conversation tree" to match the header entry.
- Replaced the list tree with a pannable canvas: circular nodes and curved edges, root on the right, branches growing left; drag empty space to pan without bounds.
- Clicking a node now selects it and opens a right-side detail pane instead of switching branches; a "Go to this turn" action performs the switch and jump.
- Right pane shows context-window usage (percentage, bar, exact tokens), turns following the node, a scrollable full question/answer preview, and archive/rename/fork actions.
- Hovering a node shows a compact preview with the turn, user question, context usage, and turns after.
- Removed the old list cards, per-card status column, and collapse controls; the overlay now fills the workspace and can be resized down to 560px.
- Host `/treecom` serves per-turn context usage and an on-demand `detail` action for full conversation text.

## 0.1.0 — 2026-10-31

- Initial public release.
- Tree-shaped conversation management on top of DeepSeek Harness fork sessions.
- Click a node to jump back to that turn; fork from any completed turn.
- Collapsible branches, rename sync between session title and leaf node, archive sync.
- Floating tree panel from the header button and a Conversation "Tree" view.
- Theme-aware DeepSeek accents, light/dark support, resizable panel, slide-in/out animation.
- Native end-of-turn fork only; plugin adds no duplicate fork action.
