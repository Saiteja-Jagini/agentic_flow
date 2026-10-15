# Playwright + Jev AI Testing Agent: Detailed Plan and Checklist

Status: The CLI application, provider adapters, validated generation, failure analysis, bounded corrections/retries, reports, evaluation tooling, and CI workflows are implemented. See [IMPLEMENTATION_CHECKLIST.md](IMPLEMENTATION_CHECKLIST.md) for verified coverage and external validation still required.

This file preserves the context from [simple_version.md](simple_version.md) and both supplied flow diagrams. The current request authorized implementation; the verified local slice and run instructions are in [README.md](README.md). Unchecked items remain proposed work.

Checklist convention: `[x]` means implemented and locally verified as stated; `[ ]` means pending or awaiting external verification. Live provider calls, real target execution, and hosted CI remain separate acceptance gates.

## 1. Current workspace and completed documentation

- [x] Read the complete `simple_version.md`, including its examples, retry policy, local setup, evaluation metrics, and six-phase roadmap.
- [x] Inspect both original diagrams and trace their success, failure, investigation, retry, and escalation paths.
- [x] Establish the initial workspace state: only `simple_version.md` was present; no implementation, dependency manifest, existing test runner, or Git repository was found.
- [x] Copy the supplied images into the workspace using descriptive filenames and preserve the original image content.
- [x] Embed the detailed agent flow under section 3 of `simple_version.md`.
- [x] Embed the CI flow under section 11 of `simple_version.md`.
- [x] Create this checklist with context, component responsibilities, unresolved decisions, implementation dependencies, and acceptance criteria.
- [x] Verify all eight relative document links across both Markdown files and confirm both copied images match the originals using SHA-256 hashes.
- [x] Receive an instruction to begin development and verify a local Playwright baseline.

| Supplied file | Workspace copy | Purpose |
| --- | --- | --- |
| `D:/Downloads/mermaid-diagram.png` | [playwright-agent-workflow.png](docs/diagrams/playwright-agent-workflow.png) | Complete requirement-to-report loop with failure triage and next actions. |
| `D:/Downloads/mermaid-diagram (1).png` | [playwright-ci-workflow.png](docs/diagrams/playwright-ci-workflow.png) | Pull-request pipeline and failure reporting. |

The source document's references to an earlier document cannot be checked because that document was not supplied. The local source document and these two diagrams define the available context.

## 2. Product objective and operating model

Build an agent that accepts a natural-language browser-testing requirement for a configured local web application, creates validated Playwright tests, runs them, collects evidence, and explains the outcome. On failure, Jev provides structured evaluation and an LLM provides investigation or a proposed test correction. A deterministic policy validates the next action before another execution or escalation.

Example requirement from the source: test login, covering successful authentication and invalid-password handling. The intended outcome includes both scenarios, their expected results, executable tests, preserved run evidence, and a final report.

### Responsibilities established by the source

| Component | Responsibility | Boundary |
| --- | --- | --- |
| Playwright / Playwright Test | Browser interaction, assertions, test lifecycle, browser projects, and execution evidence. | Produces observed results; it is the execution engine. |
| LLM test planner | Convert a requirement into scenarios, prerequisites, test data, and expected outcomes. | Must identify missing information rather than invent application behavior. |
| Playwright test generator | Turn the plan and available application evidence into test source. | Generated tests must be validated before execution. |
| Result parser / failure normalizer | Convert actual runner output into structured results and failure evidence. | Must not substitute hardcoded sample failures for real metadata. |
| Jev evaluation | Evaluate failure category and retry suitability through a verified provider interface. | Provider identity, API, syntax, and response schema remain unverified. |
| LLM debugger | Investigate evidence and propose an explanation or test correction. | A proposal is input to validation, not permission to modify the application. |
| Decision validator / policy engine | Check evaluation, evidence, allowed actions, permissions, and remaining budgets. | Owns the final action decision; model output cannot bypass it. |
| Reporter / CI integration | Preserve results and evidence and present actionable summaries. | CI must not automatically modify or merge application code solely on model decisions. |

