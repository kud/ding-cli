# Changelog

All notable changes to this project are documented here.

---

## 1.1.0 — 2026-08-18

### Highlights

- Ding can now run a shell command when the timer fires, with `--exec <command>` — piped through `/bin/sh -c` with ding's own environment, so `PATH` and friends survive whether it runs in the foreground or under `--detach`. Output is appended to `~/Library/Logs/ding/exec.log` (rotated at 1MB, overridable via `DING_EXEC_LOG`), and shell operators like `&&` and pipes work as expected. A non-zero exit plays a distinct alarm (`--exec-fail-sound`, default `siren`, honouring `--no-sound`), sends a failure notification, prints the last 20 lines of output to stderr, and becomes ding's own exit code — so a failed command can't slip past unnoticed. Note that `--exec` doesn't imply `--detach`. ([3de1ece](https://github.com/kud/ding-cli/commit/3de1eceb2c7bce1503a8843509e197edd2a574eb))

### Fixes

- `--no-notify` silently did nothing. citty parses `--no-x` as a negation of `x`, so it correctly flipped the internal `notify` flag, but the code was reading the separately-declared `no-notify` arg instead, which stayed at its default. `--no-sound` happened to work only by luck, via a fallback path. Both flags are now honoured — if you were relying on `--no-notify` to suppress the banner, it was showing up anyway. ([3de1ece](https://github.com/kud/ding-cli/commit/3de1eceb2c7bce1503a8843509e197edd2a574eb))

### Internal

- Rebuilt and committed the published `dist/` bundle to include the exec changes. ([1e1bf1d](https://github.com/kud/ding-cli/commit/1e1bf1d79120722d455405eac43af26fea01e461))

---

## 1.0.2 — 2026-07-04

### Fixes

- The foreground countdown now keeps the active state as `waiting` instead of repeating the eventual notification text as though the alarm had already fired. The initial preview still shows the fire time and message, while the live view focuses on progress and remaining time. ([aa5477b](https://github.com/kud/ding-cli/commit/aa5477bfc686f6b09187b28b00ed78efd208fc33))

---

## Unreleased — 2026-06-24

### Highlights

- The package is now published as `@kud/ding-cli` on npm, making the install path consistent with the binary name. ([e98b3d2](https://github.com/kud/ding-cli/commit/e98b3d21bdc2171b41e594c15dbb09873e36d6c5))

### Fixes

- Long-running countdowns (multi-hour timers) no longer trigger a Node.js `MaxListenersExceededWarning` memory-leak warning. The dev build of `react-reconciler` was emitting `performance.measure()` on every reconciler commit (~10×/s), accumulating over 1,000,000 User Timing entries during extended sessions. A new `src/bin.ts` entrypoint pins `NODE_ENV=production` before the module graph loads, ensuring the reconciler always picks its production build and those entries are never emitted. ([c406511](https://github.com/kud/ding-cli/commit/c4065116d66d559df87d49b73f57825b366d1790))

### Documentation

- Added a recipe showing how to use `ding` with `ccusage` to ring when Claude's usage quota resets — includes timezone-safe relative time derived from local logs. ([9ab8d46](https://github.com/kud/ding-cli/commit/9ab8d461f703ad976dbd8058e76285f0b32b5935))

### Internal

- Automated npm publishing via GitHub Actions using OIDC Trusted Publishers (no static `NPM_TOKEN` required). ([0eac44d](https://github.com/kud/ding-cli/commit/0eac44d670f5f0285e1b5a5abb240c3cbd34b762))
- Hardened the publish workflow with `npm ci` and a pinned registry URL for reproducible installs. ([348552d](https://github.com/kud/ding-cli/commit/348552d3194329592cd43c132101f05057c1d2df))
