#!/usr/bin/env node

// src/index.ts
import chalk3 from "chalk";
import { defineCommand, runMain } from "citty";

// src/countdown.ts
import chalk from "chalk";

// src/parse-time.ts
var RELATIVE_PATTERN = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/;
var BARE_NUMBER_PATTERN = /^\d+$/;
var ABSOLUTE_HM_PATTERN = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;
var ABSOLUTE_AMPM_PATTERN = /^(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?(am|pm)$/i;
var isAbsoluteForm = (raw) => raw.includes(":") || /am|pm/i.test(raw);
var parseRelativeMs = (raw) => {
  if (BARE_NUMBER_PATTERN.test(raw)) return parseInt(raw, 10) * 60 * 1e3;
  const match = raw.match(RELATIVE_PATTERN);
  if (!match || !match[1] && !match[2] && !match[3]) return null;
  const hours = parseInt(match[1] ?? "0", 10);
  const minutes = parseInt(match[2] ?? "0", 10);
  const seconds = parseInt(match[3] ?? "0", 10);
  return (hours * 3600 + minutes * 60 + seconds) * 1e3;
};
var resolveAbsoluteDate = (h, m, s) => {
  const now = /* @__PURE__ */ new Date();
  const target = new Date(now);
  target.setHours(h, m, s, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  return target;
};
var parseAbsoluteDate = (raw) => {
  const ampmMatch = raw.match(ABSOLUTE_AMPM_PATTERN);
  if (ampmMatch) {
    let h = parseInt(ampmMatch[1], 10);
    const m = parseInt(ampmMatch[2] ?? "0", 10);
    const s = parseInt(ampmMatch[3] ?? "0", 10);
    const meridiem = ampmMatch[4].toLowerCase();
    if (meridiem === "am" && h === 12) h = 0;
    if (meridiem === "pm" && h !== 12) h += 12;
    if (h > 23 || m > 59 || s > 59) return null;
    return resolveAbsoluteDate(h, m, s);
  }
  const hmMatch = raw.match(ABSOLUTE_HM_PATTERN);
  if (hmMatch) {
    const h = parseInt(hmMatch[1], 10);
    const m = parseInt(hmMatch[2], 10);
    const s = parseInt(hmMatch[3] ?? "0", 10);
    if (h > 23 || m > 59 || s > 59) return null;
    return resolveAbsoluteDate(h, m, s);
  }
  return null;
};
var parseTime = (raw) => {
  if (isAbsoluteForm(raw)) {
    const fireAt2 = parseAbsoluteDate(raw);
    if (!fireAt2) throw new Error(`Cannot parse time: "${raw}"`);
    return { kind: "absolute", fireAt: fireAt2 };
  }
  const ms = parseRelativeMs(raw);
  if (ms === null || ms <= 0) throw new Error(`Cannot parse duration: "${raw}"`);
  const fireAt = new Date(Date.now() + ms);
  return { kind: "relative", ms, fireAt };
};
var formatDuration = (remainingMs) => {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1e3));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor(totalSeconds % 3600 / 60);
  const s = totalSeconds % 60;
  const hh = String(h).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`;
};

// src/countdown.ts
var clearLine = () => {
  process.stdout.write("\r\x1B[K");
};
var renderCountdown = (remainingMs, label) => {
  const duration = formatDuration(remainingMs);
  process.stdout.write(
    `\r${chalk.cyan(duration)} ${chalk.dim("\u25B8")} ${chalk.white(label)}`
  );
};
var runForegroundCountdown = (fireAt, label, onFire) => {
  const tick = () => {
    const remaining = fireAt.getTime() - Date.now();
    if (remaining <= 0) {
      clearLine();
      process.stdout.write(chalk.green("\u2713 done\n"));
      onFire();
      return;
    }
    renderCountdown(remaining, label);
  };
  const handleSigint = () => {
    clearLine();
    process.stdout.write(chalk.yellow("cancelled\n"));
    process.exit(0);
  };
  process.on("SIGINT", handleSigint);
  tick();
  const interval = setInterval(() => {
    const remaining = fireAt.getTime() - Date.now();
    if (remaining <= 0) {
      clearInterval(interval);
      clearLine();
      process.stdout.write(chalk.green("\u2713 done\n"));
      onFire();
      return;
    }
    renderCountdown(remaining, label);
  }, 1e3);
};

// src/detach.ts
import { spawn } from "child_process";
import chalk2 from "chalk";
var spawnDetached = (args) => {
  const child = spawn(process.execPath, [process.argv[1], ...args], {
    detached: true,
    stdio: "ignore"
  });
  child.unref();
  process.stdout.write(
    chalk2.dim(`detached \u2014 pid ${child.pid}, args: ${args.join(" ")}
`)
  );
};

// src/notify.ts
import { execSync, spawnSync } from "child_process";
var DEFAULT_SOUND = "/System/Library/Sounds/Glass.aiff";
var terminalNotifierAvailable = () => {
  try {
    execSync("which terminal-notifier", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};
var notifyViaTerminalNotifier = (title, message) => {
  spawnSync("terminal-notifier", ["-title", title, "-message", message], {
    stdio: "ignore"
  });
};
var notifyViaOsascript = (title, message) => {
  const script = `display notification "${message.replace(/"/g, '\\"')}" with title "${title.replace(/"/g, '\\"')}"`;
  spawnSync("osascript", ["-e", script], { stdio: "ignore" });
};
var sendNotification = (title, message) => {
  if (terminalNotifierAvailable()) {
    notifyViaTerminalNotifier(title, message);
    return;
  }
  process.stderr.write(
    "warning: terminal-notifier not found \u2014 falling back to osascript\n         install it with: brew install terminal-notifier\n"
  );
  notifyViaOsascript(title, message);
};
var playSound = (soundPath = DEFAULT_SOUND) => {
  const result = spawnSync("afplay", [soundPath], { stdio: "ignore" });
  if (result.error) {
    process.stderr.write(
      `warning: could not play sound: ${result.error.message}
`
    );
  }
};

// src/index.ts
var DEFAULT_SOUND2 = "/System/Library/Sounds/Glass.aiff";
var DEFAULT_TITLE = "ding";
var DEFAULT_MESSAGE = "\u23F0 Time's up";
var formatFireTime = (fireAt) => fireAt.toLocaleTimeString([], {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit"
});
var fire = (opts) => {
  if (opts.notify) sendNotification(opts.title, opts.message);
  if (opts.sound !== false) playSound(opts.sound || DEFAULT_SOUND2);
};
var main = defineCommand({
  meta: {
    name: "ding",
    version: "0.1.0",
    description: "A tiny macOS alarm/timer CLI \u2014 set a relative or absolute time, get a notification and a sound when it fires"
  },
  args: {
    time: {
      type: "positional",
      description: "Duration (5h, 90m, 30s, 1h30m, 45) or clock time (14:30, 2:30pm, 9am)",
      required: true
    },
    message: {
      type: "positional",
      description: "Notification body text",
      required: false
    },
    detach: {
      type: "boolean",
      alias: "d",
      description: "Background the process and return the prompt immediately",
      default: false
    },
    sound: {
      type: "string",
      alias: "s",
      description: "Path to a custom audio file (default: system Glass sound)"
    },
    "no-sound": {
      type: "boolean",
      description: "Disable sound entirely",
      default: false
    },
    "no-notify": {
      type: "boolean",
      description: "Disable desktop notification",
      default: false
    },
    title: {
      type: "string",
      description: `Notification title (default: "${DEFAULT_TITLE}")`
    }
  },
  run: async ({ args }) => {
    const rawTime = args.time;
    const message = args.message ?? DEFAULT_MESSAGE;
    const title = args.title ?? DEFAULT_TITLE;
    const detach = args.detach;
    const noSound = args["no-sound"];
    const noNotify = args["no-notify"];
    const customSound = args.sound;
    const soundPath = noSound ? false : customSound ?? DEFAULT_SOUND2;
    const parseResult = (() => {
      try {
        return parseTime(rawTime);
      } catch (err) {
        process.stderr.write(
          `${chalk3.red("error:")} ${err instanceof Error ? err.message : String(err)}
`
        );
        process.exit(1);
      }
    })();
    const { fireAt } = parseResult;
    if (detach) {
      const forwardArgs = [rawTime];
      if (message !== DEFAULT_MESSAGE) forwardArgs.push(message);
      if (title !== DEFAULT_TITLE) forwardArgs.push("--title", title);
      if (noSound) forwardArgs.push("--no-sound");
      if (noNotify) forwardArgs.push("--no-notify");
      if (customSound) forwardArgs.push("--sound", customSound);
      process.stdout.write(
        `${chalk3.cyan("ding")} fires at ${chalk3.bold(formatFireTime(fireAt))}
`
      );
      spawnDetached(forwardArgs);
      return;
    }
    process.stdout.write(
      `${chalk3.cyan("ding")} fires at ${chalk3.bold(formatFireTime(fireAt))} \u2014 ${chalk3.dim(message)}
`
    );
    await new Promise((resolve) => {
      runForegroundCountdown(fireAt, message, () => {
        fire({ title, message, sound: soundPath, notify: !noNotify });
        resolve();
      });
    });
  }
});
runMain(main);
