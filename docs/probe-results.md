# Aether Step 1 Probe & Benchmark Results

Recorded on: 2026-10-31T12:09:49.715Z
Environment: Windows (Node v22, Google Chrome 156.0, CDP WebSocket)

| Target | URL | Frames | Elements | Truncated | Token Est. | Latency p50 | Latency p95 |
|---|---|---|---|---|---|---|---|
| Fixture: Simple Form | `http://localhost:4101/form.html` | 1 | 12 | false | **118** | 6.25 ms | 33.66 ms |
| Fixture: Nested Iframes | `http://localhost:4101/nested-iframes.html` | 3 | 6 | false | **100** | 7.5 ms | 16.39 ms |
| Fixture: Cross-Origin Iframe | `http://localhost:4101/cross-origin.html` | 2 | 4 | false | **73** | 6.97 ms | 53.57 ms |
| Fixture: Shadow DOM | `http://localhost:4101/shadow-dom.html` | 1 | 3 | false | **49** | 2.34 ms | 5.68 ms |
| Fixture: 500-Row List | `http://localhost:4101/long-list.html` | 1 | 4 | false | **72** | 109.69 ms | 146.86 ms |
| DuckDuckGo Search | `https://duckduckgo.com` | 1 | 109 | false | **1221** | 72.3 ms | 859.84 ms |
| GitHub Public | `https://github.com` | 1 | 76 | false | **889** | 186.41 ms | 550.9 ms |
| Hacker News | `https://news.ycombinator.com` | 1 | 5 | false | **46** | 74.07 ms | 87.08 ms |
| Example Domain | `https://example.com` | 1 | 1 | false | **19** | 3.38 ms | 26.08 ms |

## Analysis and Verification against Exit Gates

1. **Token Constraint Verification:** All measured initial snapshots are well under the 2,000 to 4,000 token ceiling.
2. **Frame Model Verification:** Cross-origin OOPIF frame resolution correctly yields 2 distinct frames and captures elements across child sessions.
3. **Sibling Collapse & Element Cap:** 500-row list correctly collapses repetitive rows into first 3 + counter and stays bounded by the 150-element cap.
4. **Latency Verification:** Median capture time (p50) remains well under 250ms on local pages and under 500ms on external web pages.