### Intended scope

- Natural-language requirements and existing Playwright tests.
- Local target applications, including Angular, React, or Next.js applications.
- Chromium, Firefox, and WebKit support, with the initial browser scope still to be selected.
- Screenshots, traces, errors, test source, and relevant DOM or accessibility evidence for investigation.
- Separate agent and application repositories with explicit access configuration.
- Failure classification, evidence-based retry decisions, selector investigation, bug reporting, and human escalation.
- Local operation first, followed by GitHub Actions or Jenkins integration.
- Labeled evaluation of the combined approach against an LLM-only baseline.

### Scope limits carried into the plan

- Application source repair, automatic merging, and unrestricted cross-repository writes are outside the described initial workflow.
- A product dashboard, hosted multi-user service, and additional automation frameworks are not requested.
- Python and TypeScript remain alternatives for orchestration; the example directory tree is illustrative.
- Sample URLs, repository paths, credentials, entry points, and commands are examples, not established environment facts.

## 3. Reconciled flow from the diagrams

### 3.1 Local agent workflow

1. **Testing Requirement:** receive the requirement and configured target application context.
2. **LLM Test Planner:** determine scenarios, expected behavior, setup, authentication, and required data.
3. **Playwright Test Generator:** produce test source; the document adds a validation requirement before execution even though the image has no separate validation node.
4. **Playwright Test Runner -> Browser Application:** execute approved tests against the configured application.
5. **Test Results and Artifacts:** collect actual status, attempt metadata, errors, screenshots, traces, and available supporting evidence.
6. **Test Passed? -> Yes -> Test Report:** report the result. A pass after a failed attempt must retain its retry history.
7. **Test Passed? -> No -> Failure Normalizer:** create a consistent evidence record.
8. **Failure Normalizer -> Jev Evaluation and LLM Debugger:** the image supplies evidence to both analysis components; the text also describes Jev-led routing into deeper debugging.
9. **Jev Evaluation and LLM Debugger -> Decision Validator:** validate their outputs against deterministic rules and current execution context.
10. **Decision Validator -> Next Action:** select an allowed action from the branches below.

| Next Action branch in the image | Path | Required completion behavior |
| --- | --- | --- |
| Retry | Return to Playwright Test Runner. | Validate the candidate test, remaining attempts, and environment before execution; preserve previous evidence. |
| Debug Selector | Inspect DOM / Trace -> LLM Debugger -> Decision Validator. | Produce an evidence-backed proposal, validate it, and either rerun within limits or stop for review. |
| Application Bug | Create Bug Report. | Save reproduction steps, expected and actual behavior, and evidence; finish with a report. |
| Human Review | Escalation. | Save an explanation, unresolved questions, and evidence; finish with a report. |

The image explicitly loops selector investigation back through the debugger and validator. It does not specify the exact patch-validation stage, when a validated correction returns to the runner, or final reporting after the two terminal failure branches. These are required design details to resolve, not existing functionality.

### 3.2 Pull-request / CI workflow

1. **Pull Request -> CI Build:** obtain the intended revision and build the application.
2. **Start Application:** start the configured target and verify readiness.
3. **Run Playwright Tests -> Result:** execute the configured suite and collect its status.
4. **Pass -> Publish Report:** publish the test result and relevant artifacts.
5. **Fail -> Collect Artifacts -> Jev + LLM Analysis:** preserve evidence and run the failure-analysis path.
6. **Generate Failure Summary -> PR Comment / Human Review:** present findings, evidence, and the validated recommended action.

The CI image omits requirement planning and generation. Proposed interpretation: the initial CI integration runs a previously validated suite and analyzes failures; generation stays in the local workflow unless explicitly added to CI scope. The CI image also does not explicitly authorize automated repair/rerun loops inside pull requests. Decide that policy separately during the CI phase.

### 3.3 Gaps and differences that must stay visible

