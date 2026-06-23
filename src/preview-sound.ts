import { spawn, type ChildProcess } from "node:child_process"

const SOUNDS_DIR = "/System/Library/Sounds"

const resolveSoundPath = (nameOrPath: string): string => {
  if (nameOrPath.startsWith("/") || nameOrPath.endsWith(".aiff"))
    return nameOrPath
  return `${SOUNDS_DIR}/${nameOrPath}.aiff`
}

let activePreview: ChildProcess | null = null

export const previewSound = (nameOrPath: string): void => {
  if (activePreview !== null) {
    try {
      activePreview.kill()
    } catch {}
    activePreview = null
  }
  const child = spawn("afplay", [resolveSoundPath(nameOrPath)], {
    stdio: "ignore",
  })
  activePreview = child
  child.unref()
  child.on("exit", () => {
    if (activePreview === child) activePreview = null
  })
}
