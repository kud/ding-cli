#!/usr/bin/env node

// src/index.ts
import chalk4 from "chalk";
import { defineCommand, runMain } from "citty";

// src/countdown.ts
import React, { useState, useEffect } from "react";
import { render, Box, Text, useInput, useApp, useStdin } from "ink";
import BigText from "ink-big-text";
import Gradient from "ink-gradient";
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
var DEFAULT_MESSAGE = "\u23F0 Time's up";
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
    partial: partialIndex > 0 ? EIGHTH_BLOCKS[partialIndex - 1] ?? "" : "",
    empty: " ".repeat(BAR_WIDTH - emptyStart)
  };
};
var formatFireTime = (date) => date.toLocaleTimeString([], {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit"
});
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
        process.stdout.write(chalk.dim("\ncancelled\n"));
        process.exit(0);
      }
    },
    { isActive: isRawModeSupported === true }
  );
  if (remainingMs <= 0) {
    const doneLabel = label !== DEFAULT_MESSAGE ? label : "";
    return React.createElement(
      Box,
      {
        borderStyle: "round",
        borderColor: "#a3e635",
        flexDirection: "column",
        paddingX: 1
      },
      React.createElement(
        Text,
        { color: "#a3e635", bold: true },
        `${icons.done}  Time's up${doneLabel ? `  \xB7  ${doneLabel}` : ""}`
      )
    );
  }
  const safeTotalMs = Math.max(1, totalMs);
  const elapsed = safeTotalMs - remainingMs;
  const bar = buildSmoothBar(Math.max(0, elapsed), safeTotalMs);
  const percentage = Math.round(Math.max(0, elapsed) / safeTotalMs * 100);
  const timeLabel = formatRemaining(Math.max(0, remainingMs));
  const frameIndex = tickCount % icons.timerFrames.length;
  const spinnerFrame = icons.timerFrames[frameIndex] ?? icons.timer;
  const fireTimeStr = formatFireTime(fireAt);
  const showLabel = label !== DEFAULT_MESSAGE;
  return React.createElement(
    Box,
    {
      borderStyle: "round",
      borderColor: "#a3e635",
      flexDirection: "column",
      paddingX: 1
    },
    React.createElement(
      Box,
      { flexDirection: "row", gap: 1 },
      React.createElement(Gradient, {
        colors: ["#a3e635", "#22c55e"],
        children: React.createElement(Text, { bold: true }, "ding")
      }),
      React.createElement(Text, { dimColor: true }, icons.timer)
    ),
    showLabel ? React.createElement(Text, { dimColor: true }, label) : null,
    React.createElement(
      Box,
      { flexDirection: "row" },
      React.createElement(Text, null, `${spinnerFrame} `),
      React.createElement(Text, { dimColor: true }, "\u2595"),
      React.createElement(Text, { color: "#a3e635" }, bar.filled),
      React.createElement(Text, { color: "#a3e635" }, bar.partial),
      React.createElement(Text, { dimColor: true }, bar.empty),
      React.createElement(Text, { dimColor: true }, "\u258F"),
      React.createElement(Text, { dimColor: true }, ` ${percentage}%`)
    ),
    React.createElement(BigText, { text: timeLabel, font: "tiny" }),
    React.createElement(
      Box,
      { flexDirection: "row", justifyContent: "space-between" },
      React.createElement(Text, { dimColor: true }, `fires ${fireTimeStr}`),
      React.createElement(Text, { dimColor: true }, "ctrl-c cancel")
    )
  );
};
var runForegroundCountdown = (fireAt, label, icons, onFire) => {
  const totalMs = fireAt.getTime() - Date.now();
  if (!process.stdin.isTTY) {
    process.on("SIGINT", () => {
      process.stdout.write(chalk.dim("\ncancelled\n"));
      process.exit(0);
    });
  }
  const { waitUntilExit } = render(
    React.createElement(CountdownView, { fireAt, totalMs, label, icons }),
    { exitOnCtrlC: false }
  );
  waitUntilExit().then(() => {
    onFire();
  });
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
import { render as render2, Box as Box2, Text as Text2, useInput as useInput2, useApp as useApp2, useStdin as useStdin2 } from "ink";
import TextInput from "ink-text-input";
import chalk3 from "chalk";
import { readdir } from "fs/promises";

// src/preview-sound.ts
import { spawn as spawn2 } from "child_process";
var SOUNDS_DIR = "/System/Library/Sounds";
var resolveSoundPath = (nameOrPath) => {
  if (nameOrPath.startsWith("/") || nameOrPath.endsWith(".aiff"))
    return nameOrPath;
  return `${SOUNDS_DIR}/${nameOrPath}.aiff`;
};
var activePreview = null;
var previewSound = (nameOrPath) => {
  if (activePreview !== null) {
    try {
      activePreview.kill();
    } catch {
    }
    activePreview = null;
  }
  const child = spawn2("afplay", [resolveSoundPath(nameOrPath)], {
    stdio: "ignore"
  });
  activePreview = child;
  child.unref();
  child.on("exit", () => {
    if (activePreview === child) activePreview = null;
  });
};

// src/wizard/wizard.tsx
var SOUNDS_DIR2 = "/System/Library/Sounds";
var STEP_NAMES = ["When", "Message", "Notify", "Sound", "Mode"];
var formatFireTime2 = (date) => date.toLocaleTimeString([], {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit"
});
var formatInTime = (date) => {
  const ms = date.getTime() - Date.now();
  return formatRemaining(Math.max(0, ms));
};
var getSoundLabel = (sound, soundOptions) => {
  if (sound === false) return "off";
  const opt = soundOptions.find((o) => o.value === sound);
  return opt ? opt.label : sound;
};
var FOOTER_HINTS = {
  0: "esc back \xB7 \u21B5 next",
  1: "esc back \xB7 \u21B5 next  (optional \u2014 leave empty to skip)",
  2: "y yes \xB7 n no \xB7 \u2191\u2193 choose \xB7 \u21B5 confirm \xB7 esc back",
  3: "\u2191\u2193 browse \xB7 space preview \xB7 \u21B5 confirm \xB7 esc back",
  4: "\u2191\u2193 choose \xB7 \u21B5 confirm \xB7 esc back",
  5: "\u21B5 start \xB7 esc back"
};
var Wizard = ({ onComplete }) => {
  const { exit } = useApp2();
  const { isRawModeSupported } = useStdin2();
  const rawMode = isRawModeSupported === true;
  const [step, setStep] = useState2(0);
  const [fireAt, setFireAt] = useState2(null);
  const [fireAtInput, setFireAtInput] = useState2("");
  const [whenError, setWhenError] = useState2(null);
  const [message, setMessage] = useState2("");
  const [notify, setNotify] = useState2(true);
  const [notifyCursor, setNotifyCursor] = useState2(0);
  const [sound, setSound] = useState2(
    "/System/Library/Sounds/Glass.aiff"
  );
  const [soundCursor, setSoundCursor] = useState2(1);
  const [soundOptions, setSoundOptions] = useState2([
    { label: "Off", value: false },
    { label: "Glass", value: "/System/Library/Sounds/Glass.aiff" }
  ]);
  const [previewing, setPreviewing] = useState2(null);
  const [detach, setDetach] = useState2(false);
  const [modeCursor, setModeCursor] = useState2(0);
  useEffect2(() => {
    readdir(SOUNDS_DIR2).then((files) => {
      const aiffs = files.filter((f) => f.endsWith(".aiff")).map((f) => f.replace(/\.aiff$/, "")).sort();
      const opts = [
        { label: "Off", value: false },
        ...aiffs.map((name) => ({
          label: name,
          value: `/System/Library/Sounds/${name}.aiff`
        }))
      ];
      setSoundOptions(opts);
      const glassIdx = opts.findIndex((o) => o.label === "Glass");
      if (glassIdx > 0) setSoundCursor(glassIdx);
    }).catch(() => {
    });
  }, []);
  useInput2(
    (input, key) => {
      if (key.ctrl && input === "c") {
        process.stdout.write(chalk3.dim("cancelled\n"));
        process.exit(0);
      }
      if (key.escape) {
        if (step === 0) {
          process.stdout.write(chalk3.dim("cancelled\n"));
          process.exit(0);
        }
        setStep((s) => s - 1);
      }
    },
    { isActive: rawMode }
  );
  useInput2(
    (input, key) => {
      if (step === 2) {
        if (key.upArrow || key.downArrow) setNotifyCursor((c) => 1 - c);
        if (key.return) {
          setNotify(notifyCursor === 0);
          setStep(3);
        }
        if (input === "y" || input === "Y") {
          setNotify(true);
          setStep(3);
        }
        if (input === "n" || input === "N") {
          setNotify(false);
          setStep(3);
        }
      }
      if (step === 3) {
        if (key.upArrow) setSoundCursor((c) => Math.max(0, c - 1));
        if (key.downArrow)
          setSoundCursor((c) => Math.min(soundOptions.length - 1, c + 1));
        if (input === " " && soundCursor > 0) {
          const opt = soundOptions[soundCursor];
          if (opt && opt.value !== false) {
            previewSound(opt.label);
            setPreviewing(opt.label);
            setTimeout(() => setPreviewing(null), 3e3);
          }
        }
        if (key.return) {
          const opt = soundOptions[soundCursor];
          if (opt) {
            setSound(opt.value);
            setStep(4);
          }
        }
      }
      if (step === 4) {
        if (key.upArrow || key.downArrow) setModeCursor((c) => 1 - c);
        if (key.return) {
          setDetach(modeCursor === 1);
          setStep(5);
        }
      }
      if (step === 5) {
        if (key.return) {
          onComplete({ fireAt, message, notify, sound, detach });
          exit();
        }
      }
    },
    { isActive: rawMode && step >= 2 }
  );
  const handleWhenChange = (val) => {
    setFireAtInput(val);
    if (!val) {
      setWhenError(null);
      return;
    }
    try {
      const result = parseTime(val);
      setFireAt(result.fireAt);
      setWhenError(null);
    } catch (err) {
      setFireAt(null);
      setWhenError(err instanceof Error ? err.message : String(err));
    }
  };
  const handleWhenSubmit = (val) => {
    if (!val) return;
    try {
      const result = parseTime(val);
      setFireAt(result.fireAt);
      setWhenError(null);
      setStep(1);
    } catch (err) {
      setWhenError(err instanceof Error ? err.message : String(err));
    }
  };
  const handleMessageSubmit = (val) => {
    setMessage(val);
    setStep(2);
  };
  const renderStepSummary = (s) => {
    if (s === 0 && fireAt)
      return `\u2192 ${formatFireTime2(fireAt)}  (in ${formatInTime(fireAt)})`;
    if (s === 1) return message ? `\u2192 "${message}"` : "\u2192 (none)";
    if (s === 2) return `\u2192 ${notify ? "yes" : "no"}`;
    if (s === 3) return `\u2192 ${getSoundLabel(sound, soundOptions)}`;
    if (s === 4) return `\u2192 ${detach ? "detach" : "foreground"}`;
    return "";
  };
  const renderActiveContent = () => {
    if (step === 0) {
      return React2.createElement(
        Box2,
        { flexDirection: "column", paddingLeft: 2 },
        React2.createElement(TextInput, {
          value: fireAtInput,
          onChange: handleWhenChange,
          onSubmit: handleWhenSubmit,
          placeholder: "e.g. 5m, 1h30m, 14:30"
        }),
        fireAt && !whenError ? React2.createElement(
          Text2,
          { color: "#a3e635" },
          `\u2192 ${formatFireTime2(fireAt)}  (in ${formatInTime(fireAt)})`
        ) : null,
        whenError ? React2.createElement(Text2, { color: "red" }, whenError) : null
      );
    }
    if (step === 1) {
      return React2.createElement(
        Box2,
        { flexDirection: "column", paddingLeft: 2 },
        React2.createElement(TextInput, {
          value: message,
          onChange: setMessage,
          onSubmit: handleMessageSubmit,
          placeholder: "(optional)"
        })
      );
    }
    if (step === 2) {
      return React2.createElement(
        Box2,
        { flexDirection: "column", paddingLeft: 2 },
        React2.createElement(
          Text2,
          { color: notifyCursor === 0 ? "#a3e635" : void 0 },
          `${notifyCursor === 0 ? "\u25B6" : " "} Yes`
        ),
        React2.createElement(
          Text2,
          { color: notifyCursor === 1 ? "#a3e635" : void 0 },
          `${notifyCursor === 1 ? "\u25B6" : " "} No`
        )
      );
    }
    if (step === 3) {
      const start = Math.max(0, soundCursor - 3);
      const end = Math.min(soundOptions.length, start + 8);
      const visible = soundOptions.slice(start, end);
      return React2.createElement(
        Box2,
        { flexDirection: "column", paddingLeft: 2 },
        ...visible.map((opt, i) => {
          const idx = start + i;
          const isCursor = idx === soundCursor;
          return React2.createElement(
            Text2,
            {
              key: opt.label,
              color: isCursor ? "#a3e635" : void 0,
              dimColor: !isCursor
            },
            `${isCursor ? "\u25B6" : " "} ${opt.label}`
          );
        }),
        previewing ? React2.createElement(
          Text2,
          { color: "#a3e635", dimColor: true },
          `\u266A previewing ${previewing}\u2026`
        ) : null
      );
    }
    if (step === 4) {
      const modeLabels = [
        "Foreground (watch the countdown)",
        "Detach (run in background)"
      ];
      return React2.createElement(
        Box2,
        { flexDirection: "column", paddingLeft: 2 },
        ...modeLabels.map(
          (label, i) => React2.createElement(
            Text2,
            {
              key: label,
              color: modeCursor === i ? "#a3e635" : void 0,
              dimColor: modeCursor !== i
            },
            `${modeCursor === i ? "\u25B6" : " "} ${label}`
          )
        )
      );
    }
    if (step === 5) {
      const reviewRows = [
        [
          "When",
          fireAt ? `\u2192 ${formatFireTime2(fireAt)}  (in ${formatInTime(fireAt)})` : ""
        ],
        ["Message", message ? `\u2192 "${message}"` : "\u2192 (none)"],
        ["Notify", `\u2192 ${notify ? "yes" : "no"}`],
        ["Sound", `\u2192 ${getSoundLabel(sound, soundOptions)}`],
        ["Mode", `\u2192 ${detach ? "detach" : "foreground"}`]
      ];
      return React2.createElement(
        Box2,
        { flexDirection: "column", paddingLeft: 2, gap: 1 },
        React2.createElement(
          Box2,
          { flexDirection: "column" },
          ...reviewRows.map(
            ([k, v]) => React2.createElement(
              Box2,
              { key: k, flexDirection: "row", gap: 1 },
              React2.createElement(
                Text2,
                { dimColor: true },
                (k ?? "").padEnd(9)
              ),
              React2.createElement(Text2, null, v)
            )
          )
        )
      );
    }
    return null;
  };
  const renderRail = () => {
    const rows = [];
    for (let s = 0; s < 5; s++) {
      const name = STEP_NAMES[s] ?? "";
      if (s < step) {
        rows.push(
          React2.createElement(
            Text2,
            { key: `step-${s}`, dimColor: true },
            `  \u2713 ${name}  ${renderStepSummary(s)}`
          )
        );
      } else if (s === step) {
        rows.push(
          React2.createElement(
            Text2,
            { key: `step-${s}`, color: "#a3e635", bold: true },
            `\u25B6 ${name}`
          )
        );
        rows.push(
          React2.createElement(
            Box2,
            { key: `step-${s}-content` },
            renderActiveContent()
          )
        );
      } else {
        rows.push(
          React2.createElement(
            Text2,
            { key: `step-${s}`, dimColor: true },
            `  \u25CB ${name}`
          )
        );
      }
    }
    if (step === 5) {
      rows.push(
        React2.createElement(
          Text2,
          { key: "review-header", color: "#a3e635", bold: true },
          "\u25B6 Review"
        )
      );
      rows.push(
        React2.createElement(
          Box2,
          { key: "review-content" },
          renderActiveContent()
        )
      );
    }
    return rows;
  };
  const hint = FOOTER_HINTS[step] ?? "";
  return React2.createElement(
    Box2,
    {
      borderStyle: "round",
      borderColor: "#a3e635",
      flexDirection: "column",
      paddingX: 1
    },
    ...renderRail(),
    React2.createElement(Text2, { dimColor: true }, hint)
  );
};
var resolveWizard = null;
var runWizard = () => {
  if (!process.stdin.isTTY) {
    process.stderr.write(
      "error: interactive wizard requires a TTY \u2014 pipe a time argument instead, e.g. ding 5m\n"
    );
    process.exit(1);
  }
  return new Promise((resolve) => {
    resolveWizard = resolve;
    render2(
      React2.createElement(Wizard, {
        onComplete: (config) => {
          resolveWizard?.(config);
        }
      })
    );
  });
};

// src/index.ts
var DEFAULT_TITLE = "ding";
var DEFAULT_MESSAGE2 = "\u23F0 Time's up";
var URL_PATTERN = /^https?:\/\/.+/;
var formatFireTime3 = (fireAt) => fireAt.toLocaleTimeString([], {
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
    if (message !== DEFAULT_MESSAGE2) forwardArgs.push(message);
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
      `${chalk4.hex("#a3e635")("ding")} \u2192 ${chalk4.bold(formatFireTime3(fireAt))}${chalk4.dim(" (detached)\n")}`
    );
    spawnDetached(forwardArgs);
    return;
  }
  process.stdout.write(
    `${chalk4.hex("#a3e635")("ding")} \u2192 ${chalk4.bold(formatFireTime3(fireAt))}${message !== DEFAULT_MESSAGE2 ? chalk4.dim(` \xB7 ${message}`) : ""}
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
      const wizardConfig = await runWizard();
      await run({
        rawTime: formatAsTimeString(wizardConfig.fireAt),
        fireAt: wizardConfig.fireAt,
        message: wizardConfig.message || DEFAULT_MESSAGE2,
        title: DEFAULT_TITLE,
        sound: wizardConfig.sound,
        notify: wizardConfig.notify,
        detach: wizardConfig.detach,
        iconsFlag
      });
      return;
    }
    const message = args.message ?? DEFAULT_MESSAGE2;
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
          `${chalk4.red("error:")} ${err instanceof Error ? err.message : String(err)}
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