| Gap or difference | Planning treatment |
| --- | --- |
| The image feeds Jev and the debugger from the same normalized failure; the text sometimes describes evaluation before debugging. | Decide sequential, parallel, or conditional invocation. Both outputs must be tied to the same failure and candidate version before validation. |
| The text's policy example adds `CHECK_ENVIRONMENT`, `INVESTIGATE_NETWORK`, and `LLM_INVESTIGATION`; the image shows only four high-level actions. | Define these as investigation routes or extend the action set explicitly. Do not silently discard them. |
| The retry-policy example sets `MAX_RETRIES = 2` but only demonstrates investigation/escalation routing. | Define an actual retry decision and precisely specify what the two-retry limit counts. |
| Build/startup failures occur before test-result artifacts exist. | Capture the relevant process output and report an environment/pipeline failure without inventing a browser failure. |
| The diagrams use binary pass/fail and omit skipped, interrupted, expected-failure, and incomplete runs. | Define status mapping and suite aggregation before reporting success. |
| The diagrams omit invalid provider output, service outages, and missing artifacts. | Define conservative fallback, partial-evidence reporting, and explicit analysis availability. |
| Repeated selector investigation can loop without increasing a test retry count. | Add an independent investigation/repair budget and a stop condition for unchanged proposals. |

## 4. Decisions to resolve before the affected implementation

The demo baseline uses reversible local choices. Target-specific decisions remain open until the application is supplied.

| ID | Decision / information needed | Current position | Blocks |
| --- | --- | --- | --- |
| D01 | Agent orchestration language and runtime | Selected for baseline: Node.js JavaScript with Playwright Test, keeping tests and runner in one runtime. | Resolved for baseline. |
| D02 | Actual target repository, application framework, start command, readiness check, and base URL | Unknown. `D:/My-Application`, `pnpm dev`, and port `3025` are examples. | Local execution against the target. |
| D03 | Existing Playwright setup, package manager, test locations, and output conventions | No target repository has been supplied or inspected. | Runner integration and configuration reuse. |
| D04 | LLM provider, model, API access, and usage limits | Implemented OpenAI Responses adapter with explicit model/key settings, request timeout and call budget. | Live generation/debugging verification. |
| D05 | Exact Jev product/provider and official API documentation | Verified official TypeSafe docs: https://docs.typesafe.ai/api; adapter uses POST /v1/systemone and Bearer auth. Live call awaits a key. | Live Jev proof of concept. |
| D06 | Test accounts, authentication setup, test data, and reset procedure | Unknown; example login values are placeholders. | Meaningful login tests and repeatability. |
| D07 | Initial browser and required browser matrix | Chromium, Firefox, and WebKit implemented and verified with two login scenarios each. | Resolved locally. |
| D08 | Repository access and correction permissions | Explicit context/source allowlist; application source read-only; generated candidates stored per run; locator corrections require --allow-repair. | Actual target configuration. |
| D09 | Runner retries, agent retries, total attempts, and investigation limits | Zero runner retries; maximum 3 suite attempts, default 1 correction, 4 investigations, 8 provider calls, 180 seconds. | Resolved locally. |
| D10 | Jev/debugger scheduling, disagreement handling, and fallback | Sequential Jev evaluation then debugging; disagreement, stale/invalid/unavailable analysis stops for review. | Live provider verification. |
| D11 | CI provider, triggering events, report destinations, and comment permissions | GitHub Actions PR verification and manual target workflow; reports as artifacts, no comment publishing. | Hosted execution. |
| D12 | Evidence retention, redaction, external-provider payload, and storage limits | Redacted selected payloads; bounded input/call budgets; raw evidence local and Git-ignored; local retention manual, CI retention 7 days. | Target-specific retention review. |
| D13 | Initial user entry point and report formats | npm scripts call src/cli.js; per-run HTML, Markdown, JSON, logs, and review packages. | Resolved locally. |

- [ ] Resolve D02-D03 before attempting the actual target baseline; D01 is resolved for the local demo.
- [ ] Resolve D04 and D06 before live test generation against authenticated features.
- [x] Identify D05 and verify the official API contract before implementing provider behavior; live calls still require a key.
- [x] Resolve D07-D10 for the implemented browser and action policies.
- [x] Resolve D11-D13 for local reports and the supplied CI workflows.

