# web-access

An agent skill for driving a real browser to access the web — searching, reading pages behind logins, filling forms, clicking through UIs, and pulling text or media straight from the DOM. It pairs an operating manual (`SKILL.md`) with a small local proxy and a browser-runtime layer, so an agent can pick a browser, connect to it, and operate pages through one stable HTTP interface.

It's meant for the cases where plain "search and fetch" falls short: logged-in sessions, JavaScript-heavy pages, lazy-loaded content, internal dashboards, and anything that needs real interaction rather than a static GET.

## Credit

This project began as a fork of [eze-is/web-access](https://github.com/eze-is/web-access) and owes its core idea — bundling browsing capability together with durable operating guidance for agents — to that work. The internals here have since been rebuilt around a multi-browser, multi-runtime design.

## How it works

Three pieces carry most of the weight:

- **`SKILL.md`** — the manual the agent reads. It covers when to run preflight, when to ask the user to step in, when to prefer one browser over another, and how to reason about navigating a page. (Written in Chinese.)
- **`scripts/check-deps.mjs`** — preflight. It checks Node, works out which browser provider and mode are available from live state, starts or reuses the proxy, and prints a machine-readable JSON status the agent branches on (`ok`, `provider`, `selectedMode`, `availableModes`, `proxyReady`, …).
- **`scripts/cdp-proxy.mjs`** — a small HTTP server (default `localhost:3456`) that hides raw CDP/WebSocket traffic behind plain `curl`-able endpoints: list targets, open tabs, navigate, evaluate JS, click, scroll, screenshot, upload files, and shut down.

### Browser model: provider, then mode

Browsers are organized in two levels rather than one flat list:

- **`local`** — a Chromium-family browser on this machine, driven over direct CDP
  - **`primary`** mode: connect to your everyday browser and reuse its existing logins
  - **`dedicated`** mode: connect to an isolated, automation-only profile
- **`browserbase`** — a remote cloud browser, driven through Playwright

When both local modes are available, `dedicated` is preferred; the skill only reaches for `primary` when a task actually needs your main session's state. Availability is decided from live signals (`DevToolsActivePort` and current connectivity) rather than a remembered preference file, which keeps fewer stale-state surprises around and makes debugging easier.

Switching between modes or providers recreates the runtime behind the proxy. The proxy stays put as an interface, but target IDs obtained before a switch should be treated as stale afterward.

## Components

```text
.
├── SKILL.md
├── package.json
├── scripts
│   ├── check-deps.mjs
│   ├── cdp-proxy.mjs
│   ├── find-url.mjs
│   ├── match-site.mjs
│   └── browser-runtime
│       ├── index.mjs
│       ├── cdp-runtime.mjs
│       ├── playwright-runtime.mjs
│       ├── provider-resolver.mjs
│       └── providers
│           ├── local.mjs
│           └── browserbase.mjs
└── references
    ├── cdp-api.md
    └── site-patterns
        ├── ahrefs.com.md
        ├── ftchinese.com.md
        └── xiaohongshu.com.md
```

- **`scripts/browser-runtime/`** — the runtime layer, so the rest of the skill thinks in browser actions instead of provider-specific wiring. `index.mjs` resolves availability and constructs the active runtime; `provider-resolver.mjs` turns environment config into a runtime choice; `providers/local.mjs` discovers local browsers via `DevToolsActivePort`; `providers/browserbase.mjs` creates and releases cloud sessions; `cdp-runtime.mjs` is the local runtime over raw CDP; `playwright-runtime.mjs` is the cloud runtime over Browserbase.
- **`scripts/find-url.mjs`** — looks up local Chrome bookmarks and history, for when the target isn't easy to find through public search (internal systems, admin panels, a page the user remembers by topic but not URL).
- **`scripts/match-site.mjs`** — loads domain-specific notes from `references/site-patterns/` so known platform facts can be injected without hardcoding site behavior into the runtime.
- **`references/site-patterns/*`** — durable, data-like knowledge files per domain: URL patterns, success signals, common traps, and workflow notes. Editable without touching runtime code.

## Setup

### Local — primary mode

Enable remote debugging in your everyday browser, then run preflight:

- Chrome: `chrome://inspect/#remote-debugging`
- Edge: `edge://inspect/#remote-debugging`

### Local — dedicated mode

Launch an isolated profile with a debugging port:

```bash
open -na "Brave Browser" --args \
  --remote-debugging-port=9333 \
  --user-data-dir="$HOME/.web-access/brave-dedicated-profile"
```

Recognized browser ids: `chrome`, `chrome-canary`, `chromium`, `brave`, `edge`, `arc`. Then:

```bash
node ./scripts/check-deps.mjs --browser dedicated --browser-id brave
```

### Remote — Browserbase

Set credentials and the runtime will create a cloud session, exposed through the same proxy API as local modes:

```bash
BROWSERBASE_API_KEY=...
BROWSERBASE_PROJECT_ID=...
```

Optional variables the runtime honors:

```bash
BROWSERBASE_CONTEXT_ID=...
BROWSERBASE_CONTEXT_PERSIST=true
BROWSERBASE_USE_PROXY=true
BROWSERBASE_SOLVE_CAPTCHA=true
BROWSERBASE_VERIFIED=true
BROWSERBASE_REGION=...
BROWSERBASE_SESSION_TIMEOUT_SEC=600
```

Run the usual preflight; when the cloud provider is active the JSON reports `provider: "browserbase"` and `selectedMode: "browserbase"`. This is the path to use when there's no reliable local browser — containers, CI, remote hosts — or when you want isolation without managing a local profile.

## Quick start

```bash
git clone https://github.com/hcsum/web-access ~/.claude/skills/web-access
cd ~/.claude/skills/web-access
node ./scripts/check-deps.mjs
```

If the returned JSON says `ok: true`, the agent can continue and drive the browser through the proxy.

## Dependencies

Local browsers use direct CDP and need **no `npm install`** — clone and go.

Only the Browserbase cloud provider needs `playwright-core`. It's declared as an optional dependency and loaded lazily, on the cloud path only. If you plan to use cloud mode, install once in the skill root:

```bash
cd ~/.claude/skills/web-access && npm install
```

Start a cloud session without it and the runtime fails fast with a `PLAYWRIGHT_CORE_MISSING` error that names exactly what to install.

## Requirements

- Node.js 22+ (uses native WebSocket; older versions work with the `ws` module installed)
- a Chromium-based browser for local mode, or Browserbase credentials for cloud mode
- permission to enable remote debugging when using local `primary` mode

## License

MIT
