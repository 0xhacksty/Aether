# Aether: Metrics and Evaluation Specification

Status: Committed and frozen for Step 1 baseline.

---

## 1. The Four Primary Metrics

Every architectural change, perception update, or prompt revision in Aether must be benchmarked against these four primary metrics:

1. **Tokens Per Completed Task:** Sum of prompt input tokens and generated output tokens across all steps for successfully completed runs.
2. **Steps Per Task:** Number of action steps executed to reach completion.
3. **Median Step Latency (p50):** Elapsed time from tool dispatch to state observation return.
4. **Human Interventions Per Task:** Sum of `ask` triggers, policy approval pauses, and manual user takeovers.

---

## 2. Hypothesis Targets

| Metric | Target | Rationale |
|---|---|---|
| First Snapshot Token Size | $\le 2,000$ tokens | Prevents context window explosion on initial page load. |
| Subsequent Delta Token Size | $\le 300$ tokens | Sends only $+$, $\sim$, $-$ elements and URL/focus. |
| Tool Definition Overhead | $\le 1,000$ tokens | 7 compact tools with concise descriptions. |
| Median Step Latency | $\le 800$ ms | Faster perception loop via flat CDP sessions and AX hashing. |

---

## 3. The 20-Task Evaluation Benchmark Suite

All benchmark tasks are read-only, require no private credentials, and test deterministic web interactions.

### Group 1: Local Deterministic Fixtures (4 tasks)
1. `task-fix-01`: Fill a multi-field contact form without submitting and verify all inputs match typed values.
2. `task-fix-02`: Click an action button located inside a nested cross-origin iframe and verify triggered state.
3. `task-fix-03`: Locate and interact with a button inside an open Shadow DOM root.
4. `task-fix-04`: Locate and select the 482nd element in a 500-item virtualized list using `find`.

### Group 2: Wikipedia (4 tasks)
5. `task-wiki-01`: Extract the birth date and nationality of Alan Turing.
6. `task-wiki-02`: Follow link from "Apollo 11" to "Saturn V" and extract the first stage engine model.
7. `task-wiki-03`: Extract the table of contents headings of the "Quantum computing" article.
8. `task-wiki-04`: Search for "Plate tectonics" from the Wikipedia search box and navigate to the first result.

### Group 3: DuckDuckGo Search (4 tasks)
9. `task-ddg-01`: Search for "Rust programming language" and return the title and URL of the first organic result.
10. `task-ddg-02`: Search for "weather Tokyo" and extract the displayed temperature.
11. `task-ddg-03`: Navigate to news search tab and extract the top 3 headline titles.
12. `task-ddg-04`: Perform search, click "Images" tab, and verify image results container is rendered.

### Group 4: GitHub Public Repositories (4 tasks)
13. `task-gh-01`: Locate the `package.json` file in a public repository and read the `"version"` field.
14. `task-gh-02`: Extract the latest release tag name and publish date from a repository's Releases page.
15. `task-gh-03`: Search open issues for the keyword "regression" and return the title of the latest issue.
16. `task-gh-04`: Copy the clone URL from the repository header modal.

### Group 5: E-Commerce Product Research (Amazon.in / Public Catalog, 4 tasks)
17. `task-ecom-01`: Search for "mechanical keyboard" and extract the price and star rating of the top organic product.
18. `task-ecom-02`: Filter search results by "Free Shipping" or brand checkbox and verify filtered list updates.
19. `task-ecom-03`: Open the top product details page and extract the technical specifications table.
20. `task-ecom-04`: Check if the product is listed as "In Stock" or "Currently unavailable".