## 5. Proposed internal data contracts

These logical records guide the versioned implementation in src/contracts.js, src/results.js, src/policy.js, and src/reporter.js. Provider wire schemas are mapped separately in src/providers.js. Run, test, browser, and attempt identities remain attached to each record.

| Record | Minimum information to preserve |
| --- | --- |
| Requirement / target context | Requirement text, target URL, permitted repository paths, scenarios, expected outcomes, authentication references, data/setup needs, and unresolved questions. |
| Test plan | Scenario identifiers, preconditions, steps, expected assertions, data needs, browser scope, and links back to the requirement. |
| Generated test candidate | Source location/version, plan references, supporting application evidence, generator identity, and validation results. |
| Execution result | Run/test identifiers, browser/project, candidate version, start/end times, duration, actual and expected status, process exit, runner retry index, and agent attempt index. |
| Normalized failure | Framework, test title/location, error type/message/stack, URL if available, expected/actual behavior if known, browser, test source reference, attempt counts, and evidence references. |
| Artifact manifest | Run/test/attempt ownership, screenshot/trace/video/log paths, availability, capture time, and retention/redaction status. Missing evidence must be explicit. |
| Evaluation | Provider, failure identity, validated category, retry recommendation, rationale/evidence if supported, and request/response validation status. Confidence is optional only if the verified interface supplies it meaningfully. |
| Debug proposal | Failure identity, inspected evidence, suspected cause, proposed test change/diff or investigation, preservation of the original assertion intent, and validation status. |
| Action decision | Allowed action, reason, supporting evidence, policy version, permissions checked, remaining budgets, and the specific failure/candidate it applies to. |
| Final report | Scenario results, initial and final outcomes, full attempt history, evidence links, evaluated cause, actions taken, unavailable analysis, unresolved findings, and terminal disposition. |

- [ ] Define required versus optional fields and explicit unknown/missing values.
- [x] Define a version for stored records so reporting and parsing can evolve together.
- [x] Ensure results from different tests, browsers, attempts, or candidate versions cannot be combined accidentally.
- [x] Keep raw local evidence separate from the minimal payload selected for an external evaluation request.
- [x] Treat application text, DOM content, logs, and model responses as evidence; they cannot change the agent's allowed actions.

## 6. Failure taxonomy, actions, and stopping rules

The eight categories below come from the source document. A category describes a suspected cause; it does not by itself prove that a repair or retry is appropriate.

| Category | Example from the design | Investigation / policy requirement |
| --- | --- | --- |
| `SELECTOR` | Locator matches no element. | Compare the intended element with DOM/accessibility/trace evidence before proposing a locator change. |
| `TIMEOUT` | Page or element takes too long. | Distinguish slow rendering, absent elements, network delay, and application defects; no unconditional retry. |
| `ASSERTION` | Actual UI differs from the expectation. | Check the requirement, data, and observed behavior; do not weaken the assertion to produce a pass. |
| `NETWORK` | API request fails. | Inspect available request/error evidence and distinguish transient behavior from persistent failure. |
| `AUTHENTICATION` | Session or login problem. | Check configured identity, session setup, expiry, and expected behavior. |
| `ENVIRONMENT` | Server unavailable. | Check startup/readiness/configuration; do not treat an unreachable application as a selector defect. |
| `TEST_DATA` | Required data is missing. | Check fixtures, setup, isolation, and reset behavior before another run. |
| `UNKNOWN` | Evidence is insufficient. | Gather bounded additional evidence or escalate without asserting a root cause. |

