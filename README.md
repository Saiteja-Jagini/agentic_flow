# Playwright + Jev testing agent

A local command-line application implementing the workflow in [plan.md](plan.md): requirement → scenario plan → validated Playwright tests → execution evidence → evaluation/debugging → bounded action → report.

The application includes OpenAI planning/debugging, a TypeSafe Jev adapter, Chromium/Firefox/WebKit projects, existing-suite execution, managed application startup, conservative local analysis, locator correction, retry budgets, evaluation tooling, and GitHub Actions workflows. A web dashboard is outside the source plan; each run produces a standalone HTML report.

## Package and use with Codex agents

Build a local npm package from this folder, then install it in the application repository:

```powershell
cd D:\ardberg_agent
New-Item -ItemType Directory -Path dist -Force | Out-Null
npm.cmd pack --pack-destination dist
cd D:\path\to\your-app
npm.cmd install --save-dev D:\ardberg_agent\dist\ardberg-agent-1.0.0.tgz
npx.cmd playwright install chromium
npx.cmd ardberg init --url http://localhost:3000
```

`ardberg init` uses the installed Playwright CLI to generate `.codex/agents/playwright_test_planner.toml`, `playwright_test_generator.toml`, and `playwright_test_healer.toml`. If the project has no Playwright config, it creates `playwright.config.cjs`; it also creates `tests/seed.spec.ts` and a guide in `specs/`. Existing agent definitions are left unchanged. For an existing Playwright config, pass `--config path/to/playwright.config.ts` when needed.

Write application requirements as Markdown files in `specs/` using the [spec guide](specs/README.md), and edit `tests/seed.spec.ts` to establish the required starting state. In Codex, ask: “Use `playwright_test_generator` to implement `specs/my-flow.md` with `tests/seed.spec.ts` against `http://localhost:3000`. Save the tests under `tests/`, run them, and preserve the stated expectations.” The Playwright planner can help refine the spec first; the healer can investigate failures. These agents run in Codex interactively. `ardberg init` prepares them; it does not invoke them or turn Markdown into tests on its own.

After reviewing the generated Playwright tests, start the application and run the suite through Ardberg:

```powershell
npx.cmd ardberg run --existing-config playwright.config.cjs --url http://localhost:3000 --max-attempts 1
```

Use your existing Playwright config path if you already have one. `--url` sets `TARGET_BASE_URL` for the runner. Reports and evidence are written to the application repository's `runs/<run-id>/` directory. The authored tests remain in its `tests/` directory; the run report records their actual results. The package is local and private; publishing to a registry is a separate step.

If you write specs and generate tests in this Ardberg repository itself, run those tests with `npm.cmd run agent -- run --existing-config playwright.authored.config.cjs --url http://localhost:3000 --max-attempts 1`. The existing `playwright.config.js` selects only the demo or login template, so it does not select newly authored tests.

If your authored tests need credential environment variables, keep their values in the application's `.env` and pass only their names with `--secret-env`, for example `--secret-env TEST_EMAIL,TEST_PASSWORD`. Ardberg forwards only those named secrets to the trusted test process.

## Quick start

### Automatically test your website

Start your target website in another terminal. Keep your existing `.env` and set:

```dotenv
OPENAI_API_KEY=your-api-key
OPENAI_MODEL=gpt-4
TARGET_BASE_URL=http://127.0.0.1:3000
TARGET_LOGIN_PATH=/login
TARGET_VALID_EMAIL=your-test-account-email
TARGET_VALID_PASSWORD=your-test-account-password
```

The last three settings are optional for public websites. Use an existing test account for protected pages. If the configured login path has no password field, the agent tries observed same-site sign-in links. Jev credentials, a hand-written context and a requirement prompt are not required.

```powershell
npm.cmd ci
npx.cmd playwright install chromium
npm.cmd run test:target
```

`npm.cmd start` and `npm.cmd run test:website` run the same automatic website workflow. **`test:target` now discovers the website; `test:login` retains the previous login-only template.**

