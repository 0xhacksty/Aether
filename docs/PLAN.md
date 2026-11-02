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
| Agent reasoning | The connected MCP host supplies its configured model and agent loop. Aether does not require an LLM API key for browser tool use. | Keeps provider choice and model policy with the user's agent host. |
| Agent connection | Official `@modelcontextprotocol/sdk` over stdio, bridged to the extension through loopback WebSocket and the native messaging host | Connects an MCP agent to the real Chrome profile without adding an agent framework. |
| OS | Windows first, macOS in Step 9 | Assumption. Native host registration differs per OS. |

---

## 4. Architecture

```
Chrome (UI, tabs, profile)
   |  chrome.debugger  (CDP, flat sessions)
Companion extension (MV3, side panel)
   |  native messaging  (stdio, length-prefixed JSON)
aether-native-host  ----- loopback WebSocket ----->  aether MCP server
                                                        |  MCP stdio
                                                        |  MCP host / agent reasoning
                                                        |
                                                     engine
                                           Perceiver | Actor | Policy | Log

Eval path:  aether probe --> engine --> DirectCDP --> isolated Chrome
```

One codebase, two browser transports. `aether-native-host` is spawned by Chrome through `connectNative`, relays extension commands to the MCP server over a loopback WebSocket, and runs only while the extension port is open. The MCP server speaks stdio to the agent host. The CLI probe and deterministic fixtures continue to use Direct CDP.

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
- The connected MCP host owns model choice, prompt layout, and the agent loop.
- Aether is a tool server and never sends a page to a model itself.
- Tools: `navigate`, `act`, `find`, `read`, `screenshot`, `ask`, `done`.

### 5.4 Policy & Handoff
- Four outcomes: `allow`, `needs_approval`, `human_must_perform`, `refuse`.
- Sensitive passwords and payment actions are gated.
- Non-blocking human takeover and inspect pick mode.

### 5.5 MCP connection
- The MCP server uses the official TypeScript SDK over stdio. The MCP host supplies reasoning; this does not add an agent framework to Aether.
- The MCP server exposes exactly the seven tools in the locked Brain & Prompt spec and validates their arguments using the schemas in `packages/shared`.
- Step 3 tests the MCP tools over Direct CDP using an isolated Chrome profile.
- Step 4 connects the real-profile extension to the MCP server through the native host and a loopback WebSocket. The MCP server binds only to `127.0.0.1`; the WebSocket handshake requires the extension origin and a short-lived token stored under `~/.aether/`.
- All bridge request, response, and event messages are zod schemas in `packages/shared`.
- All page-derived text returned by tools is enclosed in `<page untrusted>` tags.

---

## 6. Step 1 Deliverables and Exit Gate

1. Five fixtures and five real sites probed. First snapshot token estimate recorded for each.
2. Cross-origin iframe fixture yields elements from the child frame with correct ordinals.
3. Refs are stable across repeat snapshots and never reused after navigation.
4. Capture latency p50 and p95 recorded per site.
5. `pnpm typecheck`, `pnpm lint` and `pnpm test` pass.
6. Metrics document committed.

## 7. Step 3 and Step 4 Deliverables

### Step 3: MCP tool server

Tasks, in order:

1. Add an MCP stdio entry point using the approved SDK. An MCP client must initialize and list Aether's seven tools.
2. Route `navigate`, `act`, `find`, `read`, `screenshot`, `ask`, and `done` through the shared Zod schemas and existing Perceiver/Actor/CDP packages.
3. Keep the Direct CDP path available for deterministic MCP integration tests.

Exit gate: an MCP client initializes, lists and calls all seven tools against fixtures through stdio; page-derived text is wrapped as untrusted; `pnpm typecheck`, `pnpm lint`, and `pnpm test` pass. The connected MCP host supplies reasoning; there is no in-process Anthropic loop.

### Step 4: Extension transport

1. Add the MV3 extension, native messaging host, and React side panel with a step ticker.
2. Connect the native host to the MCP server over the authenticated loopback WebSocket bridge. Route extension operations through the same engine interfaces and shared wire schemas as Direct CDP.
3. Add the Windows native-host registration path and run `scripts/spikes/native-host-stdio.ps1` to verify the Windows launcher and framed stdio path. No roadmap section exists in this plan, so this is the named Step 4 spike for the current implementation.

Exit gate: MCP calls reach the selected Chrome tab through the extension, the side panel shows connection and step state, and fixture tests cover the bridge; `pnpm typecheck`, `pnpm lint`, and `pnpm test` pass. Real-profile task metrics are recorded when the configured MCP host exposes its model usage data.

No Step 4 implementation starts until the Step 3 exit gate passes.
