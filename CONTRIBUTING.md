# Development

Install a Node.js version supported by `package.json`, then run:

```sh
npm ci
npm run verify
npm run build:test
```

`verify` runs ESLint, checks JavaScript syntax and local asset references, runs the tests, and builds both extensions. The only npm dependencies are development tools. Extension packages contain no npm dependencies and require no bundler.

`build` writes unpacked extensions to `dist/chromium` and `dist/firefox`. `build:test` regenerates `test-builds/chrome` and `test-builds/firefox` for the existing browser testing workflow. Edit `src` and `platform`, then regenerate those folders. Changes made directly to a generated folder disappear on the next build.

The shell scripts in `tools` package the same builds as ZIP or XPI archives with the manifest at the archive root. Firefox packages produced locally are unsigned. Release workflows run the same checks before packaging.

## Code layout

| File | Responsibility |
| --- | --- |
| `src/js/background.js` | Browser events, message dispatch, update alarms, toolbar updates and warning navigation |
| `src/js/catalogue.js` | Cached lists, refresh transactions, classification, reasons and note retrieval |
| `src/js/resources.js` | URL normalization, matching and resource indexes |
| `src/js/guide-parser.js` | Markdown resource extraction and FMHY section links |
| `src/js/config.js` | Feed URLs, shared resource hosts and search engines |
| `src/js/curated-resources.js` | Encoded fallback resources, loaded only in the background |
| `src/js/site-metadata.js` | Active note mappings, public site passwords and invite codes |
| `src/js/settings.js` | Defaults, domain input, theme application and update intervals |
| `src/js/content.js` | Search-result processing and mutation observation |
| `src/js/link-renderer.js` | Link decorations, badges and restoration of original styles |
| `src/js/page-ui.js` | Safe markup rendering, note formatting and copyable values |
| `src/js/i18n.js` | Language selection and translation loading |
| `src/pub` | Extension page controllers, HTML and CSS |
| `docs` | Static documentation website |

Modules expose their interfaces through `globalThis.SafeGuard`. Their internal variables stay inside closures. Chromium loads background dependencies with `importScripts`; Firefox lists them in its manifest. Page scripts and content scripts also list their dependencies explicitly. Tests execute those same scripts, including both background loading paths.

`createCatalogue` accepts storage, fetch and an update callback. It owns classification state. The toolbar and popup both request `getSiteStatus`, so user overrides, resource paths and unsafe reasons have one implementation. Shared hosts such as GitHub require a matching resource, while ordinary domains may inherit a listed parent domain's classification.

Refreshes download all sources and compile a replacement snapshot before writing storage. Concurrent refreshes share the same promise. A failed download or storage write keeps the previous snapshot and timestamp. Startup loads cached data before attempting a refresh, so an offline start retains the last usable classifications. Scheduled refreshes update both unsafe lists and resource guides.

Settings saves do not change `lastUpdated`. That timestamp records a completed catalogue refresh. Warning-page approvals are scoped to a tab and normalized resource URL, survive worker suspension, and are removed when the tab closes.

## Tests

Tests use Node's test runner and jsdom. Network calls, storage and browser events use local test adapters. The suite covers resource identity, cached and failed refreshes, message dispatch, startup ordering, stale navigation, popup rendering, translations, warning URL encoding, settings saves and dynamic search highlights.

Run `npm test` for behavior tests, `npm run lint` for static analysis, and `npm run format` to format JavaScript. Browser-store submission and interactive tests in real Chrome and Firefox remain separate from these automated checks.
