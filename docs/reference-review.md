# Test-Agent reference review

Reviewed on 2026-09-28: [Wool-xing/Test-Agent](https://github.com/Wool-xing/Test-Agent), its [runtime architecture](https://github.com/Wool-xing/Test-Agent/blob/main/runtime/ARCHITECTURE.md), and runtime/skill organization.

The architecture separates orchestration, routing, input/output contracts and evidence from extensible execution adapters. Its CLI exposes planning, execution and diagnostics. It describes staged delivery and labels some early routing verification as stub based. Those documents do not establish that arbitrary websites receive complete business-function coverage.

This project applies those design ideas with an independent JavaScript/Playwright implementation:

| Concern | Local implementation |
| --- | --- |
| Understand the target | `src/discovery.js`: authenticate, crawl links/sitemap, inspect controls, explore navigation states |
| Plan from evidence | `src/providers.js`: bounded OpenAI requests with observed controls and replay steps |
| Validate execution contracts | `src/contracts.js`: schema, route, locator and permitted-action checks |
| Execute and inspect | `src/runtime.js`, `src/runner.js`: browser tests, assertions, network/page errors |
| Preserve evidence and gaps | `discovery.json`, screenshots, generated plans, Playwright artifacts, HTML/JSON coverage |
| Bound recovery | Existing evaluator, policy and attempt limits |

No upstream implementation code or dependencies were copied or installed. This is an adaptation of architectural ideas, not an embedded Test-Agent runtime. Its advertised agents, mobile/API/security suites and integrations are not features of this application.

The [direct executor implementation](https://github.com/Wool-xing/Test-Agent/blob/main/runtime/orchestrator/direct.py) also distinguishes blocking versus tolerable upstream failures and contains failure cutoffs. Here, unavailable AI planning leaves independently executable baseline tests available, marks coverage as partial, and stops further planning after two errors. Browser failures retain their original evidence and continue to use this project's stricter retry policy.

## OpenAI compatibility

The configured legacy `gpt-4` model uses Chat Completions and does not support native structured outputs. The adapter therefore prompts for JSON and validates it locally; unsupported or invalid plans produce explicit coverage gaps. Other supported models use the existing Responses API JSON-schema path. See [OpenAI GPT-4 model documentation](https://developers.openai.com/api/docs/models/gpt-4) and [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs).
