#!/usr/bin/env node

// src/index.ts
import chalk2 from "chalk";
import { defineCommand, runMain } from "citty";

// src/countdown.ts
import React, { useState, useEffect } from "react";
import { render, Box, Text, useInput, useApp, useStdin } from "ink";

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
var formatSeconds = (totalSeconds) => {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor(totalSeconds % 3600 / 60);
  const s = totalSeconds % 60;
  const hh = String(h).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`;
};
var formatRemaining = (remainingMs) => formatSeconds(Math.max(0, Math.ceil(remainingMs / 1e3)));

// src/countdown.ts
var BAR_WIDTH = 24;
var TICK_MS = 100;
var EIGHTH_BLOCKS = ["\u258F", "\u258E", "\u258D", "\u258C", "\u258B", "\u258A", "\u2589", "\u2588"];
var buildSmoothBar = (elapsed, total) => {
  if (total <= 0) {
    return { filled: "\u2588".repeat(BAR_WIDTH), partial: "", empty: "" };
  }
  const fraction = Math.min(1, Math.max(0, elapsed / total));
  const exactFill = fraction * BAR_WIDTH;
  const fullCells = Math.floor(exactFill);
  const remainder = exactFill - fullCells;
  const partialIndex = Math.floor(remainder * 8);
  const emptyStart = fullCells + (partialIndex > 0 ? 1 : 0);
  return {
    filled: "\u2588".repeat(fullCells),
    partial: partialIndex > 0 ? EIGHTH_BLOCKS[partialIndex - 1] : "",
    empty: " ".repeat(BAR_WIDTH - emptyStart)
  };
};
var CountdownView = ({ fireAt, totalMs, label, icons }) => {
  const { exit } = useApp();
  const { isRawModeSupported } = useStdin();
  const [remainingMs, setRemainingMs] = useState(fireAt.getTime() - Date.now());
  const [tickCount, setTickCount] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = fireAt.getTime() - Date.now();
      setRemainingMs(remaining);
      setTickCount((n) => n + 1);
      if (remaining <= 0) {
        clearInterval(interval);
        exit();
      }
    }, TICK_MS);
    return () => clearInterval(interval);
  }, [fireAt, exit]);
  useInput(
    (_input, key) => {
      if (key.ctrl && _input === "c") {
        process.stdout.write("\ncancelled\n");
        process.exit(0);
      }
    },
    { isActive: isRawModeSupported === true }
  );
  if (remainingMs <= 0) {
    return React.createElement(Text, { color: "green" }, `${icons.done} done`);
  }
  const safeTotalMs = Math.max(1, totalMs);
  const elapsed = safeTotalMs - remainingMs;
  const bar = buildSmoothBar(Math.max(0, elapsed), safeTotalMs);
  const percentage = Math.round(Math.max(0, elapsed) / safeTotalMs * 100);
  const timeLabel = formatRemaining(Math.max(0, remainingMs));
  const frameIndex = tickCount % icons.timerFrames.length;
  const spinnerFrame = icons.timerFrames[frameIndex];
  return React.createElement(
    Box,
    null,
    React.createElement(Text, null, `${spinnerFrame} `),
    React.createElement(Text, { dimColor: true }, "\u2595"),
    React.createElement(Text, { color: "green" }, bar.filled),
    React.createElement(Text, { color: "green" }, bar.partial),
    React.createElement(Text, { dimColor: true }, bar.empty),
    React.createElement(Text, { dimColor: true }, "\u258F"),
    React.createElement(Text, { dimColor: true }, ` ${percentage}%`),
    React.createElement(Text, null, "  \xB7  "),
    React.createElement(Text, { bold: true }, `${timeLabel} left`),
    React.createElement(Text, null, `  \xB7  "${label}"`)
  );
};
var runForegroundCountdown = (fireAt, label, icons, onFire) => {
  const totalMs = fireAt.getTime() - Date.now();
  if (!process.stdin.isTTY) {
    process.on("SIGINT", () => {
      process.stdout.write("\ncancelled\n");
      process.exit(0);
    });
  }
  const { waitUntilExit } = render(
    React.createElement(CountdownView, { fireAt, totalMs, label, icons }),
    { exitOnCtrlC: false }
  );
  waitUntilExit().then(() => {
    process.stdout.write(`
${icons.done} done
`);
    onFire();
  });
};

// src/detach.ts
import { spawn } from "child_process";
import chalk from "chalk";
var spawnDetached = (args) => {
  const child = spawn(process.execPath, [process.argv[1], ...args], {
    detached: true,
    stdio: "ignore"
  });
  child.unref();
  process.stdout.write(
    chalk.dim(`detached \u2014 pid ${child.pid}, args: ${args.join(" ")}
`)
  );
};

// src/icons.ts
var NERD = {
  timer: "\uF254",
  timerFrames: ["\uF251", "\uF252", "\uF253"],
  done: "\uF00C",
  pointer: "\uF054"
};
var EMOJI = {
  timer: "\u23F3",
  timerFrames: ["\u23F3", "\u231B"],
  done: "\u2713",
  pointer: "\u25B8"
};
var ASCII = {
  timer: "[*]",
  timerFrames: ["|", "/", "-", "\\"],
  done: "[x]",
  pointer: ">"
};
var ICON_SETS = {
  nerd: NERD,
  emoji: EMOJI,
  ascii: ASCII
};
var VALID_MODES = /* @__PURE__ */ new Set(["nerd", "emoji", "ascii"]);
var resolveMode = (flagValue) => {
  if (flagValue !== void 0) {
    if (!VALID_MODES.has(flagValue)) {
      process.stderr.write(
        `error: invalid --icons value "${flagValue}" \u2014 must be one of: nerd, emoji, ascii
`
      );
      process.exit(1);
    }
    return flagValue;
  }
  const envValue = process.env.DING_ICONS;
  if (envValue !== void 0) {
    if (!VALID_MODES.has(envValue)) {
      process.stderr.write(
        `error: invalid DING_ICONS value "${envValue}" \u2014 must be one of: nerd, emoji, ascii
`
      );
      process.exit(1);
    }
    return envValue;
  }
  return "nerd";
};
var resolveIcons = (flagValue) => ICON_SETS[resolveMode(flagValue)];

// src/notify.ts
import nodeNotifier from "node-notifier";
import { spawnSync } from "child_process";
var DEFAULT_SOUND = "/System/Library/Sounds/Glass.aiff";
var sendNotification = (opts) => {
  const payload = {
    title: opts.title,
    message: opts.message
  };
  if (opts.subtitle !== void 0) payload.subtitle = opts.subtitle;
  if (opts.icon !== void 0) {
    payload.icon = opts.icon;
    payload.contentImage = opts.icon;
  }
  if (opts.open !== void 0) payload.open = opts.open;
  if (opts.notifySound !== void 0) payload.sound = opts.notifySound;
  nodeNotifier.notify(payload);
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

// src/wizard/wizard.tsx
import React2, { useState as useState2, useEffect as useEffect2 } from "react";
import { render as render2, Box as Box2, Text as Text2, useInput as useInput2, useApp as useApp2 } from "ink";
import TextInput from "ink-text-input";
import SelectInput from "ink-select-input";
import { readdir } from "fs/promises";
var WhenStep = ({ onNext }) => {
  const [value, setValue] = useState2("");
  const [error, setError] = useState2(null);
  const [resolved, setResolved] = useState2(null);
  const handleChange = (next) => {
    setValue(next);
    if (!next) {
      setError(null);
      setResolved(null);
      return;
    }
    try {
      const result = parseTime(next);
      setResolved(result.fireAt);
      setError(null);
    } catch (err) {
      setResolved(null);
      setError(err instanceof Error ? err.message : String(err));
    }
  };
  const handleSubmit = (submitted) => {
    if (!submitted) return;
    try {
      const result = parseTime(submitted);
      onNext(result.fireAt);
    } catch {
    }
  };
  return React2.createElement(
    Box2,
    { flexDirection: "column" },
    React2.createElement(
      Text2,
      null,
      "When should it fire? (e.g. 5m, 1h30m, 14:30)"
    ),
    React2.createElement(TextInput, {
      value,
      onChange: handleChange,
      onSubmit: handleSubmit
    }),
    error ? React2.createElement(Text2, { color: "red" }, error) : resolved ? React2.createElement(
      Text2,
      { dimColor: true },
      `fires at ${resolved.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })} \u2014 ${formatRemaining(resolved.getTime() - Date.now())} from now`
    ) : null
  );
};
var MessageStep = ({ onNext }) => {
  const [value, setValue] = useState2("");
  return React2.createElement(
    Box2,
    { flexDirection: "column" },
    React2.createElement(
      Text2,
      null,
      "Message? (optional \u2014 leave empty for default)"
    ),
    React2.createElement(TextInput, {
      value,
      onChange: setValue,
      onSubmit: onNext
    })
  );
};
var NotifyStep = ({ onNext }) => {
  const items = [
    { label: "Yes (desktop notification)", value: true },
    { label: "No", value: false }
  ];
  return React2.createElement(
    Box2,
    { flexDirection: "column" },
    React2.createElement(Text2, null, "Send a desktop notification?"),
    React2.createElement(SelectInput, {
      items,
      onSelect: (item) => onNext(item.value)
    })
  );
};
var SOUNDS_DIR = "/System/Library/Sounds";
var SoundStep = ({ onNext }) => {
  const [items, setItems] = useState2([
    { label: "Off", value: false },
    { label: "Default (Glass)", value: `${SOUNDS_DIR}/Glass.aiff` }
  ]);
  useEffect2(() => {
    readdir(SOUNDS_DIR).then((files) => {
      const extras = files.filter((f) => f.endsWith(".aiff") && f !== "Glass.aiff").map((f) => ({
        label: f.replace(/\.aiff$/, ""),
        value: `${SOUNDS_DIR}/${f}`
      }));
      setItems([
        { label: "Off", value: false },
        { label: "Default (Glass)", value: `${SOUNDS_DIR}/Glass.aiff` },
        ...extras
      ]);
    }).catch(() => {
    });
  }, []);
  return React2.createElement(
    Box2,
    { flexDirection: "column" },
    React2.createElement(Text2, null, "Play a sound?"),
    React2.createElement(SelectInput, {
      items,
      onSelect: (item) => onNext(item.value)
    })
  );
};
var ModeStep = ({ onNext }) => {
  const items = [
    { label: "Foreground (watch the countdown)", value: false },
    { label: "Detach (run in background)", value: true }
  ];
  return React2.createElement(
    Box2,
    { flexDirection: "column" },
    React2.createElement(Text2, null, "How should it run?"),
    React2.createElement(SelectInput, {
      items,
      onSelect: (item) => onNext(item.value)
    })
  );
};
var ReviewScreen = ({
  config,
  icons,
  onConfirm,
  onCancel
}) => {
  useInput2((_input, key) => {
    if (key.return) onConfirm();
    if (key.escape) onCancel();
  });
  const fireTime = config.fireAt.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
  const soundLabel = config.sound === false ? "off" : config.sound === "/System/Library/Sounds/Glass.aiff" ? "Glass (default)" : config.sound;
  return React2.createElement(
    Box2,
    { flexDirection: "column", gap: 1 },
    React2.createElement(Text2, { bold: true }, "Review"),
    React2.createElement(
      Box2,
      { flexDirection: "column" },
      React2.createElement(Text2, null, `  when     ${fireTime}`),
      React2.createElement(
        Text2,
        null,
        `  message  ${config.message || "(default)"}`
      ),
      React2.createElement(
        Text2,
        null,
        `  notify   ${config.notify ? "yes" : "no"}`
      ),
      React2.createElement(Text2, null, `  sound    ${soundLabel}`),
      React2.createElement(
        Text2,
        null,
        `  mode     ${config.detach ? "detach" : "foreground"}`
      )
    ),
    React2.createElement(
      Text2,
      { dimColor: true },
      `Press Enter to start ${icons.pointer} Esc to cancel`
    )
  );
};
var Wizard = ({ icons, onComplete }) => {
  const { exit } = useApp2();
  const [step, setStep] = useState2(0);
  const [fireAt, setFireAt] = useState2(null);
  const [message, setMessage] = useState2("");
  const [notify, setNotify] = useState2(true);
  const [sound, setSound] = useState2(
    "/System/Library/Sounds/Glass.aiff"
  );
  const [detach, setDetach] = useState2(false);
  const handleConfirm = () => {
    onComplete({ fireAt, message, notify, sound, detach });
    exit();
  };
  const handleCancel = () => {
    process.stdout.write("cancelled\n");
    process.exit(0);
  };
  const stepHeader = step < 5 ? React2.createElement(Text2, { dimColor: true }, `step ${step + 1}/5`) : null;
  const stepContent = (() => {
    if (step === 0)
      return React2.createElement(WhenStep, {
        onNext: (date) => {
          setFireAt(date);
          setStep(1);
        }
      });
    if (step === 1)
      return React2.createElement(MessageStep, {
        onNext: (msg) => {
          setMessage(msg);
          setStep(2);
        }
      });
    if (step === 2)
      return React2.createElement(NotifyStep, {
        onNext: (n) => {
          setNotify(n);
          setStep(3);
        }
      });
    if (step === 3)
      return React2.createElement(SoundStep, {
        onNext: (s) => {
          setSound(s);
          setStep(4);
        }
      });
    if (step === 4)
      return React2.createElement(ModeStep, {
        onNext: (d) => {
          setDetach(d);
          setStep(5);
        }
      });
    return React2.createElement(ReviewScreen, {
      config: { fireAt, message, notify, sound, detach },
      icons,
      onConfirm: handleConfirm,
      onCancel: handleCancel
    });
  })();
  return React2.createElement(
    Box2,
    { flexDirection: "column", gap: 1 },
    stepHeader,
    stepContent
  );
};
var resolveWizard = null;
var runWizard = (icons) => {
  return new Promise((resolve) => {
    resolveWizard = resolve;
    render2(
      React2.createElement(Wizard, {
        icons,
        onComplete: (config) => {
          resolveWizard?.(config);
        }
      })
    );
  });
};

// src/index.ts
var DEFAULT_TITLE = "ding";
var DEFAULT_MESSAGE = "\u23F0 Time's up";
var URL_PATTERN = /^https?:\/\/.+/;
var formatFireTime = (fireAt) => fireAt.toLocaleTimeString([], {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit"
});
var formatAsTimeString = (date) => date.toTimeString().slice(0, 8);
var fire = (opts) => {
  if (opts.notify) {
    const notifyOpts = {
      title: opts.title,
      message: opts.message
    };
    if (opts.subtitle !== void 0) notifyOpts.subtitle = opts.subtitle;
    if (opts.icon !== void 0) notifyOpts.icon = opts.icon;
    if (opts.open !== void 0) notifyOpts.open = opts.open;
    if (opts.notifySound !== void 0)
      notifyOpts.notifySound = opts.notifySound;
    sendNotification(notifyOpts);
  }
  if (opts.sound !== false) playSound(opts.sound || DEFAULT_SOUND);
};
var run = async (config) => {
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
    iconsFlag
  } = config;
  const icons = resolveIcons(iconsFlag);
  if (detach) {
    const forwardArgs = [rawTime];
    if (message !== DEFAULT_MESSAGE) forwardArgs.push(message);
    if (title !== DEFAULT_TITLE) forwardArgs.push("--title", title);
    if (sound === false) forwardArgs.push("--no-sound");
    if (!notify) forwardArgs.push("--no-notify");
    if (sound && sound !== DEFAULT_SOUND) forwardArgs.push("--sound", sound);
    if (subtitle !== void 0) forwardArgs.push("--subtitle", subtitle);
    if (icon !== void 0) forwardArgs.push("--icon", icon);
    if (open !== void 0) forwardArgs.push("--open", open);
    if (notifySound !== void 0)
      forwardArgs.push("--notify-sound", notifySound);
    if (iconsFlag !== void 0) forwardArgs.push("--icons", iconsFlag);
    process.stdout.write(
      `${chalk2.cyan("ding")} fires at ${chalk2.bold(formatFireTime(fireAt))}
