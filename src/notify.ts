import nodeNotifier from "node-notifier"
import { spawnSync } from "node:child_process"
import { resolveSound } from "./sounds.js"

export const DEFAULT_SOUND = "bell"

export type NotifyOptions = {
  title: string
  message: string
  subtitle?: string
  icon?: string
  open?: string
  notifySound?: string
}

export const sendNotification = (opts: NotifyOptions): void => {
  const payload: Record<string, unknown> = {
    title: opts.title,
    message: opts.message,
  }
  if (opts.subtitle !== undefined) payload.subtitle = opts.subtitle
  if (opts.icon !== undefined) {
    payload.icon = opts.icon
    payload.contentImage = opts.icon
  }
  if (opts.open !== undefined) payload.open = opts.open
  if (opts.notifySound !== undefined) payload.sound = opts.notifySound

  nodeNotifier.notify(payload)
}

export const playSound = (choice: string = DEFAULT_SOUND): void => {
  const result = spawnSync("afplay", [resolveSound(choice)], {
    stdio: "ignore",
  })
  if (result.error) {
    process.stderr.write(
      `warning: could not play sound: ${result.error.message}\n`,
    )
  }
}
