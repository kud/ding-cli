#!/usr/bin/env node

// src/index.ts
import chalk4 from "chalk";
import { defineCommand, runMain } from "citty";

// src/countdown.ts
import React, { useState, useEffect } from "react";
import { render, Box as Box2, Text as Text2, useInput, useApp, useStdin } from "ink";
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

// src/ringer.ts
import { spawn, spawnSync } from "child_process";

// src/sounds.ts
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  statSync,
  readdirSync
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
var SAMPLE_RATE = 44100;
var SYSTEM_SOUNDS_DIR = "/System/Library/Sounds";
var RINGTONES_DIR = "/System/Library/PrivateFrameworks/ToneLibrary.framework/Versions/A/Resources/Ringtones";
var RINGTONE_SUFFIX = "-EncoreInfinitum.m4r";
var CACHE_DIR = join(tmpdir(), "ding-sounds");
var ALARM_PRESETS = [
  "beep",
  "digital",
  "radar",
  "bell",
  "siren",
  "chime"
];
var isAlarmPreset = (value) => ALARM_PRESETS.includes(value);
var encodeWav = (samples) => {
  const dataLength = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataLength);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataLength, 40);
  let offset = 44;
  for (const sample of samples) {
    const clamped = Math.max(-1, Math.min(1, sample));
    buffer.writeInt16LE(Math.round(clamped * 32767), offset);
    offset += 2;
  }
  return buffer;
};
var sampleCount = (durationMs) => Math.round(durationMs / 1e3 * SAMPLE_RATE);
var oscillate = (waveform, phase) => {
  const value = Math.sin(phase);
  return waveform === "square" ? value >= 0 ? 1 : -1 : value;
};
var renderTone = (tone) => {
  const {
    frequency,
    durationMs,
    waveform = "sine",
    attackMs = 4,
    releaseMs = 12,
    decay = false,
    amplitude = 0.6
  } = tone;
  const count = sampleCount(durationMs);
  const attack = sampleCount(attackMs);
  const release = sampleCount(releaseMs);
  const samples = new Array(count);
  for (let i = 0; i < count; i++) {
    const phase = 2 * Math.PI * frequency * i / SAMPLE_RATE;
    const envelope = decay ? Math.exp(-5 * i / count) : i < attack ? i / attack : i > count - release ? (count - i) / release : 1;
    samples[i] = oscillate(waveform, phase) * envelope * amplitude;
  }
  return samples;
};
var renderSweep = (fromHz, toHz, durationMs, amplitude = 0.6) => {
  const count = sampleCount(durationMs);
  const samples = new Array(count);
  let phase = 0;
  for (let i = 0; i < count; i++) {
    const t = i / count;
    const frequency = fromHz + (toHz - fromHz) * t;
    phase += 2 * Math.PI * frequency / SAMPLE_RATE;
    const envelope = i < count * 0.05 ? i / (count * 0.05) : i > count * 0.9 ? (count - i) / (count * 0.1) : 1;
    samples[i] = Math.sin(phase) * envelope * amplitude;
  }
  return samples;
};
var silence = (durationMs) => new Array(sampleCount(durationMs)).fill(0);
var concat = (...groups) => [].concat(...groups);
var PRESET_BUILDERS = {
  beep: () => concat(
    ...Array.from(
      { length: 4 },
      () => concat(
        renderTone({
          frequency: 880,
          durationMs: 140,
          waveform: "square",
          amplitude: 0.4
        }),
        silence(120)
      )
    )
  ),
  digital: () => concat(
    ...Array.from(
      { length: 3 },
      () => concat(
        renderTone({ frequency: 1318, durationMs: 90 }),
        silence(60),
        renderTone({ frequency: 1318, durationMs: 90 }),
        silence(60),
        renderTone({ frequency: 1318, durationMs: 90 }),
        silence(300)
      )
    )
  ),
  radar: () => concat(
    ...Array.from(
      { length: 3 },
      () => concat(renderSweep(440, 1240, 520, 0.55), silence(180))
    )
  ),
  bell: () => concat(
    ...Array.from(
      { length: 3 },
      () => concat(
        renderTone({
          frequency: 660,
          durationMs: 900,
          decay: true,
          amplitude: 0.7
        }),
        silence(120)
      )
    )
  ),
  siren: () => concat(
    ...Array.from(
      { length: 4 },
      () => concat(
        renderTone({ frequency: 700, durationMs: 320, amplitude: 0.5 }),
        renderTone({ frequency: 550, durationMs: 320, amplitude: 0.5 })
      )
    )
  ),
  chime: () => concat(
    renderTone({
      frequency: 523,
      durationMs: 240,
      decay: true,
      amplitude: 0.6
    }),
    renderTone({
      frequency: 659,
      durationMs: 240,
      decay: true,
      amplitude: 0.6
    }),
    renderTone({
      frequency: 784,
      durationMs: 240,
      decay: true,
      amplitude: 0.6
    }),
    renderTone({
      frequency: 1046,
      durationMs: 700,
      decay: true,
      amplitude: 0.7
    })
  )
};
var ensureCacheDir = () => {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
};
var isUsableFile = (path) => {
  try {
    return statSync(path).size > 44;
  } catch {
    return false;
  }
};
var generatePreset = (preset) => {
  ensureCacheDir();
  const path = join(CACHE_DIR, `${preset}.wav`);
  if (isUsableFile(path)) return path;
  writeFileSync(path, encodeWav(PRESET_BUILDERS[preset]()));
  return path;
};
var isSystemSoundName = (value) => existsSync(join(SYSTEM_SOUNDS_DIR, `${value}.aiff`));
var listSystemSounds = (names) => names.filter((name) => name.endsWith(".aiff")).map((name) => name.replace(/\.aiff$/, "")).sort();
var listRingtones = () => {
  try {
    return readdirSync(RINGTONES_DIR).filter((name) => name.endsWith(RINGTONE_SUFFIX)).map((name) => ({
      name: name.slice(0, -RINGTONE_SUFFIX.length),
      path: join(RINGTONES_DIR, name)
    })).sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
};
var ringtonePath = (value) => {
  const path = join(RINGTONES_DIR, `${value}${RINGTONE_SUFFIX}`);
  return existsSync(path) ? path : null;
};
var resolveSound = (choice) => {
  if (choice.startsWith("/")) return choice;
  if (choice.endsWith(".aiff") || choice.endsWith(".wav") || choice.endsWith(".m4r"))
    return choice;
  if (isAlarmPreset(choice)) return generatePreset(choice);
  const ringtone = ringtonePath(choice);
  if (ringtone !== null) return ringtone;
  if (isSystemSoundName(choice))
    return join(SYSTEM_SOUNDS_DIR, `${choice}.aiff`);
  return choice;
};

// src/ringer.ts
var loopChild = null;
var looping = false;
var startRingLoop = (choice) => {
  const path = resolveSound(choice);
  looping = true;
  const playOnce = () => {
    if (!looping) return;
    const child = spawn("afplay", [path], { stdio: "ignore" });
    loopChild = child;
    child.on("exit", () => {
      if (loopChild === child) loopChild = null;
      if (looping) playOnce();
    });
  };
  playOnce();
};
var stopRingLoop = () => {
  looping = false;
  if (loopChild !== null) {
    try {
      loopChild.kill("SIGTERM");
    } catch {
    }
    loopChild = null;
  }
};
var ringTimes = (choice, count) => {
  const path = resolveSound(choice);
  for (let i = 0; i < count; i++) {
    spawnSync("afplay", [path], { stdio: "ignore" });
  }
};

// src/ui/tui.tsx
import { Box, Text } from "ink";
import { jsx, jsxs } from "react/jsx-runtime";
var ACCENT = "#a3e635";
var FooterHints = ({ hints }) => /* @__PURE__ */ jsx(Box, { gap: 2, flexWrap: "wrap", children: hints.map(([key, label]) => /* @__PURE__ */ jsxs(Box, { children: [
  /* @__PURE__ */ jsx(Text, { color: ACCENT, children: key }),
  /* @__PURE__ */ jsx(Text, { dimColor: true, children: " " + label })
] }, key)) });
var Tabs = ({
  active,
  items
}) => /* @__PURE__ */ jsx(Box, { gap: 2, children: items.map((item) => {
  const isActive = item.value === active;
  const marker = item.ready === false ? "\u25CB" : "\u2022";
  return /* @__PURE__ */ jsxs(Box, { gap: 0, children: [
    /* @__PURE__ */ jsx(
      Text,
      {
        bold: isActive,
        color: isActive ? ACCENT : void 0,
        dimColor: !isActive,
        children: item.label
      }
    ),
    /* @__PURE__ */ jsx(Text, { color: isActive ? ACCENT : void 0, dimColor: !isActive, children: " " + marker })
  ] }, item.value);
}) });

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
var CountdownView = ({
  fireAt,
  totalMs,
  label,
  icons,
  sound,
  onFire
}) => {
  const { exit } = useApp();
  const { isRawModeSupported } = useStdin();
  const rawMode = isRawModeSupported === true;
  const [remainingMs, setRemainingMs] = useState(fireAt.getTime() - Date.now());
  const [tickCount, setTickCount] = useState(0);
  const [phase, setPhase] = useState(
    "counting"
  );
  useEffect(() => {
    if (phase !== "counting") return;
    const interval = setInterval(() => {
      const remaining = fireAt.getTime() - Date.now();
      setRemainingMs(remaining);
      setTickCount((n) => n + 1);
      if (remaining <= 0) {
        clearInterval(interval);
        onFire();
        if (sound !== false && rawMode) {
          startRingLoop(sound);
          setPhase("ringing");
        } else {
          if (sound !== false) ringTimes(sound, 3);
          setPhase("done");
        }
      }
    }, TICK_MS);
    return () => clearInterval(interval);
  }, [fireAt, phase, sound, rawMode, onFire]);
  useEffect(() => {
    if (phase === "done") exit();
  }, [phase, exit]);
  useInput(
    (input, key) => {
      if (key.ctrl && input === "c") {
        stopRingLoop();
        process.stdout.write(chalk.dim("\ncancelled\n"));
        process.exit(0);
      }
      if (phase === "ringing") {
        stopRingLoop();
        setPhase("done");
      }
    },
    { isActive: rawMode }
  );
  const showLabel = label !== DEFAULT_MESSAGE;
  const title = showLabel ? label : "ding";
  if (phase === "ringing" || phase === "done") {
    const isRinging = phase === "ringing";
    return React.createElement(
      Box2,
      { flexDirection: "column", marginTop: 1, gap: 1 },
      React.createElement(
        Box2,
        { flexDirection: "row", gap: 1 },
        React.createElement(
          Text2,
          { color: ACCENT, bold: true },
          `${isRinging ? icons.bell : icons.done} ${isRinging ? "ringing" : "Time's up"}`
        ),
        showLabel ? React.createElement(Text2, { dimColor: true }, `\xB7 ${label}`) : null
      ),
      isRinging ? React.createElement(FooterHints, {
        hints: [["any key", "dismiss"]]
      }) : null
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
  return React.createElement(
    Box2,
    { flexDirection: "column", marginTop: 1, gap: 1 },
    React.createElement(
      Box2,
      { flexDirection: "row", gap: 1 },
      React.createElement(Text2, { dimColor: true }, icons.timer),
      React.createElement(Text2, { color: ACCENT, bold: true }, title)
    ),
    React.createElement(
      Box2,
      { flexDirection: "row" },
      React.createElement(Text2, null, `${spinnerFrame} `),
      React.createElement(Text2, { dimColor: true }, "\u2595"),
      React.createElement(Text2, { color: ACCENT }, bar.filled),
      React.createElement(Text2, { color: ACCENT }, bar.partial),
      React.createElement(Text2, { dimColor: true }, bar.empty),
      React.createElement(Text2, { dimColor: true }, "\u258F"),
      React.createElement(Text2, { dimColor: true }, ` ${percentage}%`)
    ),
    React.createElement(
      Box2,
      { flexDirection: "row", gap: 2 },
      React.createElement(Text2, { bold: true }, timeLabel),
      React.createElement(Text2, { dimColor: true }, `fires ${fireTimeStr}`)
    ),
    React.createElement(FooterHints, { hints: [["ctrl-c", "cancel"]] })
  );
};
var runForegroundCountdown = (fireAt, label, icons, sound, onFire) => {
  const totalMs = fireAt.getTime() - Date.now();
  if (!process.stdin.isTTY) {
    process.on("SIGINT", () => {
      stopRingLoop();
      process.stdout.write(chalk.dim("\ncancelled\n"));
      process.exit(0);
    });
  }
  return new Promise((resolve) => {
    const { waitUntilExit } = render(
      React.createElement(CountdownView, {
        fireAt,
        totalMs,
        label,
        icons,
        sound,
        onFire
      }),
      { exitOnCtrlC: false }
    );
    waitUntilExit().then(() => resolve());
  });
};

// src/detach.ts
import { spawn as spawn2 } from "child_process";
import chalk2 from "chalk";
var spawnDetached = (args) => {
  const child = spawn2(process.execPath, [process.argv[1], ...args], {
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
  timer: "\uF017",
  timerFrames: ["\uF017", "\uF251", "\uF252"],
  done: "\uF00C",
  pointer: "\uF054",
  bell: "\uF0F3"
};
var EMOJI = {
  timer: "\u23F3",
  timerFrames: ["\u23F3", "\u231B"],
  done: "\u2713",
  pointer: "\u25B8",
  bell: "\u{1F514}"
};
var ASCII = {
  timer: "[*]",
  timerFrames: ["|", "/", "-", "\\"],
  done: "[x]",
  pointer: ">",
  bell: "(!)"
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
import { spawnSync as spawnSync2 } from "child_process";
var DEFAULT_SOUND = "bell";
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

// src/wizard/wizard.tsx
import React2, { useState as useState2, useEffect as useEffect2 } from "react";
import { render as render2, Box as Box3, Text as Text3, useInput as useInput2, useApp as useApp2, useStdin as useStdin2 } from "ink";
import { TextInput, Select } from "@inkjs/ui";
import chalk3 from "chalk";
import { readdir } from "fs/promises";

// src/preview-sound.ts
import { spawn as spawn3 } from "child_process";
var activePreview = null;
var previewSound = (choice) => {
  if (activePreview !== null) {
    try {
      activePreview.kill("SIGTERM");
    } catch {
    }
    activePreview = null;
  }
  const child = spawn3("afplay", [resolveSound(choice)], {
    stdio: "ignore"
  });
  activePreview = child;
  child.unref();
  child.on("exit", () => {
    if (activePreview === child) activePreview = null;
  });
};
var stopPreview = () => {
  if (activePreview !== null) {
    try {
      activePreview.kill("SIGTERM");
    } catch {
    }
    activePreview = null;
  }
};

// src/wizard/wizard.tsx
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var SOUNDS_DIR = "/System/Library/Sounds";
var STEP_ORDER = [
  "when",
  "message",
  "sound",
  "notify",
  "mode",
  "review"
];
var STEP_LABELS = {
  when: "When",
  message: "Message",
  sound: "Sound",
  notify: "Notify",
  mode: "Mode",
  review: "Review"
};
var formatFireTime2 = (date) => date.toLocaleTimeString([], {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit"
});
var formatInTime = (date) => formatRemaining(Math.max(0, date.getTime() - Date.now()));
var soundLabel = (sound, options) => {
  if (sound === false) return "off";
  return options.find((o) => o.value === sound)?.label ?? sound;
};
var Wizard = ({
  onComplete
}) => {
  const { exit } = useApp2();
  const { isRawModeSupported } = useStdin2();
  const rawMode = isRawModeSupported === true;
  const [step, setStep] = useState2("when");
  const [fireAt, setFireAt] = useState2(null);
  const [whenInput, setWhenInput] = useState2("");
  const [whenError, setWhenError] = useState2(null);
  const [message, setMessage] = useState2("");
  const [notify, setNotify] = useState2(true);
  const [detach, setDetach] = useState2(false);
  const [sound, setSound] = useState2(ALARM_PRESETS[0]);
  const [soundCursor, setSoundCursor] = useState2(1);
  const [soundOptions, setSoundOptions] = useState2([
    { label: "Off", value: false, group: "" },
    ...ALARM_PRESETS.map((name) => ({
      label: name,
      value: name,
      group: "Alarm"
    }))
  ]);
  useEffect2(() => {
    const ringtones = listRingtones();
    readdir(SOUNDS_DIR).then((files) => {
      const systemNames = listSystemSounds(files);
      setSoundOptions([
        { label: "Off", value: false, group: "" },
        ...ALARM_PRESETS.map((name) => ({
          label: name,
          value: name,
          group: "Alarm"
        })),
        ...ringtones.map((ringtone) => ({
          label: ringtone.name,
          value: ringtone.name,
          group: "Ringtones"
        })),
        ...systemNames.map((name) => ({
          label: name,
          value: `${SOUNDS_DIR}/${name}.aiff`,
          group: "System"
        }))
      ]);
    }).catch(() => {
    });
  }, []);
  const whenReady = fireAt !== null && whenError === null;
  const cancel = () => {
    stopPreview();
    process.stdout.write(chalk3.dim("cancelled\n"));
    process.exit(0);
  };
  const shiftStep = (delta) => {
    const index = STEP_ORDER.indexOf(step);
    const next = STEP_ORDER[index + delta];
    if (next) setStep(next);
  };
  useInput2(
    (input, key) => {
      if (key.ctrl && input === "c") cancel();
      if (key.escape) {
        if (step === "when") cancel();
        else shiftStep(-1);
        return;
      }
      if (key.leftArrow || key.tab && key.shift) shiftStep(-1);
      else if (key.rightArrow || key.tab && !key.shift) shiftStep(1);
    },
    { isActive: rawMode }
  );
  useInput2(
    (input, key) => {
      if (key.upArrow) setSoundCursor((c) => Math.max(0, c - 1));
      if (key.downArrow)
        setSoundCursor((c) => Math.min(soundOptions.length - 1, c + 1));
      if (input === " ") {
        const opt = soundOptions[soundCursor];
        if (opt && opt.value !== false) previewSound(opt.label);
      }
      if (key.return) {
        const opt = soundOptions[soundCursor];
        if (opt) {
          setSound(opt.value);
          shiftStep(1);
        }
      }
    },
    { isActive: rawMode && step === "sound" }
  );
  useInput2(
    (_input, key) => {
      if (key.return) {
        if (!whenReady) {
          setStep("when");
          return;
        }
        stopPreview();
        onComplete({ fireAt, message, notify, sound, detach });
        exit();
      }
    },
    { isActive: rawMode && step === "review" }
  );
  const handleWhenChange = (value) => {
    setWhenInput(value);
    if (!value) {
      setFireAt(null);
      setWhenError(null);
      return;
    }
    try {
      setFireAt(parseTime(value).fireAt);
      setWhenError(null);
    } catch (err) {
      setFireAt(null);
      setWhenError(err instanceof Error ? err.message : String(err));
    }
  };
  const tabs = STEP_ORDER.map((id) => ({
    value: id,
    label: STEP_LABELS[id],
    ready: id === "review" ? whenReady : void 0
  }));
  const renderBody = () => {
    if (step === "when")
      return /* @__PURE__ */ jsxs2(Box3, { flexDirection: "column", children: [
        /* @__PURE__ */ jsx2(
          TextInput,
          {
            defaultValue: whenInput,
            placeholder: "e.g. 5m, 1h30m, 14:30",
            onChange: handleWhenChange,
            onSubmit: () => whenReady && shiftStep(1)
          },
          `when-${whenInput === "" ? "empty" : "set"}`
        ),
        whenReady && fireAt ? /* @__PURE__ */ jsx2(Text3, { color: ACCENT, children: `\u2192 ${formatFireTime2(fireAt)}  (in ${formatInTime(fireAt)})` }) : null,
        whenError ? /* @__PURE__ */ jsx2(Text3, { color: "red", children: whenError }) : null
      ] });
    if (step === "message")
      return /* @__PURE__ */ jsx2(
        TextInput,
        {
          defaultValue: message,
          placeholder: "(optional)",
          onChange: setMessage,
          onSubmit: () => shiftStep(1)
        }
      );
    if (step === "sound") {
      const start = Math.max(
        0,
        Math.min(soundCursor - 3, soundOptions.length - 8)
      );
      const visible = soundOptions.slice(
        Math.max(0, start),
        Math.max(0, start) + 8
      );
      return /* @__PURE__ */ jsx2(Box3, { flexDirection: "column", children: visible.map((opt, i) => {
        const idx = Math.max(0, start) + i;
        const isCursor = idx === soundCursor;
        const prev = soundOptions[idx - 1];
        const showGroup = opt.group && opt.group !== prev?.group;
        return /* @__PURE__ */ jsxs2(Box3, { flexDirection: "column", children: [
          showGroup ? /* @__PURE__ */ jsx2(Text3, { dimColor: true, bold: true, children: opt.group }) : null,
          /* @__PURE__ */ jsx2(
            Text3,
            {
              color: isCursor ? ACCENT : void 0,
              dimColor: !isCursor,
              children: `${isCursor ? "\u25B6" : " "} ${opt.label}`
            }
          )
        ] }, opt.label);
      }) });
    }
    if (step === "notify")
      return /* @__PURE__ */ jsx2(
        Select,
        {
          options: [
            { label: "Yes", value: "yes" },
            { label: "No", value: "no" }
          ],
          defaultValue: notify ? "yes" : "no",
          onChange: (value) => {
            setNotify(value === "yes");
            shiftStep(1);
          }
        }
      );
    if (step === "mode")
      return /* @__PURE__ */ jsx2(
        Select,
        {
          options: [
            { label: "Foreground \u2014 watch the countdown", value: "foreground" },
            { label: "Detach \u2014 run in background", value: "detach" }
          ],
          defaultValue: detach ? "detach" : "foreground",
          onChange: (value) => {
            setDetach(value === "detach");
            shiftStep(1);
          }
        }
      );
    const rows = [
      [
        "When",
        whenReady && fireAt ? `${formatFireTime2(fireAt)}  (in ${formatInTime(fireAt)})` : "not set"
      ],
      ["Message", message || "(none)"],
      ["Notify", notify ? "yes" : "no"],
      ["Sound", soundLabel(sound, soundOptions)],
      ["Mode", detach ? "detach" : "foreground"]
    ];
    return /* @__PURE__ */ jsxs2(Box3, { flexDirection: "column", gap: 1, children: [
      /* @__PURE__ */ jsx2(Box3, { flexDirection: "column", children: rows.map(([k, v]) => /* @__PURE__ */ jsxs2(Box3, { flexDirection: "row", gap: 1, children: [
        /* @__PURE__ */ jsx2(Text3, { dimColor: true, children: k.padEnd(8) }),
        /* @__PURE__ */ jsx2(Text3, { color: k === "When" && !whenReady ? "red" : void 0, children: v })
      ] }, k)) }),
      whenReady ? null : /* @__PURE__ */ jsx2(Text3, { color: "red", children: "set a valid time first (\u21B5 jumps to When)" })
    ] });
  };
  const hints = (() => {
    if (step === "when")
      return [
        ["\u21B5", "next"],
        ["\u2190\u2192", "step"],
        ["esc", "cancel"]
      ];
    if (step === "message")
      return [
        ["\u21B5", "next"],
        ["\u2190\u2192", "step"],
        ["esc", "back"]
      ];
    if (step === "sound")
      return [
        ["\u2191\u2193", "choose"],
        ["space", "preview"],
        ["\u21B5", "select"],
        ["\u2190\u2192", "step"],
        ["esc", "back"]
      ];
    if (step === "notify" || step === "mode")
      return [
        ["\u2191\u2193", "choose"],
        ["\u21B5", "confirm"],
        ["\u2190\u2192", "step"],
        ["esc", "back"]
      ];
    return [
      ["\u21B5", "start"],
      ["\u2190\u2192", "step"],
      ["esc", "back"]
    ];
  })();
  return /* @__PURE__ */ jsxs2(Box3, { flexDirection: "column", marginTop: 1, gap: 1, children: [
    /* @__PURE__ */ jsxs2(Box3, { flexDirection: "row", gap: 1, children: [
      /* @__PURE__ */ jsx2(Text3, { color: ACCENT, bold: true, children: "ding" }),
      /* @__PURE__ */ jsx2(Text3, { dimColor: true, children: "\uF017" })
    ] }),
    /* @__PURE__ */ jsx2(Tabs, { active: step, items: tabs }),
    /* @__PURE__ */ jsx2(Box3, { paddingLeft: 1, children: renderBody() }),
    /* @__PURE__ */ jsx2(FooterHints, { hints })
  ] });
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
        onComplete: (config) => resolveWizard?.(config)
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
var notifyOnFire = (opts) => {
  if (!opts.notify) return;
  const notifyOpts = {
    title: opts.title,
    message: opts.message
  };
  if (opts.subtitle !== void 0) notifyOpts.subtitle = opts.subtitle;
  if (opts.icon !== void 0) notifyOpts.icon = opts.icon;
  if (opts.open !== void 0) notifyOpts.open = opts.open;
  if (opts.notifySound !== void 0) notifyOpts.notifySound = opts.notifySound;
  sendNotification(notifyOpts);
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
  await runForegroundCountdown(fireAt, message, icons, sound, () => {
    notifyOnFire({ title, message, notify, subtitle, icon, open, notifySound });
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
      description: 'Alarm sound on fire: a preset (beep, digital, radar, bell, siren, chime), a macOS Clock ringtone name (e.g. Daybreak, Radial, "Milky Way"), a macOS system sound name (e.g. Glass), or a path to an audio file (default: bell)'
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
