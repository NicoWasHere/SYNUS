import { defineConfig } from 'vite';

// GitHub Pages serves a project repo (not a user/org root page) under
// /<repo-name>/, not /  - every asset URL Vite generates needs that
// prefix baked in at build time, or they all 404 once deployed there.
// `vite dev` ALSO mounts the whole app under this path (a bare `/`
// request 302s to it) - the docs-index-fallback plugin below has to
// account for that, not just the bare /docs it originally assumed. If
// this ever moves to a root domain (a user/org page, or a custom
// domain), this needs to go back to '/'.
const BASE = '/SYNUS/';

export default defineConfig({
  base: BASE,
  // hydra-synth's own dependency (raf-loop -> right-now) references the
  // Node.js `global` object directly, assuming a Node/Browserify-style
  // environment - browsers don't have `global` (they have `window`/
  // `globalThis`), so simply importing hydra-synth throws a
  // ReferenceError at module-evaluation time without this. A standard,
  // well-known workaround for legacy Node-oriented npm packages.
  define: {
    global: 'globalThis',
  },
  plugins: [
    // Vite's dev server (and its SPA fallback for the main app) doesn't
    // resolve a directory URL to that directory's index.html the way a
    // typical static host does - a request to /docs or /docs/ would
    // otherwise fall through to the root index.html (the running app),
    // not public/docs/index.html. Rewriting the URL here, BEFORE Vite's
    // own internal middlewares run (this hook form - not returning a
    // function - is what makes that ordering happen), is what makes
    // /docs work as a real, un-hashed URL for the docs page.
    //
    // The actual request path is BASE-prefixed in dev (e.g. /SYNUS/docs,
    // matching index.html's relative `docs/` link) - stripping BASE
    // before comparing (rather than hardcoding it a second time here)
    // means this still works if BASE above ever changes.
    {
      name: 'docs-index-fallback',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          // GitHub Pages 301s a bare /SYNUS (no trailing slash) to /SYNUS/
          // on its own - the dev server doesn't, so a URL that works in
          // production 404s here instead. Matching that redirect keeps
          // dev and prod behaving the same for anyone who bookmarks/types
          // the base path without its trailing slash.
          const bareBase = BASE.slice(0, -1);
          const [reqPath] = req.url.split(/[?#]/);
          if (reqPath === bareBase) {
            res.statusCode = 302;
            res.setHeader('Location', BASE);
            res.end();
            return;
          }
          const path = req.url.startsWith(BASE) ? req.url.slice(BASE.length - 1) : req.url;
          if (path === '/docs' || path === '/docs/') {
            req.url = `${BASE}docs/index.html`;
          }
          next();
        });
      },
    },
  ],
});
