import { test } from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const bin = fileURLToPath(new URL("../dist/bin.js", import.meta.url))

test("--help exits 0 and prints usage", () => {
  const result = spawnSync(process.execPath, [bin, "--help"], {
    encoding: "utf8",
  })
  assert.equal(result.status, 0)
  assert.notEqual(result.stdout.trim(), "")
})
