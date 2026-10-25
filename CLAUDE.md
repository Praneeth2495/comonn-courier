# Working in this repo

## Branching: `staging` is the working branch, `main` is production

Every file save made via the Edit/Write tools is auto-committed and pushed
**to the `staging` branch**, never `main` — the hook (`.claude/settings.local.json`,
`PostToolUse` on `Write|Edit`) explicitly checks out `staging` before
committing and pushes with `git push origin staging`, regardless of whatever
branch happens to be checked out locally.

`main` only moves when the user explicitly asks for a merge (e.g. "merge
staging into main", "ship this to production"). That merge+push is itself
the production deploy trigger — see below. Do not push to `main` any other
way, and do not merge without being asked.

This split exists because **both** Railway's production backend and
Vercel's frontend auto-deploy from GitHub pushes (see topology below) — so
every auto-commit used to deploy straight to production with no review
step. Discovered 2026-10-25 when routine Edit-tool saves during a staging
load-test fix turned out to have been auto-deploying to production the
whole time, including a few seconds of a known-buggy intermediate commit.
Fixed by moving the hook to `staging` and re-scoping both platforms'
deploy triggers (Railway's GraphQL `deploymentTrigger*` mutations; Vercel's
is inherent to its GitHub integration, unchanged — it already only watches
`main`, it's the hook that changed).

## Auto-commit only covers Edit/Write tool calls

`npm install`, codegen scripts, or any other command that writes files
directly to disk (e.g. a Node script regenerating an image) bypasses the
hook entirely — those changes sit as uncommitted local diffs on `staging`
until something else notices.

This caused a real incident: `npm install @sentry/react` updated
`package.json`/`package-lock.json` on disk, but only `main.jsx` (edited via
the Edit tool) got auto-committed and pushed. Every Vercel build after that
failed trying to resolve `@sentry/react`, since the dependency was never
actually recorded in the pushed `package.json` — and the failure wasn't
obvious because Vercel kept serving the last successful deployment instead
of erroring visibly.

**Rule**: after running `npm install`, a codegen script, or anything else
that modifies files outside the Edit/Write tools, run `git status` and
commit+push those files explicitly (to `staging`) before considering the
change deployed to staging.

## Deployment topology

- `comonn-courier-staging.up.railway.app` — staging backend, Railway
  environment `c6b14240-0ecd-4feb-99ac-c4d8aedb3dea`, auto-deploys on every
  push to the `staging` branch (GitHub deployment trigger). This is where
  every Edit/Write auto-commit lands within seconds.
- `api.comonn.in` — production backend (Express), Railway environment
  `15fa7dcd-4d54-499b-811a-a106abe58ada`, project
  `405354da-6292-4fe4-80e5-890f628e7a1e`. Auto-deploys on every push to
  `main` (GitHub deployment trigger) — which in practice means only when
  someone explicitly merges `staging` → `main`. Can also be deployed
  directly with `railway up --service comonn-courier --project
  405354da-6292-4fe4-80e5-890f628e7a1e --environment
  15fa7dcd-4d54-499b-811a-a106abe58ada` if a one-off deploy from local disk
  is ever needed, bypassing git — but that's the exception, not the normal
  path. Poll `railway api` for the deployment's `status` field — SUCCESS is
  the only terminal success state.
- `www.comonn.in` (and bare `comonn.in`) — frontend (React/Vite), served by
  **Vercel**, auto-deploying from pushes to `main` only — so it moves in
  lockstep with the production backend trigger above: a `staging` → `main`
  merge ships both at once. Pushes to `staging` do not touch Vercel's
  production deployment at all.
- Railway's staging `comonn-courier` service also builds and serves a copy
  of the frontend, but only reachable via its own `*.up.railway.app` URL —
  not any public domain.
- To check Vercel build status: `npx vercel ls` (lists recent deployments
  with Ready/Error status) and `npx vercel inspect <url> --logs` for a
  specific deployment's build log.
