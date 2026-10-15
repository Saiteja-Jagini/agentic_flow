# Specs

Write one Markdown file per feature or user flow. These files describe expected behavior; Playwright executes the generated `.spec.ts` or `.spec.js` tests in `tests/`.

Use this format as a starting point:

```markdown
# Project list

**Seed:** `tests/seed.spec.ts`

## Scenario: A signed-in user opens the project list

Preconditions:
- A test account is signed in by the seed test or a Playwright fixture.

Steps:
1. Navigate to `/projects`.
2. Locate the project list.

Expected results:
- The project list is visible.
- The page shows the expected empty state or known fixture project.
```

Replace the example with your application's real route, data, and expected results. Prepare `tests/seed.spec.ts` so the agent can reach the starting state. Then ask Codex to use `playwright_test_generator` with the spec and seed file. Review the generated tests in `tests/` before using them as a required PR check.
