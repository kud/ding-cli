#!/usr/bin/env node
import chalk from "chalk"
import { defineCommand, runMain } from "citty"
import { runForegroundCountdown } from "./countdown.js"
import { spawnDetached } from "./detach.js"
import { sendNotification, playSound } from "./notify.js"
import { parseTime } from "./parse-time.js"

const DEFAULT_SOUND = "/System/Library/Sounds/Glass.aiff"
const DEFAULT_TITLE = "ding"
const DEFAULT_MESSAGE = "⏰ Time's up"

const formatFireTime = (fireAt: Date): string =>
  fireAt.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })

const fire = (opts: {
  title: string
  message: string
  sound: string | false
  notify: boolean
}): void => {
  if (opts.notify) sendNotification(opts.title, opts.message)
  if (opts.sound !== false) playSound(opts.sound || DEFAULT_SOUND)
}

const main = defineCommand({
  meta: {
    name: "ding",
    version: "0.1.0",
    description:
      "A tiny macOS alarm/timer CLI — set a relative or absolute time, get a notification and a sound when it fires",
  },
  args: {
    time: {
      type: "positional",
      description:
        "Duration (5h, 90m, 30s, 1h30m, 45) or clock time (14:30, 2:30pm, 9am)",
      required: true,
    },
    message: {
      type: "positional",
      description: "Notification body text",
      required: false,
    },
    detach: {
      type: "boolean",
      alias: "d",
      description: "Background the process and return the prompt immediately",
      default: false,
    },
    sound: {
      type: "string",
      alias: "s",
      description: "Path to a custom audio file (default: system Glass sound)",
    },
    "no-sound": {
      type: "boolean",
      description: "Disable sound entirely",
      default: false,
    },
    "no-notify": {
      type: "boolean",
      description: "Disable desktop notification",
      default: false,
    },
    title: {
      type: "string",
      description: `Notification title (default: "${DEFAULT_TITLE}")`,
    },
  },
  run: async ({ args }) => {
    const rawTime = args.time as string
    const message = (args.message as string | undefined) ?? DEFAULT_MESSAGE
    const title = (args.title as string | undefined) ?? DEFAULT_TITLE
    const detach = args.detach as boolean
    const noSound = args["no-sound"] as boolean
    const noNotify = args["no-notify"] as boolean
    const customSound = args.sound as string | undefined

    const soundPath: string | false = noSound
      ? false
      : (customSound ?? DEFAULT_SOUND)

    const parseResult = (() => {
      try {
        return parseTime(rawTime)
      } catch (err) {
        process.stderr.write(
          `${chalk.red("error:")} ${err instanceof Error ? err.message : String(err)}\n`,
        )
        process.exit(1)
      }
    })()

    const { fireAt } = parseResult

    if (detach) {
      const forwardArgs = [rawTime]
      if (message !== DEFAULT_MESSAGE) forwardArgs.push(message)
      if (title !== DEFAULT_TITLE) forwardArgs.push("--title", title)
      if (noSound) forwardArgs.push("--no-sound")
      if (noNotify) forwardArgs.push("--no-notify")
      if (customSound) forwardArgs.push("--sound", customSound)
      process.stdout.write(
        `${chalk.cyan("ding")} fires at ${chalk.bold(formatFireTime(fireAt))}\n`,
      )
      spawnDetached(forwardArgs)
      return
    }

    process.stdout.write(
      `${chalk.cyan("ding")} fires at ${chalk.bold(formatFireTime(fireAt))} — ${chalk.dim(message)}\n`,
    )

    await new Promise<void>((resolve) => {
      runForegroundCountdown(fireAt, message, () => {
        fire({ title, message, sound: soundPath, notify: !noNotify })
        resolve()
      })
    })
  },
})

runMain(main)
