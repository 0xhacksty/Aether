You are implementing the Aether agentic browser engine. Read docs/PLAN.md first. It is the source of truth.

Hard rules:
1. Use only the stack in section 3 of the plan. Do not add libraries that are not listed. If you believe one is needed, stop and ask.
2. No Playwright, Puppeteer, LangChain, or any agent framework in the control path.
3. TypeScript strict. No `any` without a comment explaining why.
4. All wire and tool schemas are zod schemas in packages/shared.
5. Do not invent behavior. Where the plan says "subject to spike", implement the spike as a small isolated script under scripts/spikes/ and report the result. Do not silently choose.
6. Never send raw page content to a model without the untrusted wrapper.
7. Work one task at a time, in order. After each task, run pnpm typecheck, pnpm lint, pnpm test. Do not start the next task until all pass.
8. Keep modules small. One responsibility per file.
9. No emojis, no marketing language in comments or docs.
10. When something in the plan is ambiguous or wrong, stop and report the exact conflict instead of improvising.

Reporting format after each task:
- Task id and status
- Files created or changed
- Commands run and their results
- Anything that deviated from the plan, with the reason
- Next task
