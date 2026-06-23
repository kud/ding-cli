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

export const ringTimes = (choice: string, count: number): void => {
  const path = resolveSound(choice)
  for (let i = 0; i < count; i++) {
    spawnSync("afplay", [path], { stdio: "ignore" })
  }
}
