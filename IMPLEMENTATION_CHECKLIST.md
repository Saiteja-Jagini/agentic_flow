# Implementation checklist

Updated 2026-09-28. This checklist records implemented code separately from verification that requires your accounts, target application, or CI repository.

## Application

- [x] Default `test:target` / `start` website discovery mode using the URL and OpenAI settings in `.env`.
- [x] Same-origin link and sitemap discovery, observed navigation-state exploration, bounded page/depth/interaction queues.
- [x] Automatic email/password login, observed sign-in-link fallback, session reuse, authentication evidence.
- [x] Page/control/form catalog, graph, screenshots, baseline health/input tests and per-page OpenAI plans.
- [x] Legacy `gpt-4` Chat Completions compatibility with strict local JSON validation.
- [x] Permitted-action checks, synthetic input data, read-only request guards, and explicit excluded coverage.
- [x] HTML/JSON coverage summaries with partial outcomes for discovery or AI gaps.
- [x] Test-Agent architecture review and independently implemented design adaptations in `docs/reference-review.md`.

- [x] CLI for demo, planning, execution, existing suites, environment checks, and evaluation.
- [x] Node/npm project with a reproducible dependency lockfile.
- [x] Application context, test-data environment references, and optional explicitly allowed source files.
- [x] Structured OpenAI planning and debugging adapter using the Responses API.
- [x] Restricted plan schema, known routes/locators, required assertions, syntax validation, and Playwright discovery.
- [x] Generated tests with stable scenario IDs and a source hash for each candidate.
- [x] Chromium, Firefox, and WebKit projects; all six demo login checks passed in the browser matrix.
- [x] Optional application build/startup, readiness checks, process cleanup, and logs.
- [x] Existing trusted Playwright configuration execution with zero runner retries.
- [x] Actual runner status, screenshots, traces, videos, DOM/accessibility/network evidence, and missing-artifact handling.
- [x] Versioned results that distinguish test/browser/attempt/candidate identity.
- [x] Jev adapter based on the official TypeSafe endpoint and typed responses, with unit contract checks.
- [x] Independent category and retry questions, malformed-response rejection, provider timeouts, call limits, and usage records.
- [x] Explicit local analysis mode and OpenAI-only comparison mode.
- [x] Deterministic policy checks for stale analysis, disagreement, low confidence, unsupported repairs, and exhausted budgets.
- [x] Locator correction constrained to a unique observed control matching the original intent and role.
- [x] Original assertions/plans preserved across corrections; before/after locator changes retained.
- [x] Evidence-backed retry, separate execution/investigation/repair/provider/time limits, and no nested retries.
- [x] Distinct clean-pass, pass-after-retry, pass-after-correction, human-review, incomplete, blocked, and cancelled outcomes.
- [x] HTML, Markdown, JSON, human-review/suspected-bug, and PR-summary artifacts.
- [x] Credential redaction for selected provider payloads and summaries; provider keys excluded from test child processes.
- [x] Labeled evaluation tool for category/retry accuracy, abstentions, unavailability, latency, calls, and token usage.
- [x] Jev-plus-LLM versus LLM-only comparison command.
- [x] GitHub Actions verification and manual target workflows, read-only permissions, always-uploaded artifacts, and retention settings.
- [x] Setup, CLI, configuration, credentials, scope, and run instructions in README.md.

## Verification

- [x] Six discovery tests: authenticated exploration/session reuse, stale login-path fallback, coverage limits, genuine page errors, action/data restrictions, legacy model adapter, and request scope.
- [x] Regression verification after website-mode integration: 12 component tests and 10 existing integration tests passed.
- [x] Bounded live local target run: eight states across seven URLs, eleven generated/executed/passing baseline tests. Overall result is partial: five queued states remained, AI calls were disabled, and the application's login endpoint returned HTTP 403.
- [x] Expanded HTML coverage report rendered and visually inspected.
- [ ] Live OpenAI planning verification: restricted-network requests failed; automatic approval review rejected the network-enabled retry pending explicit approval to send observed website text/control labels.

- [x] 12 component tests: schema restrictions, status parsing, redaction, provider contracts/timeouts/refusals, correction policy, disagreement, and budgets.
- [x] Local browser demonstration of successful login and invalid-password rejection.
- [x] Selector correction passes on a second attempt without changing the scenario plan.
- [x] Transient HTTP failure passes on a bounded retry; persistent HTTP failure stops at three attempts.
- [x] Missing control is escalated without a fabricated replacement.
- [x] Provider outage retains the original browser failure and produces human review.
- [x] Build/readiness failures produce blocked reports with no fabricated tests.
- [x] Existing-suite execution and managed-app cleanup verified on Windows.
- [x] Cancellation produces a terminal report and releases the demo server.
- [x] Browser matrix: Chromium, Firefox, WebKit, two login scenarios each.
- [x] Standalone HTML report opened and visually inspected.
- [x] Complete integration regression: 10 tests passed, covering the scenarios above plus incorrect text and slow responses.

## External verification still required

- [ ] Run a real OpenAI planning/debugging request using your OPENAI_API_KEY and OPENAI_MODEL.
- [ ] Run a real Jev evaluation using your TypeSafe JEV_API_KEY and preserve its redacted response.
- [ ] Configure and test your actual application, including test accounts, data/reset behavior, and any special authentication flow.
- [ ] Run the hosted GitHub workflows after adding the project to your repository and configuring the target workflow.
- [ ] Collect representative human-labeled application failures and run the live provider comparison.
- [ ] Adjudicate repair correctness and measure real-world repair success/false repair rates before making accuracy claims.

The demo and local evaluator are deterministic demonstrations. They are never labeled as live OpenAI or Jev calls. Existing suites retain their own artifact options; generated suites support the action set documented in README.md. Raw browser artifacts can contain test data and remain local until explicitly uploaded by your CI workflow.
