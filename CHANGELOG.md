# Changelog

## Unreleased

- Full-width tree cards with a fixed left depth gutter; long conversations no longer narrow with depth.
- Compact node cards: only the user's first question is shown; the model answer excerpt is gone.
- Right-side node status shows context-window usage (percentage and mini bar) and how many turns follow the node.
- Hovering a node opens a detail card with the full question/answer plus archive, rename, and fork actions; the card actions row is removed.
- Host `/treecom` now returns per-turn context usage and serves an on-demand `detail` action for full conversation text.

## 0.1.0 — 2026-10-31

- Initial public release.
- Tree-shaped conversation management on top of DeepSeek Harness fork sessions.
- Click a node to jump back to that turn; fork from any completed turn.
- Collapsible branches, rename sync between session title and leaf node, archive sync.
- Floating tree panel from the header button and a Conversation "Tree" view.
- Theme-aware DeepSeek accents, light/dark support, resizable panel, slide-in/out animation.
- Native end-of-turn fork only; plugin adds no duplicate fork action.
