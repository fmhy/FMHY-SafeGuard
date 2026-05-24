# Safari Web Extension Source Build

FMHY SafeGuard now includes a Safari Web Extension source manifest so the shared `src/` code can be reused for Safari with minimal platform-specific changes.

## What Windows, Linux, and macOS can do

- Edit the shared extension source code.
- Build the Safari source bundle at `dist/safari`.
- Run manifest validation and other Node-based checks.

## What requires macOS

- Running `safari-web-extension-converter`.
- Generating the Xcode project.
- Signing the app or extension.
- Testing inside Safari.
- Distributing through TestFlight or the App Store.

## Commands

Build the Safari source folder:

```bash
node scripts/build-safari-source.mjs
```

Validate the manifests:

```bash
node scripts/validate-manifests.mjs
```

Convert the Safari source into an Xcode project on macOS:

```bash
bash scripts/convert-safari-macos.sh
```

## Expected output

- `dist/safari`
- `safari/FMHY-SafeGuard-Safari` after running the macOS conversion helper

## Notes about release artifacts

Any Safari asset produced by CI is source-only. It is intended for `safari-web-extension-converter` and is not directly installable as a signed Safari extension.

## Testing checklist

- Extension installs in Safari after conversion.
- Popup opens correctly.
- Options page works.
- First-run welcome page opens on install.
- Remote FMHY filter lists fetch from GitHub raw URLs.
- Toolbar icon changes with site status.
- Search result highlighting works on Google, DuckDuckGo, Bing, and Brave Search.
- Unsafe site warning redirect works.
- Force update works from settings.
- Scheduled update still works after Safari or background restarts.