- [x] Define separate outputs for failure category and retry suitability, as required by the source.
- [ ] Define how each category maps to permitted investigations and the four high-level diagram branches.
- [ ] Require evidence before classifying a failure as an application defect and creating a bug report.
- [x] Reject unsupported action names, malformed responses, and decisions for stale attempts.
- [ ] Define fallback for evaluation/debugger disagreement, unavailable APIs, and incomplete evidence.
- [x] Track Playwright retries separately from agent reruns and record the actual total number of executions per test/browser.
- [x] Set a total execution cap so nested retries cannot multiply beyond the intended limit.
- [x] Set investigation, repair, elapsed-time, and provider-call limits appropriate to the selected scope.
- [x] Stop on exhausted budgets, repeated unchanged proposals, cancellation, or unmet required preconditions.
- [x] Preserve original failures and corrections, including when a later attempt passes.

Proposed report dispositions to finalize during design:

| Disposition | Meaning |
| --- | --- |
| Passed | The required scenarios pass without an earlier failed attempt in this run. |
| Passed after retry | An unchanged test passes after a failure; expose the potential flakiness and all attempts. |
| Passed after test correction | A validated test change passes; record the diff and do not relabel the original failure as a clean pass. |
| Failed / bug report | Evidence supports a persistent failure and a reproducible report. |
| Needs human review | Evidence, disagreement, permissions, or exhausted budgets prevent a supported next action. |
| Blocked / incomplete | Setup, infrastructure, interruption, or execution failure prevents completion. |

Reporting must also preserve each runner status. Skipped or incomplete required scenarios cannot be silently counted as successful coverage. Define expected-failure semantics explicitly.

## 7. Ordered implementation checklist

The six phases retain the source roadmap. Local implementation now spans all six phases; provider and target acceptance gates requiring credentials remain open. The current detailed checklist is IMPLEMENTATION_CHECKLIST.md.

### Preparation: settle the executable design

Dependencies: decisions needed for the initial slice.

- [x] Record the selected orchestration language and package/runtime strategy: Node.js JavaScript, npm, Playwright Test.
- [ ] Identify the target application and inspect its existing test/configuration setup within authorized paths.
- [x] Select and verify the smallest first demonstration: valid and invalid login in Chromium against the bundled demo.
- [ ] Record target startup/readiness, credentials references, test-data setup, and cleanup.
- [x] Choose the agent entry point, generated-test location, run-output location, and report formats. The CLI uses `src/cli.js`, generated candidates in `runs/<id>/candidate-<n>/`, and HTML/Markdown/JSON reports.
- [ ] Convert the logical contracts and action rules into an agreed module/interface design.
- [x] Adapt the source's suggested directory tree to the chosen language and target setup; avoid duplicate executors.
- [x] Record browser, execution, investigation, and provider budgets and the required permissions.
- [x] Identify official Jev documentation and record unresolved provider questions.

Acceptance: the initial slice has defined inputs, outputs, module ownership, environment requirements, and explicit pending provider dependencies.

### Phase 1: Playwright baseline

Dependencies: preparation; known target application and runner strategy.

- [x] Establish Playwright Test with Chromium for the local baseline.
- [ ] Configure the actual target base URL; make local paths and application settings configurable.
- [x] Support a documented target-startup mode and a readiness check; identify who owns process cleanup.
- [x] Run manually verified valid and invalid login cases against the bundled demo.
- [x] Capture Playwright JSON, a runner log, and the runner exit status.
- [x] Configure failure screenshots, traces, and video for the baseline; target retention policy remains open.
- [x] Store artifacts by run, test, browser, and attempt so reruns cannot overwrite earlier evidence.
- [x] Capture startup/runner errors even when the browser test never begins.
- [x] Produce a local report for the passing demo (2 passed) and deliberate failure (1 failed, exit 1).
- [x] Document the verified local setup and commands in `README.md`.

Acceptance: a repeatable local run produces truthful pass/fail status and usable failure evidence without requiring an LLM or Jev.

### Phase 2: LLM test planning and generation

Dependencies: Phase 1; selected LLM and access; known behavior and test data.

