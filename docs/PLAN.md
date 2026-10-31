# Aether: Agentic Browser Plan

Working title: Aether. Version 1.0. Date: 2026-10-31. Status: locked for Step 1.

---

## 1. Motive

Build an agent engine that operates a real, logged-in Chrome with the fewest possible tokens per step, and hands control to the human with one click. Chrome supplies the entire UI, so no interface work competes with engine work.

Everything in this document serves that sentence. Anything that does not is out of scope.

## 2. Five rules that never bend

1. The engine owns perception, action, policy and logging. Chrome owns the UI.
2. Never send a page to the model. Send a delta.
3. We own the agent loop and the CDP client. No agent frameworks. No Playwright or Puppeteer in the control path.
4. Every optimization must beat a recorded baseline or be deleted.
5. Page content is untrusted. It never gets authority over tools or policy.

---

## 3. Final stack (one choice per layer)

| Layer | Choice | Why this and nothing else |
|---|---|---|
| UI | Stock Google Chrome, minimum version 125 | Gives the Chrome look for free. Flat debugger sessions need Chrome 125 or later. |
| Eval browser | Stock Chrome / Chrome for Testing, pinned version | Deterministic. Supports isolated `--remote-debugging-port=0` and custom `--user-data-dir`. |
| Control protocol | Chrome DevTools Protocol, own thin client over the `ws` package | We need frame-level sessions and full control of waits. Playwright hides frame sessions and does not expose stable frame IDs. |
| Real-profile transport | MV3 extension using `chrome.debugger`, plus a native messaging host | On Chrome 136 and later the debugging port flag is ignored on the default profile, so this is how we reach the user's real logins. |
| Eval transport | Direct CDP to Chrome with a non-default `--user-data-dir` | Needed for deterministic, repeatable evals with no extension. |
| Language and runtime | TypeScript (strict) on Node LTS (>= 22.0.0), pinned in `.nvmrc` | One language across daemon, host and extension. |
| Package manager | pnpm workspaces | Monorepo with shared packages. |
| Extension build | WXT with React | MV3 tooling in TypeScript. |
| Side panel | React on Chrome's `sidePanel` API, plain CSS | Chrome's own surface. No custom browser chrome. |
| Validation | zod | One schema source for tool args and wire messages. |
| Logging | pino (JSON lines) | Structured, cheap. |
| Storage | SQLite through `better-sqlite3`, file at `~/.aether/aether.db` | Local only. One file. |
| Tests | vitest plus a local fixture server (Node `http`) | Deterministic pages for iframes, shadow DOM, long lists. |
| Lint and format | Biome / ESLint | Consistent code style. |
| LLM | Anthropic Messages API with prompt caching. One adapter in v1. Model IDs live in config. | Native tool use and caching on a stable prefix, which our prompt layout depends on. |
| OS | Windows first, macOS in Step 9 | Assumption. Native host registration differs per OS. |

---

## 4. Architecture

```
Chrome (UI, tabs, profile)
   |  chrome.debugger  (CDP, flat sessions)
Companion extension (MV3, side panel)
   |  native messaging  (stdio, length-prefixed JSON)
aether-native-host  ----- imports ----->  engine
                                           Perceiver | Actor | Brain
                                           Policy    | Handoff | Log
                                              |
                                           LLM adapter (Anthropic)

Eval path:  aether probe | aether run --> engine --> DirectCDP --> Chrome
```

One codebase, two entry points. `aether-native-host` is spawned by Chrome through `connectNative` and runs only while the extension port is open. `aether-cli` is standalone and drives Chrome for probes and evals.

---

## 5. Locked specifications

### 5.1 Perceiver

Capture, per frame (main frame plus each child session):

1. Call `Accessibility.getFullAXTree` with the frame ID.
2. Drop nodes with `ignored: true` unless they have interactive descendants (keep structure only).
3. Keep: interactive roles (button, link, textbox, searchbox, combobox, checkbox, radio, switch, tab, menuitem, option, slider, spinbutton), headings, and landmarks (banner, navigation, main, search, form, dialog).
4. Drop generic, none and presentation containers and flatten their children.
5. Deduplicate nodes that appear twice with the same `backendDOMNodeId`.
6. Nodes without a `backendDOMNodeId` are not actionable. Omit them.
7. Truncate names to 80 characters and values to 60.
8. Collapse runs of 6 or more consecutive siblings of the same role into the first 3 plus one count line.
9. Cap at 150 elements per snapshot. Set a `truncated` flag. The model uses `find` and `read` for the rest.

Refs:
- Format `e1`, `e2`, and so on. Shortest string that still identifies an element.
- Assigned monotonically per tab. The registry key is `(frameOrdinal, backendDOMNodeId)`.
- Never reused. On a document change the mappings are cleared but the counter continues, so a stale ref fails loudly instead of hitting a different element.
- Frame ordinals: main frame is 0. Children are numbered in depth-first discovery order.

Outline format:
```
page https://example.com/careers  "Careers"  frames=2
[e1] link "Home"
[e2] navigation
  [e3] link "About"
  [e4] link "Jobs"
[e5] heading "Open roles" level=1
[e6] textbox "Search roles" [focused]
[e7] button "Search"
... 9 more similar listitems (use find or read)
frame 1 http://127.0.0.1:4001
  [e20] button "Apply"
```

### 5.2 Actor
- Resolution chain for any ref: registry lookup gives `(frameSession, backendDOMNodeId)`.
- Synthetic trusted events: `DOM.scrollIntoViewIfNeeded`, `DOM.getBoxModel`, center coordinates, `Input.dispatchMouseEvent` / `Input.insertText`.
- Settle: Poll structural AX hash every 150ms until two match, with a 2.5s cap.

### 5.3 Brain & Prompt
- Append-only prompt layout: System prompt -> Tool definitions -> Compact History (one line per step) -> Current Delta/Snapshot.
- Tools: `navigate`, `act`, `find`, `read`, `screenshot`, `ask`, `done`.

### 5.4 Policy & Handoff
- Four outcomes: `allow`, `needs_approval`, `human_must_perform`, `refuse`.
- Sensitive passwords and payment actions are gated.
- Non-blocking human takeover and inspect pick mode.

---

## 6. Step 1 Deliverables and Exit Gate

1. Five fixtures and five real sites probed. First snapshot token estimate recorded for each.
2. Cross-origin iframe fixture yields elements from the child frame with correct ordinals.
3. Refs are stable across repeat snapshots and never reused after navigation.
4. Capture latency p50 and p95 recorded per site.
5. `pnpm typecheck`, `pnpm lint` and `pnpm test` pass.
6. Metrics document committed.
