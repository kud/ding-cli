#!/usr/bin/env node
import chalk from "chalk"
import { defineCommand, runMain } from "citty"
import { runForegroundCountdown } from "./countdown.js"
import { spawnDetached } from "./detach.js"
import { resolveIcons } from "./icons.js"
import {
  sendNotification,
  playSound,
  DEFAULT_SOUND,
  type NotifyOptions,
} from "./notify.js"
import { parseTime, formatDuration } from "./parse-time.js"
import { runWizard } from "./wizard/wizard.js"

const DEFAULT_TITLE = "ding"
const DEFAULT_MESSAGE = "⏰ Time's up"

const URL_PATTERN = /^https?:\/\/.+/

const formatFireTime = (fireAt: Date): string =>
  fireAt.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })

const formatAsTimeString = (date: Date): string =>
  date.toTimeString().slice(0, 8)

const fire = (opts: {
  title: string
  message: string
  sound: string | false
  notify: boolean
  subtitle?: string
  icon?: string
  open?: string
  notifySound?: string
}): void => {
  if (opts.notify) {
    const notifyOpts: NotifyOptions = {
      title: opts.title,
      message: opts.message,
    }
    if (opts.subtitle !== undefined) notifyOpts.subtitle = opts.subtitle
    if (opts.icon !== undefined) notifyOpts.icon = opts.icon
    if (opts.open !== undefined) notifyOpts.open = opts.open
    if (opts.notifySound !== undefined)
      notifyOpts.notifySound = opts.notifySound
    sendNotification(notifyOpts)
  }
  if (opts.sound !== false) playSound(opts.sound || DEFAULT_SOUND)
}

type RunConfig = {
  rawTime: string
  fireAt: Date
  message: string
  title: string
  sound: string | false
  notify: boolean
  detach: boolean
  subtitle?: string
  icon?: string
  open?: string
  notifySound?: string
  iconsFlag?: string
}

const run = async (config: RunConfig): Promise<void> => {
  const {
    rawTime,
    fireAt,
    message,
    title,
    sound,
    notify,
    detach,
    subtitle,
    icon,
    open,
    notifySound,
    iconsFlag,
  } = config
  const icons = resolveIcons(iconsFlag)

  if (detach) {
    const forwardArgs = [rawTime]
    if (message !== DEFAULT_MESSAGE) forwardArgs.push(message)
    if (title !== DEFAULT_TITLE) forwardArgs.push("--title", title)
    if (sound === false) forwardArgs.push("--no-sound")
    if (!notify) forwardArgs.push("--no-notify")
    if (sound && sound !== DEFAULT_SOUND) forwardArgs.push("--sound", sound)
    if (subtitle !== undefined) forwardArgs.push("--subtitle", subtitle)
    if (icon !== undefined) forwardArgs.push("--icon", icon)
    if (open !== undefined) forwardArgs.push("--open", open)
    if (notifySound !== undefined)
      forwardArgs.push("--notify-sound", notifySound)
    if (iconsFlag !== undefined) forwardArgs.push("--icons", iconsFlag)
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
    runForegroundCountdown(fireAt, message, icons, () => {
      fire({ title, message, sound, notify, subtitle, icon, open, notifySound })
      resolve()
    })
  })
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
      required: false,
    },
    message: {
      type: "positional",
      description: "Notification body text",
      required: false,
    },
    interactive: {
      type: "boolean",
      alias: "i",
      description: "Launch interactive wizard",
      default: false,
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
      description:
        "Path to a custom audio file played via afplay when the alarm fires (default: system Glass sound)",
    },
    "no-sound": {
      type: "boolean",
      description: "Disable alarm sound entirely",
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
    subtitle: {
      type: "string",
      description: "Notification subtitle",
    },
    icon: {
      type: "string",
      description: "Absolute path to a custom notification icon image",
    },
    open: {
      type: "string",
      description:
        "URL to open when the notification is clicked (e.g. https://claude.ai)",
    },
    "notify-sound": {
      type: "string",
      description:
        'Built-in macOS notification banner sound name (e.g. "Glass", "Ping") — separate from --sound which plays via afplay',
    },
    icons: {
      type: "string",
      description:
        'Icon set: "nerd" (default, requires Nerd Font), "emoji", or "ascii". Overrides DING_ICONS env var.',
    },
  },
  run: async ({ args }) => {
    const rawTime = args.time as string | undefined
    const isInteractive = (args.interactive as boolean) || !rawTime
    const iconsFlag = args.icons as string | undefined
    const openUrl = args.open as string | undefined

    if (openUrl !== undefined && !URL_PATTERN.test(openUrl)) {
      process.stderr.write(
        `error: --open value "${openUrl}" does not look like a URL (must start with http:// or https://)\n`,
      )
      process.exit(1)
    }

    if (isInteractive) {
      const icons = resolveIcons(iconsFlag)
      const wizardConfig = await runWizard(icons)
      await run({
        rawTime: formatAsTimeString(wizardConfig.fireAt),
        fireAt: wizardConfig.fireAt,
        message: wizardConfig.message || DEFAULT_MESSAGE,
        title: DEFAULT_TITLE,
        sound: wizardConfig.sound,
        notify: wizardConfig.notify,
        detach: wizardConfig.detach,
        iconsFlag,
      })
      return
    }

    const message = (args.message as string | undefined) ?? DEFAULT_MESSAGE
    const title = (args.title as string | undefined) ?? DEFAULT_TITLE
    const detach = args.detach as boolean
    const noSound = args["no-sound"] as boolean
    const noNotify = args["no-notify"] as boolean
    const customSound = args.sound as string | undefined
    const subtitle = args.subtitle as string | undefined
    const icon = args.icon as string | undefined
    const notifySound = args["notify-sound"] as string | undefined

    const soundPath: string | false = noSound
      ? false
      : (customSound ?? DEFAULT_SOUND)

    const parseResult = (() => {
      try {
        return parseTime(rawTime!)
      } catch (err) {
        process.stderr.write(
          `${chalk.red("error:")} ${err instanceof Error ? err.message : String(err)}\n`,
        )
        process.exit(1)
      }
    })()

    const { fireAt } = parseResult

    await run({
      rawTime: rawTime!,
      fireAt,
      message,
      title,
      sound: soundPath,
      notify: !noNotify,
      detach,
      subtitle,
      icon,
      open: openUrl,
      notifySound,
      iconsFlag,
    })
  },
})

runMain(main)