- [x] Accept requirement text and the configured target context through the chosen entry point.
- [x] Generate a structured scenario plan with preconditions, actions, expected results, and missing information.
- [x] Cover both successful login and invalid-password handling for the initial example.
- [x] Supply relevant, permitted application evidence so generated routes and locators are grounded.
- [x] Produce Playwright Test source using the existing project conventions and configuration.
- [x] Validate syntax, imports, test discovery, required assertions, target scope, and allowed execution behavior before running generated source.
- [x] Keep credentials in the agreed configuration mechanism; do not reproduce the example password as a real credential.
- [x] Bound generation-correction attempts and report invalid/unusable generation clearly.
- [x] Save the requirement, plan, generated candidate, validation outcome, and provider/model identity needed to reproduce the decision.
- [x] Execute validated candidates through the Phase 1 runner and report scenario coverage.
- [x] Handle provider timeout, invalid output, and missing application information without fabricating a test success.

Acceptance: the login requirement yields reviewable scenarios and validated tests with meaningful positive and negative assertions, executed through the baseline runner.

### Phase 3: Jev proof of concept

Dependencies: confirmed Jev identity/documentation and API access. This provider investigation can be performed after development is authorized even if Phase 2 is still underway; production integration waits for the relevant contracts.

- [ ] Verify the official API or SDK, authentication, supported evaluation shape, response schema, versioning, limits, and error behavior.
- [x] Record documentation links and verification date; do not implement guessed endpoints or question syntax.
- [ ] Send one small, representative evaluation and retain a redacted request/response example.
- [x] Verify how to express the eight-category classification question.
- [x] Verify the separate retry-suitability question and its response representation.
- [x] Decide whether the two questions use one request or multiple requests based on the verified interface.
- [x] Design a provider adapter that maps verified responses to the internal evaluation contract.
- [x] Validate required fields and allowed values; reject malformed or unsupported responses.
- [x] Define credential/configuration errors, timeout handling, bounded request retries, and unavailability reporting.
- [ ] If Jev does not support the intended evaluation, record the gap and resolve the design before claiming integration.

Acceptance: a real, documented Jev request returns a validated result that maps to the internal contract. A mocked response alone does not complete this phase.

### Phase 4: Failure normalization and triage

Dependencies: Phase 1 real results and Phase 3 verified Jev interface; agreed contracts and analysis ordering.

- [x] Parse actual Playwright output into execution and normalized-failure records.
- [x] Extract title, error type/message/stack, browser, source reference, retry information, and available URL/expected/actual evidence.
- [x] Attach screenshot, trace, video, and log references when present; mark missing evidence explicitly.
- [x] Support multiple tests, browsers/projects, and attempts without mixing their results.
- [x] Map interrupted, skipped, expected-failure, setup-failure, and malformed-result cases according to the agreed status policy.
- [x] Select and redact the evidence payload used for provider analysis.
- [ ] Run category and retry evaluations and associate them with the exact failure record.
- [x] Implement the agreed ordering between Jev evaluation and LLM debugging.
- [x] Validate evidence and provider output before policy routing.
- [x] Add deterministic routing for selector, environment, network, general investigation, and escalation cases.
- [x] Report original results even when analysis fails or remains inconclusive.
- [x] Save evaluation rationale, policy decision, and supporting evidence for review.

Acceptance: real failures become traceable structured records and receive a permitted, explainable next action; invalid or missing analysis cannot produce an unchecked action.

### Phase 5: Debugging and controlled retry

Dependencies: Phases 2 and 4; explicit correction permissions and all retry/investigation limits.

- [x] Gather relevant DOM/accessibility/trace evidence for selector investigations, with a defined method for obtaining and reading it.
- [ ] Give the debugger the requirement, original assertion intent, current test source, failure, and relevant evidence.
- [ ] Generate an explanation and a constrained correction proposal; retain the original source and proposed diff.
- [x] Check that a locator change still targets the intended behavior and does not remove or weaken assertions.
- [x] Validate proposed changes in a controlled worktree or other agreed isolated test location.
- [x] Route every proposed action through the decision validator before applying a correction or executing again.
- [x] Implement retry only when evidence, policy, permissions, and all budgets allow it.
- [x] Enforce separate runner, agent, total-execution, and investigation/repair counters.
- [x] Record each execution against its exact candidate version; retain the original failure artifacts.
- [x] Stop unsupported changes, repeated ineffective fixes, and loops that consume investigation budget without progress.
- [x] Distinguish a corrected-test pass from a flaky unchanged-test pass in the final report.
- [ ] Create a bug report for a supported application-defect finding, including reproduction steps and evidence.
- [x] Create a human-review package for uncertainty, disagreement, exhausted budgets, or unavailable required access.
- [ ] Verify cancellation, process cleanup, and final reporting for every terminal path.

