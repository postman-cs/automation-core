# @postman-cs/automation-core

Shared runtime foundations for Postman Enterprise Automation Suite, published as `@postman-cs/automation-core`. It owns suite's HTTP error taxonomy, retry predicate, access-token gateway core, cassette transport, logging, context detection, secrets-resolver helpers, and telemetry. Actions consume package through npm and inline it into self-contained bundles. This is an ESM npm library, not GitHub Action.

## Structure

```
src/
  index.ts                 # Root public exports
  http/                    # HttpError, retry policy, access-token gateway core, error injection
  cassette.ts              # Dev/test record/replay subpath export
  route-manifest.ts        # Fail-closed static route extraction + manifest validation (subpath export)
  telemetry.ts             # Fire-and-forget completion-event client
  logger.ts                # Structured redaction-safe logging
  ci-context.ts            # CI-system detection
  repo-context.ts          # Repo/SCM detection
  secrets-resolver.ts      # Provider-scoped resolver helpers
tests/                     # Vitest unit and package-contract tests
```

## Commands

```bash
npm ci
npm run build       # rm -rf dist && tsc -p tsconfig.build.json  (tsc, NOT esbuild)
npm run typecheck   # tsc --noEmit -p tsconfig.json
npm test            # vitest run
npm run lint        # eslint .
npm run verify:package # build first; verifies root/cassette exports + npm pack
```

`prepublishOnly` runs `build`. Published `files` are `dist/`, `README.md`, `LICENSE`; `main` is `dist/index.js`.

## Wire Contract

Emits one `completion` event per action run, after `team_id` resolves, at `schema_version` 3. The full field table lives in `README.md` ("What it sends"); don't duplicate it here. No secrets, spec content, clear repo/org names, or raw ref names. Opt out with `POSTMAN_ACTIONS_TELEMETRY=off` or `DO_NOT_TRACK`.

Collector is the `postman-automation-events-worker` Worker (`events.pm-cse.dev`), which accepts `schema_version` 1, 2, and 3, defaulting fields sender's version predates to `unknown`.

## Gotchas

- Builds with `tsc` to emit clean ESM library (no bundling); consuming action's esbuild does inlining. Each action passes its own version explicitly as the `actionVersion` option; when omitted the core resolves `GITHUB_ACTION_REF`, then the `__ACTION_VERSION__` define, then `'unknown'`.
- Never log or commit credentials, access tokens, PMAKs, cassette request bodies, or raw captures.
- Safe HTTP reads MUST use the repo-sync superset predicate: transport failures, 408, 429, every 5xx, and recognized timeout/downstream body markers. Unsafe mutations MUST opt in before retry or fallback resend.
- Cassette replay is fail-closed on unknown keys and exhausted queues. Only fixtures with `repeatLast: true` may repeat final response.
- client is fire-and-forget: telemetry failure must never fail or slow action run.
- Schema changes must stay backward compatible -- collector ingests already-released actions still on `schema_version` 1.

## CI

`.github/workflows/ci.yml` runs single `gate` job that fans out lint, typecheck, test, build, and actionlint
as backgrounded shell processes on one runner: wall-clock is `max(gate)`, not
`sum`, setup runs once, and every gate prints its result under a `::group::`
block even when another fails.

This is library: `build` is compile check and its `dist/` is gitignored, so there is no dist-drift gate and no commit-message gate.

See workspace `../../docs/CI.md` for shared rationale.
