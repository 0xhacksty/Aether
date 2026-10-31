# Aether

**Aether** is an authentic, engine-first agentic browser built on Google Chrome. Rather than forking Chromium or building an Electron wrapper, Aether drives stock Chrome via flat Chrome DevTools Protocol (CDP) sessions, using **delta-first perception** to cut token costs by up to 90% and providing single-click human takeover.

---

## Key Highlights

- **Stock Chrome UI:** No custom browser chrome, no Electron shell recreation, and no 100GB Chromium fork maintenance burden. Uses stock Chrome for daily logins, tabs, omnibox, and extensions.
- **Delta-First Perception:** Never sends the entire raw DOM or massive screenshots. Evaluates the per-frame accessibility tree, keeps interactive roles and semantic landmarks, collapses sibling repetitions ($6+$ items $\to$ first 3 + count line), and sends only deltas (`+`, `~`, `-`) on subsequent steps.
- **Trusted Synthetic CDP Inputs:** Bypasses synthetic JS event limitations (`isTrusted: false`) in modern SPAs with native `Input.dispatchMouseEvent` and `Input.insertText` calculated from `DOM.getBoxModel`.
- **Zero-Token Grounding & Human Bridge:** Non-blocking handoff, structured questions, and element picking (`Overlay.setInspectMode`) so user interactions immediately ground the agent.
- **Structural DOM-Settle:** Replaces brittle `networkidle` waits with high-frequency AXTree structural hashing (polling every 150ms with a 2.5s cap).

---

## Benchmark Results (Step 1 Baseline)

| Target | URL | Frames | Elements | Truncated | Token Est. | Latency (p50) |
|---|---|:---:|:---:|:---:|:---:|:---:|
| **Simple Form Fixture** | `localhost:4101/form.html` | 1 | 12 | `false` | **118** | 6.25 ms |
| **Nested Iframes Fixture** | `localhost:4101/nested-iframes.html` | 3 | 6 | `false` | **100** | 7.50 ms |
| **Cross-Origin OOPIF Fixture** | `localhost:4101/cross-origin.html` | 2 | 4 | `false` | **73** | 6.97 ms |
| **Shadow DOM Fixture** | `localhost:4101/shadow-dom.html` | 1 | 3 | `false` | **49** | 2.34 ms |
| **500-Row List Fixture** | `localhost:4101/long-list.html` | 1 | 4 | `false` | **72** | 109.69 ms |
| **DuckDuckGo Search** | `https://duckduckgo.com` | 1 | 109 | `false` | **1,221** | 72.30 ms |
| **GitHub Public** | `https://github.com` | 1 | 76 | `false` | **889** | 186.41 ms |
| **Hacker News** | `https://news.ycombinator.com` | 1 | 5 | `false` | **46** | 74.07 ms |
| **Example Domain** | `https://example.com` | 1 | 1 | `false` | **19** | 3.38 ms |

---

## Architecture

```
Chrome (UI, tabs, profile, extensions)
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

---

## Monorepo Layout

```
aether/
├── packages/
│   ├── shared/         # Zod wire schemas, ElementNode, FrameInfo, Delta, Constants
│   ├── cdp/            # WebSocket JSON-RPC CDP client, CDPSession, FrameManager, ChromeLauncher
│   └── perceiver/      # Monotonic RefRegistry (e1..), AXExtractor, SiblingCollapser, OutlineSerializer
├── apps/
│   └── cli/            # `aether probe <url>` command
├── fixtures/           # Local test server (localhost:4101 and 127.0.0.1:4102 for cross-origin OOPIF)
├── tests/              # Vitest acceptance tests (all 7 criteria passing)
├── docs/               # PLAN.md, METRICS.md, probe-results.md
└── AGENTS.md           # Master coding rules
```

---

## Quickstart

### Prerequisites
- Node.js LTS (>= 22.0.0)
- pnpm (>= 9.0.0)
- Google Chrome (>= 125)

### Installation
```bash
# Clone the repository
git clone https://github.com/Priyank911/Aether.git
cd Aether

# Install workspace dependencies
pnpm install

# Build all packages
pnpm build

# Run acceptance tests
pnpm test
```

### Inspect a Page with Aether Probe CLI
```bash
pnpm probe "https://duckduckgo.com"
```

Example output:
```text
----------------------------------------------------
URL: https://example.com/
Title: "Example Domain"
Frames: 1 | Elements: 1 | Truncated: false
Token Estimate: ~19 tokens | Capture Time: 6.93 ms
----------------------------------------------------
page https://example.com/  "Example Domain"  frames=1
[e1] link "Learn more"
----------------------------------------------------
```

---

## Roadmap

1. [x] **Step 1: Engine Skeleton & Perceiver v0** - Monorepo, ChromeLauncher, flat CDP client, OOPIF frame model, AXTree extractor, monotonic RefRegistry, SiblingCollapser, probe CLI, acceptance suite.
2. [ ] **Step 2: Actor** - Ref to `backendDOMNodeId` resolver, `getBoxModel`, center point calculation, CDP input dispatch, AX structural settle polling.
3. [ ] **Step 3: Brain & Eval Harness** - Thin loop, 7 compact tools, prompt caching, validator, 20-task benchmark suite.
4. [ ] **Step 4: Extension Transport** - MV3 companion extension, Native Messaging host, side-panel step ticker.
5. [ ] **Step 5: Handoff & Policy** - Non-blocking takeover, inspect pick mode, approval gates, ghost cursor.
6. [ ] **Step 6: Safety Hardening** - Ephemeral profiles, prompt injection isolation, URL boundaries.
7. [ ] **Step 7: Optimizations** - Delta diff engine, action batching, replay cache, model routing, history compaction.
8. [ ] **Step 8: Fork Decision** - Data-driven review against native patch triggers.
9. [ ] **Step 9: Distribution** - Windows & macOS native installers and store release.

---

## License

MIT
