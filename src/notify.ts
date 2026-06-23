import { execSync, spawnSync } from "node:child_process"

const DEFAULT_SOUND = "/System/Library/Sounds/Glass.aiff"

const terminalNotifierAvailable = (): boolean => {
  try {
    execSync("which terminal-notifier", { stdio: "ignore" })
    return true
  } catch {
    return false
  }
}

const notifyViaTerminalNotifier = (title: string, message: string): void => {
  spawnSync("terminal-notifier", ["-title", title, "-message", message], {
    stdio: "ignore",
  })
}

const notifyViaOsascript = (title: string, message: string): void => {
  const script = `display notification "${message.replace(/"/g, '\\"')}" with title "${title.replace(/"/g, '\\"')}"`
  spawnSync("osascript", ["-e", script], { stdio: "ignore" })
}

export const sendNotification = (title: string, message: string): void => {
  if (terminalNotifierAvailable()) {
    notifyViaTerminalNotifier(title, message)
    return
  }

  process.stderr.write(
    "warning: terminal-notifier not found — falling back to osascript\n" +
      "         install it with: brew install terminal-notifier\n",
  )
  notifyViaOsascript(title, message)
}

export const playSound = (soundPath: string = DEFAULT_SOUND): void => {
  const result = spawnSync("afplay", [soundPath], { stdio: "ignore" })
  if (result.error) {
    process.stderr.write(
      `warning: could not play sound: ${result.error.message}\n`,
    )
  }
}
