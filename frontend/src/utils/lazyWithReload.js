import { lazy } from 'react';

// This app ships many small deploys a day (every Edit/Write save auto-
// commits and pushes — see CLAUDE.md), and Vercel only keeps the current
// build's asset files on disk. A browser tab left open across a deploy
// still has the OLD index.html's chunk-hash references in memory, so the
// first time it navigates to a route/panel it hasn't loaded yet, the
// dynamic import() for that lazy() chunk 404s against the NEW deployment
// — React has no built-in recovery for that, so it throws, and the
// top-level Sentry.ErrorBoundary in main.jsx catches it with its generic
// "Something went wrong" fallback. That's the exact bug this fixes: a
// plain refresh always "resolves" it because it fetches the current
// index.html + current chunk manifest, which is all a stale-chunk error
// ever actually needed.
//
// Wrapping every lazy() import factory with this: on a failed dynamic
// import, if the error looks like a stale/missing chunk (not a real bug
// inside the module itself), do ONE silent full-page reload instead of
// surfacing to the ErrorBoundary. A sessionStorage flag caps it at one
// attempt per tab so a genuine, persistent network/build problem still
// falls through to the normal error screen instead of reload-looping.
const CHUNK_ERROR_PATTERN = /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Loading chunk .* failed/i;

export function lazyWithReload(factory) {
  return lazy(() =>
    factory().catch((err) => {
      const isChunkError = CHUNK_ERROR_PATTERN.test(err?.message || '');
      const alreadyRetried = sessionStorage.getItem('comonn_chunk_reload');
      if (isChunkError && !alreadyRetried) {
        sessionStorage.setItem('comonn_chunk_reload', '1');
        window.location.reload();
        // Never resolves — the reload is already underway, and resolving
        // with a fake module would just let React try to render it.
        return new Promise(() => {});
      }
      throw err;
    })
  );
}