The flow is: URL → login/session → links, sitemap and navigation states → observed page/control catalog → baseline and OpenAI-generated scenarios → validated Playwright execution → failure analysis → HTML coverage report. It checks page loading, uncaught browser errors, failed same-origin requests, visible headings, navigation and supported form controls. It saves screenshots, the discovered graph, plans, generated tests, and failure traces/videos.

Defaults: 25 pages/states, depth 3, 30 explored navigation controls, 8 OpenAI requests and 10 minutes total. Every discovered state gets baseline tests; AI requests add up to two scenarios per state. Requests stop after two provider/validation errors. Increase budgets for larger websites:

```powershell
npm.cmd run test:target -- --max-pages 50 --max-depth 5 --max-interactions 60 --max-provider-calls 50 --timeout 1800
```

For a short run: `npm.cmd run test:target -- --max-pages 3 --max-provider-calls 2`. For another URL: `npm.cmd run test:target -- --url http://localhost:8080`.

Open the printed `runs/<run-id>/report.html`. Its coverage section lists discovered states, executed tests, screenshots, excluded actions, authentication status and unvisited areas. `discovery.json` includes the link graph, forms and controls. `partial` (exit 2) means a discovery or AI coverage budget/gap remains, even when executed tests passed.

If login fails, the agent continues on public pages and records the login URL, HTTP errors and `authentication.png`. A rejected login leaves protected pages outside verified coverage; check the test account and the website's authentication configuration. It does not repeatedly try alternative passwords.

Automatic discovery cannot guarantee every hidden route or business rule. It excludes destructive actions, payments, unknown form submissions and non-read API calls; CAPTCHA, MFA, external SSO and specialized controls need additional setup or an authored suite. Page text/observed controls are sent to OpenAI for planning, with configured credentials redacted. Saved sessions and browser artifacts may contain private website data; keep `runs/` local.

See [reference review](docs/reference-review.md) for the Test-Agent architecture ideas incorporated here and the exact scope of the integration.

### Local demonstration

Node.js 22 or newer is required (verified locally with Node 24). In Windows PowerShell:

```powershell
cd D:\ardberg_agent
npm.cmd ci
npx.cmd playwright install chromium
npm.cmd run demo
```

The demo needs no API keys or test credentials. It starts its own local server, generates a login plan and tests, runs valid and invalid login scenarios, and stops the server. Open the printed `runs/<run-id>/report.html` directly in your browser.

Use `npm.cmd`/`npx.cmd` on Windows if PowerShell blocks the `.ps1` launchers. On macOS/Linux, use `npm`/`npx`.

## Credentials

Copy [.env.example](.env.example) to `.env` and edit it locally:

```powershell
Copy-Item .env.example .env
```

| Mode | Required credentials/configuration |
| --- | --- |
| Demo and component tests | None |
| Your app's login template | `TARGET_VALID_EMAIL`, `TARGET_VALID_PASSWORD`, `TARGET_INVALID_PASSWORD`, plus its URL, routes, labels and expected error in `.env` |
| Natural-language planning | `OPENAI_API_KEY` and `OPENAI_MODEL` |
| OpenAI failure analysis | The same OpenAI settings |
| Jev + OpenAI analysis | `JEV_API_KEY`, `JEV_MODEL=jev-latest`, and both OpenAI settings |

`OPENAI_MODEL` must name a model available to your API account. Legacy `gpt-4` uses Chat Completions with local JSON validation; supported newer models use the [OpenAI Responses API with structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs). An API key is separate from a ChatGPT subscription.

