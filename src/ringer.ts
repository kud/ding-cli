import { spawn, spawnSync, type ChildProcess } from "node:child_process"
import { resolveSound } from "./sounds.js"

let loopChild: ChildProcess | null = null
let looping = false

export const startRingLoop = (choice: string): void => {
  const path = resolveSound(choice)
  looping = true
  const playOnce = (): void => {
    if (!looping) return
    const child = spawn("afplay", [path], { stdio: "ignore" })
    loopChild = child
    child.on("exit", () => {
      if (loopChild === child) loopChild = null
      if (looping) playOnce()
    })
  }
  playOnce()
}

export const stopRingLoop = (): void => {
  looping = false
  if (loopChild !== null) {
    try {
      loopChild.kill("SIGTERM")
    } catch {}
    loopChild = null
  }
}

// ringTimes blocks the event loop for the whole ring. That is harmless when the
// alarm is the last thing ding does, but with --exec it stalls the command's
// observed completion — and so the failure sound and banner — behind several
// seconds of bell. This variant hands the ring to afplay and carries on.
export const ringOnce = (choice: string): void => {
  spawn("afplay", [resolveSound(choice)], { stdio: "ignore" }).unref()
}

export const ringTimes = (choice: string, count: number): void => {
  const path = resolveSound(choice)
  for (let i = 0; i < count; i++) {
    spawnSync("afplay", [path], { stdio: "ignore" })
  }
}
