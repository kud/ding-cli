#!/usr/bin/env node
// Thin launcher: pin React to its production reconciler build before the app
// loads. `react-reconciler` picks development vs production from NODE_ENV at
// require-time, and the development build emits a `performance.measure()` on
// every commit. A long countdown re-renders ~10×/s for hours, so those entries
// pile up in the global User Timing buffer until Node warns about a perf_hooks
// memory leak (>1,000,000 entries). ESM hoists imports, so this must run before
// the module graph — hence a dynamic import after the env is set.
export {} // mark as a module so top-level await is allowed
process.env.NODE_ENV ??= "production"
await import("./index.js")