Create a Jev key through your TypeSafe account. The adapter uses the documented Bearer authentication and `POST https://api.typesafe.ai/v1/systemone`, asking for the failure category and retry suitability in one request. [Official TypeSafe API reference](https://docs.typesafe.ai/api)

Do not send keys or passwords in chat. Environment variables already set in the terminal override `.env`. Only the named test-data variables are available to generated browser actions; provider keys are removed from child-process environments.

## Test your application

For the email/password login template, fill out every `TARGET_*` setting in `.env`, start the app in another terminal, then run:

```powershell
npm.cmd run test:login
```

For general requirements, edit [examples/app.context.json](examples/app.context.json) to describe the target's routes, locator catalog, known expected text, and the names of test-data environment variables. The model receives these names, not their values. You must supply the application's actual behavior; the agent rejects missing information.

First generate a reviewable plan without executing browser actions:

```powershell
npm.cmd run agent -- plan --context examples/app.context.json --requirement "Verify successful login and invalid-password handling."
```

Then execute the saved plan (replace the path with the printed run directory):

```powershell
npm.cmd run agent -- run --context examples/app.context.json --plan runs/<run-id>/plan.json --evaluator jev --allow-repair
```

Or plan and execute in one command:

```powershell
npm.cmd run agent -- run --context examples/app.context.json --requirement "Verify successful login and invalid-password handling." --evaluator jev --allow-repair
```

You can run the authored [login plan](examples/login.plan.json) without an LLM key:

```powershell
npm.cmd run agent -- run --context examples/app.context.json --plan examples/login.plan.json --evaluator local
```

Planning supports navigation, fill, click, key press, select, check, visibility assertions, exact text assertions, and exact URL assertions. Tests use the supplied catalog; literal passwords, arbitrary JavaScript, undeclared routes, extra schema fields, and assertion-free scenarios are rejected. Navigation stays on the target origin. Cross-origin SSO, file uploads and application data-reset hooks require an extension or an existing trusted Playwright suite.

## Existing tests and app startup

To reuse an existing trusted suite:

```powershell
npm.cmd run agent -- run --context examples/app.context.json --existing-config D:/MyApp/playwright.config.ts --evaluator local
```

The target project needs its own dependencies. Its configuration controls browser projects. The agent overrides retries to zero, sets one worker, retains JSON results/exit status, and puts new artifacts in the run directory. Existing tests are trusted executable code; automatic source repair is limited to generated plans. Custom screenshot/video/trace settings for existing suites remain in their own config.

To let the agent build and start your app, add these optional fields to the context:

```json
{
  "repository": "D:/MyApp",
  "readinessPath": "/login",
  "startup": {
    "build": ["npm", "run", "build"],
    "command": ["npm", "run", "dev", "--", "--host", "127.0.0.1"]
  },
  "sourceFiles": ["src/Login.tsx"]
}
```

These are examples: use the real commands and filenames for your app. Omit `build` if unnecessary. Commands are executable/argument arrays. They run only when explicitly present in your local context, never from a model response. The agent captures build/startup logs, waits for readiness, and stops processes it starts. If you start the app yourself, it stays running after the agent finishes.

Source evidence is optional and read-only. Only explicitly listed files within the configured repository are read; symlink/path escapes, unsupported files, and oversized inputs are rejected.

## Failure analysis and limits

| Option | Behavior |
| --- | --- |
| `--evaluator local` | Conservative deterministic rules; no model calls |
| `--evaluator jev` | Jev classification/retry question followed by OpenAI debugging |
| `--evaluator llm` | OpenAI analysis without Jev, for the comparison baseline |
| `--debugger local` | Use local evidence matching instead of OpenAI debugging |
| `--allow-repair` | Allow a locator correction when exactly one observed element matches the original declared intent and role |
| `--max-attempts 3` | At most 3 suite executions, including the first |
| `--max-repairs 1` | At most 1 locator correction |
| `--max-investigations 4` | At most 4 failure investigations |
| `--max-provider-calls 8` | At most 8 total provider requests; no hidden HTTP retries |
| `--timeout 180` | Total elapsed budget in seconds |
| `--provider-timeout 30` | Timeout for each provider request |
| `--readiness-timeout 15` | Target readiness timeout |

Each rerun executes the suite again. With Playwright retries fixed at zero and at most three agent attempts, each test/browser runs at most three times. Corrected tests retain their original plan and assertions; only a locator catalog entry changes. No application source is edited.

A retry needs observed transient HTTP evidence and agreement between evaluation and debugging. A timeout alone cannot authorize a retry. Jev's retry probability threshold is 0.8, and its category confidence threshold is 0.65; these are conservative policy settings, not measured accuracy guarantees. Disagreement, invalid responses, service outages, ambiguous/missing controls, exhausted budgets, or unchanged corrections lead to human review.

`Ctrl+C` cancels the run and writes a terminal report. A suspected bug report is generated only when analysis identifies an assertion mismatch with page evidence; it remains a hypothesis for human confirmation.

| Exit | Meaning |
| --- | --- |
| 0 | Clean pass or successful plan-only operation |
| 1 | Unresolved failure, review, pass after retry, or pass after correction |
| 2 | Configuration/setup blocked, incomplete execution, or cancellation |

A pass after retry/correction deliberately remains nonzero for CI review. Skipped, expected-failure, interrupted, empty, and malformed results never become a clean pass.

## Reports and evidence

Each run has its own directory:

```text
runs/<run-id>/
  plan.json, context.json
  candidate-1/generated.spec.js, candidate.json, plan.json, context.json
  attempt-1/playwright.json, runner.log, discovery.log, artifacts/
  corrections-after-1.json           # when a correction is applied
  summary.json, summary.md, report.html, pr-summary.md
  human-review.md or suspected-bug.md # for non-clean outcomes
```

`candidate-1/generated.spec.js` contains readable Playwright `test.describe`, `test`, browser actions, and assertions. It imports the adjacent `plan.json` and `context.json` for scenario metadata and uses `src/runtime.js` to collect failure evidence. Later candidates show any permitted locator correction. Generated files remain in the run directory; reviewed, reusable tests belong in `tests/`.

The JSON report includes every attempt, test/browser identity, candidate hash, errors, artifact availability, captured URL/DOM/accessibility/network evidence, evaluations, policy decisions, provider usage, timing, and correction history. Reports escape HTML from application/model text. Provider payloads are separate redacted records; they exclude raw images/videos/traces and local artifact paths.

Raw Playwright traces/screenshots/videos may contain entered test data. `runs/` and `.env` are Git-ignored. Local runs remain until you remove them; CI artifacts expire after seven days. Use dedicated test accounts and restrict access to artifacts.

## Demonstrations, tests, browsers and evaluation

```powershell
npm.cmd run demo:failure
npm.cmd run demo:repair
npm.cmd run demo:retry
npm.cmd run agent -- demo --scenario missing-button --allow-repair
npm.cmd run agent -- demo --scenario network
npm.cmd test
npm.cmd run test:integration
npm.cmd run eval
npm.cmd run doctor
```

The failure, correction, and retry demos intentionally return nonzero statuses. The integration test harness verifies these expected outcomes and returns zero when they behave correctly.

Install additional browsers and run the matrix:

```powershell
npx.cmd playwright install firefox webkit
npm.cmd run agent -- demo --browser chromium,firefox,webkit
```

`eval` measures classification and retry recommendations on labeled fixtures and records abstentions, unavailable analysis, latency, calls and token usage. For a live Jev-plus-LLM versus LLM-only comparison using your API keys:

```powershell
npm.cmd run eval -- --evaluator compare
```

The bundled fixtures are regression checks, not evidence of real-world model accuracy. Repair quality also requires human adjudication that the original requirement is still satisfied.

## CI and implementation status

[Agent verification](.github/workflows/ci.yml) runs component tests, browser integrations and demo browser coverage on pushes/PRs with read-only permissions and no API secrets. Reports upload even when checks fail. [Configured target tests](.github/workflows/target.yml) is a manual workflow for a committed context and reviewed plan; configure its target and repository secrets first. It runs one attempt and does not apply corrections. PR-summary files are included as artifacts; the workflows do not post comments.

The workflow setup follows [Playwright's CI guidance](https://playwright.dev/docs/ci-intro). Hosted CI execution requires pushing this folder to your GitHub repository.

See [IMPLEMENTATION_CHECKLIST.md](IMPLEMENTATION_CHECKLIST.md) for verified coverage and remaining external validation. Live OpenAI/Jev calls and your actual application cannot be verified until you configure the corresponding credentials and target.