Acceptance: a known selector issue can produce a justified correction and controlled rerun; a genuine defect remains visible; persistent failures and repeated investigations stop within limits.

### Phase 6: CI/CD integration

Dependencies: stable local workflow, chosen CI provider, agreed permissions, and report policy.

- [x] Define pull-request triggers, revision identity, browser matrix, and whether CI runs existing tests only or also supports generation.
- [ ] Build the selected application revision and preserve build logs on failure.
- [ ] Start the application, wait for readiness, and capture startup failures separately from test failures.
- [x] Run the configured Playwright suite and retain its exit status through later reporting steps.
- [x] Upload reports and relevant artifacts on success and failure, including when analysis cannot run.
- [ ] Run the approved failure-analysis scope; explicitly decide whether CI may perform bounded test corrections/reruns or only produce recommendations.
- [x] Generate a failure summary with affected scenarios, observed behavior, evidence, analysis limitations, and the validated action.
- [x] Configure PR comments only for the agreed destination and permissions; provide a report artifact when commenting is unavailable.
- [x] Define trusted versus untrusted PR behavior for credentials, generated code, and provider calls.
- [x] Keep model conclusions from independently modifying/merging application code or masking failing required checks.
- [x] Define final check/exit semantics for clean pass, flaky pass, corrected-test pass, unresolved failure, and incomplete execution.
- [x] Set artifact retention and document required configuration and credentials references.
- [ ] Verify passing, failing, build-failure, startup-failure, and analysis-unavailable pipeline paths.

Acceptance: a pull request produces an accurate check result and accessible report; failures retain evidence and a useful summary even when evaluation or comment publication is unavailable.

## 8. Verification and evaluation checklist

Component and browser integration tests are implemented under test/. Live provider evaluations require configured API credentials.

### Focused component checks

- [x] Test real-result parsing with representative result fixtures, including multiple attempts and missing artifacts.
- [x] Test Jev response parsing for valid, malformed, unsupported-category, and incomplete responses.
- [x] Test deterministic routing and every stop condition independently of model output.
- [x] Test total-attempt accounting across runner retries, agent reruns, and candidate changes.
- [x] Test that stale or mismatched evaluation results cannot control another test/attempt.
- [x] Test provider timeout/unavailability and ensure the original test failure remains reportable.
- [x] Test rejection of corrections that weaken the requirement or exceed permitted changes.

### Controlled application scenarios

| Scenario | Expected evidence / acceptance |
| --- | --- |
| Working login button and valid account | Successful login assertion passes and the report links the executed scenario. |
| Invalid password | Expected rejection is verified; this negative scenario passing is a successful test. |
| Locator mismatch while the intended element exists | Evidence supports selector investigation; any correction preserves the original intent. |
| Login button actually missing from the application | The agent does not invent a replacement element or conceal a product defect with a selector change. |
| Slow API response | Timing evidence informs investigation; retry suitability is judged separately from the timeout label. |
| Failed network request | Available network evidence supports investigation and an evidence-based retry decision. |
| Incorrect expected text | Compare the supplied requirement with observed behavior; do not automatically change the expected value. |
| Missing test data or expired session | Identify the relevant setup/authentication evidence and avoid misleading selector repair. |
| Application unavailable | Preserve readiness/startup evidence and report an environment or blocked run. |
| Jev/LLM unavailable or invalid output | Preserve original results and use the documented fallback without unchecked execution. |
| Repeated failure or ineffective repair | Stop at the configured execution/investigation limits and produce a reviewable terminal report. |
| Pass after retry or correction | Preserve initial failure and accurately describe how the later pass was obtained. |

