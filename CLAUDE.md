# Working in this repo

## Auto-commit only covers Edit/Write tool calls

Every file save made via the Edit/Write tools is auto-committed and pushed
immediately. But `npm install`, codegen scripts, or any other command that
writes files directly to disk (e.g. a Node script regenerating an image)
bypasses that hook entirely — those changes sit as uncommitted local diffs
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
commit+push those files explicitly before considering the change deployed.

## Deployment topology

- `api.comonn.in` — backend (Express), deployed via Railway
  (`railway up ... --service comonn-courier --project
  405354da-6292-4fe4-80e5-890f628e7a1e --environment
  15fa7dcd-4d54-499b-811a-a106abe58ada`). Poll `railway api` for the
  deployment's `status` field — SUCCESS is the only terminal success state.
- `www.comonn.in` (and bare `comonn.in`) — frontend (React/Vite), served by
  **Vercel**, auto-deploying from pushes to `main` on GitHub
  (`github.com/Praneeth2495/comonn-courier`). This is a separate pipeline
  from the Railway deploy above — pushing to `main` is what ships frontend
  changes to the public site, not `railway up`.
- Railway's `comonn-courier` service also builds and serves a copy of the
  frontend, but only reachable via `api.comonn.in` or its own
  `*.up.railway.app` URL — not the public domain.
- To check Vercel build status: `npx vercel ls` (lists recent deployments
  with Ready/Error status) and `npx vercel inspect <url> --logs` for a
  specific deployment's build log.
