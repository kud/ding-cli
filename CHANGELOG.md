# Changelog

All notable changes to this project are documented here.

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