`
    );
    spawnDetached(forwardArgs);
    return;
  }
  process.stdout.write(
    `${chalk2.cyan("ding")} fires at ${chalk2.bold(formatFireTime(fireAt))} \u2014 ${chalk2.dim(message)}
`
  );
  await new Promise((resolve) => {
    runForegroundCountdown(fireAt, message, icons, () => {
      fire({ title, message, sound, notify, subtitle, icon, open, notifySound });
      resolve();
    });
  });
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
      required: false
    },
    message: {
      type: "positional",
      description: "Notification body text",
      required: false
    },
    interactive: {
      type: "boolean",
      alias: "i",
      description: "Launch interactive wizard",
      default: false
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
      description: "Path to a custom audio file played via afplay when the alarm fires (default: system Glass sound)"
    },
    "no-sound": {
      type: "boolean",
      description: "Disable alarm sound entirely",
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
    },
    subtitle: {
      type: "string",
      description: "Notification subtitle"
    },
    icon: {
      type: "string",
      description: "Absolute path to a custom notification icon image"
    },
    open: {
      type: "string",
      description: "URL to open when the notification is clicked (e.g. https://claude.ai)"
    },
    "notify-sound": {
      type: "string",
      description: 'Built-in macOS notification banner sound name (e.g. "Glass", "Ping") \u2014 separate from --sound which plays via afplay'
    },
    icons: {
      type: "string",
      description: 'Icon set: "nerd" (default, requires Nerd Font), "emoji", or "ascii". Overrides DING_ICONS env var.'
    }
  },
  run: async ({ args }) => {
    const rawTime = args.time;
    const isInteractive = args.interactive || !rawTime;
    const iconsFlag = args.icons;
    const openUrl = args.open;
    if (openUrl !== void 0 && !URL_PATTERN.test(openUrl)) {
      process.stderr.write(
        `error: --open value "${openUrl}" does not look like a URL (must start with http:// or https://)
`
      );
      process.exit(1);
    }
    if (isInteractive) {
      const icons = resolveIcons(iconsFlag);
      const wizardConfig = await runWizard(icons);
      await run({
        rawTime: formatAsTimeString(wizardConfig.fireAt),
        fireAt: wizardConfig.fireAt,
        message: wizardConfig.message || DEFAULT_MESSAGE,
        title: DEFAULT_TITLE,
        sound: wizardConfig.sound,
        notify: wizardConfig.notify,
        detach: wizardConfig.detach,
        iconsFlag
      });
      return;
    }
    const message = args.message ?? DEFAULT_MESSAGE;
    const title = args.title ?? DEFAULT_TITLE;
    const detach = args.detach;
    const noSound = args["no-sound"];
    const noNotify = args["no-notify"];
    const customSound = args.sound;
    const subtitle = args.subtitle;
    const icon = args.icon;
    const notifySound = args["notify-sound"];
    const soundPath = noSound ? false : customSound ?? DEFAULT_SOUND;
    const parseResult = (() => {
      try {
        return parseTime(rawTime);
      } catch (err) {
        process.stderr.write(
          `${chalk2.red("error:")} ${err instanceof Error ? err.message : String(err)}
`
        );
        process.exit(1);
      }
    })();
    const { fireAt } = parseResult;
    await run({
      rawTime,
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
      iconsFlag
    });
  }
});
runMain(main);