### Evaluation metrics from the source

- [ ] Build labeled cases with expected cause, acceptable next actions, and justified repairs before scoring model results.
- [ ] Measure failure classification accuracy as correct category predictions divided by labeled evaluated failures; expose unknown/abstained cases separately.
- [ ] Measure retry appropriateness against labeled retry decisions; record both harmful retries and missed justified retries.
- [ ] Measure selector repair success only when the corrected test passes and still checks the intended behavior.
- [ ] Measure false repair rate using adjudicated incorrect proposed repairs divided by adjudicated proposed repairs; report the denominator.
- [x] Measure execution, evaluation, debugging, and overall latency separately.
- [x] Record provider calls and token/usage information when available; do not assume every provider returns the same usage fields.
- [ ] Compare Jev-plus-LLM with an LLM-only baseline on the same labeled cases and evaluation conditions.
- [ ] Set acceptance thresholds after collecting baseline results; do not invent performance or accuracy targets now.

Acceptance: the evaluation report explains correctness, action quality, false repairs, latency, usage, and known limitations with reproducible examples.

## 9. Requirement coverage map

| Source area | Where it is retained in this plan |
| --- | --- |
| Objective, stack, and core principle | Sections 2, 4, and 7 Preparation. |
| Section 3: complete workflow | Section 3.1; Phases 1, 2, 4, and 5. |
| Section 4: runner, suggested structure, base URL | Decisions D01-D03; Preparation and Phase 1. |
| Section 5: failure collection | Section 5; Phase 4. |
| Section 6: categories and Jev questions | Section 6; Phases 3 and 4. |
| Section 7: selector debugger | Section 3.1; Phase 5. |
| Section 8: retry policy | Sections 3.3 and 6; decision D09; Phase 5. |
| Section 9: two repositories, capabilities, permissions | Sections 2 and 4; Preparation and Phase 1. |
| Section 10: testing and metrics | Section 8. |
| Section 11: CI integration | Section 3.2; Phase 6. |
| Sections 12-13: roadmap and target system | Section 7 and the completion checklist below. |
| Detailed agent image | Sections 3.1 and 3.3; Phases 2, 4, and 5. |
| CI image | Sections 3.2 and 3.3; Phase 6. |

## 10. Future completion criteria

- [ ] A configured requirement can be planned, converted into validated Playwright tests, and executed against the intended application.
- [ ] Passing, failing, retried, corrected, blocked, and escalated outcomes preserve truthful status and evidence.
- [ ] Jev evaluation uses a verified API and validated response mapping.
- [ ] LLM investigations and corrections remain grounded in application evidence and the original requirement.
- [ ] Every execution or correction is subject to deterministic policy and explicit budgets.
- [ ] Bug reports and escalation packages provide actionable evidence without automatic application source changes.
- [ ] Local setup and the selected CI workflow are documented and demonstrated.
- [ ] Required browser coverage and permissions decisions are implemented and verified.
- [ ] Labeled evaluations and the LLM-only comparison are recorded with limitations.
- [x] No placeholder provider integration, fabricated artifact, or hidden retry pass is presented as completed functionality.

## 11. Context handoff for the next work session

Read this file together with [simple_version.md](simple_version.md). The embedded images are the supplied conceptual flows; sections 3.3 and 4 preserve their unresolved details. Do not interpret unchecked tasks or example commands as work already completed.

Current implementation progress: The complete local CLI pipeline is implemented in src/cli.js, src/agent.js, and focused modules for contracts, generation, execution, providers, policy, results, process control, reporting, and evaluation. Generated tests use a restricted action plan and preserve assertions during locator corrections. Demo suites verify success, failure, retry, correction, and escalation. All three browser engines passed the login matrix. Provider adapters are contract-tested; no live API calls have been made without credentials.

Next action: Configure .env and the target context, then run the documented commands in README.md. Complete the real OpenAI/Jev, actual target, hosted CI, and human-adjudicated evaluation gates in IMPLEMENTATION_CHECKLIST.md.
