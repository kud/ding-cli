#!/usr/bin/env node

// src/bin.ts
process.env.NODE_ENV ??= "production";
await import("./index.js");
