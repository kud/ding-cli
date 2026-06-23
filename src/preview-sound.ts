import { spawn, type ChildProcess } from "node:child_process"
import { resolveSound } from "./sounds.js"

let activePreview: ChildProcess | null = null

export const previewSound = (choice: string): void => {
  if (activePreview !== null) {
    try {
      activePreview.kill("SIGTERM")
    } catch {}
    activePreview = null
  }
  const child = spawn("afplay", [resolveSound(choice)], {
    stdio: "ignore",
  })
  activePreview = child
  child.unref()
  child.on("exit", () => {
    if (activePreview === child) activePreview = null
  })
}

export const stopPreview = (): void => {
  if (activePreview !== null) {
    try {
      activePreview.kill("SIGTERM")
    } catch {}
    activePreview = null
  }
}
