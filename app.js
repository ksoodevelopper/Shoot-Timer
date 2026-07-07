"use strict";

const STORAGE_KEY = "github-shot-timer-v1";
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const icons = {
  volumeOn: '<svg viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4V5Z"></path><path d="M15.5 8.5a5 5 0 0 1 0 7"></path><path d="M18.5 5.5a9 9 0 0 1 0 13"></path></svg>',
  volumeOff: '<svg viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4V5Z"></path><path d="m22 9-6 6"></path><path d="m16 9 6 6"></path></svg>',
  mic: '<svg viewBox="0 0 24 24"><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><path d="M12 19v3"></path></svg>',
  micOff: '<svg viewBox="0 0 24 24"><path d="m2 2 20 20"></path><path d="M9 9v3a3 3 0 0 0 5.1 2.1"></path><path d="M15 9.3V6a3 3 0 0 0-5.1-2.1"></path><path d="M19 10v2a7 7 0 0 1-.6 2.8"></path><path d="M5 10v2a7 7 0 0 0 10.4 6.1"></path><path d="M12 19v3"></path></svg>'
};

const els = {
  statusText: $("#statusText"),
  secureBadge: $("#secureBadge"),
  themeBtn: $("#themeBtn"),
  soundBtn: $("#soundBtn"),
  timerFace: $("#timerFace"),
  runState: $("#runState"),
  timerValue: $("#timerValue"),
  shotCount: $("#shotCount"),
  lastSplit: $("#lastSplit"),
  firstShot: $("#firstShot"),
  bestSplit: $("#bestSplit"),
  avgSplit: $("#avgSplit"),
  parResult: $("#parResult"),
  startBtn: $("#startBtn"),
  stopBtn: $("#stopBtn"),
  resetBtn: $("#resetBtn"),
  manualBtn: $("#manualBtn"),
  delayMode: $("#delayMode"),
  delayMin: $("#delayMin"),
  delayMax: $("#delayMax"),
  parTime: $("#parTime"),
  lockout: $("#lockout"),
  volume: $("#volume"),
  micBadge: $("#micBadge"),
  micBtn: $("#micBtn"),
  calibrateBtn: $("#calibrateBtn"),
  levelText: $("#levelText"),
  threshold: $("#threshold"),
  meter: $("#meter"),
  meterFill: $("#meterFill"),
  shotsBody: $("#shotsBody"),
  shotsEmpty: $("#shotsEmpty"),
  saveBtn: $("#saveBtn"),
  historyList: $("#historyList"),
  exportBtn: $("#exportBtn"),
  clearBtn: $("#clearBtn"),
  toast: $("#toast")
};

const state = {
  mode: "standard",
  status: "idle",
  muted: false,
  theme: "dark",
  shots: [],
  history: [],
  audioContext: null,
  stream: null,
  source: null,
  filter: null,
  meterNode: null,
  silentGain: null,
  micActive: false,
  micBackend: "none",
  waitStart: 0,
  waitDuration: 0,
  startTime: 0,
  stoppedElapsed: 0,
  lastShotWall: 0,
  ignoreAudioUntil: 0,
  timerFrame: 0,
  uiFrame: 0,
  parTimer: 0,
  sessionSaved: false,
  overThreshold: false,
  noiseFloor: 0.012,
  currentLevel: 0,
  heldLevel: 0,
  lastScore: 0,
  calibration: [],
  calibrating: false
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function toNumber(value, fallback = 0) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function format(value) {
  return Number.isFinite(value) && value > 0 ? value.toFixed(2) : "--";
}

function now() {
  return performance.now();
}

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isParMode() {
  return state.mode === "par" || state.mode === "dry";
}

function getParTime() {
  return clamp(toNumber(els.parTime.value, 3), .2, 60);
}

function getLockoutMs() {
  return clamp(toNumber(els.lockout.value, .08), .03, 1.5) * 1000;
}

function getManualThreshold() {
  return clamp(toNumber(els.threshold.value, 10), 2, 70) / 100;
}

function getActiveThreshold() {
  const adaptive = clamp(state.noiseFloor * 6.5 + .025, .035, .55);
  return Math.max(getManualThreshold(), adaptive);
}

function elapsed() {
  if (state.status === "running") return (now() - state.startTime) / 1000;
  return state.stoppedElapsed;
}

function setRunState(status, label, text) {
  state.status = status;
  els.runState.textContent = label;
  els.statusText.textContent = text;
  els.startBtn.disabled = status === "waiting" || status === "running";
  els.stopBtn.disabled = status !== "waiting" && status !== "running";
  els.manualBtn.disabled = status !== "running";
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => els.toast.classList.remove("show"), 2200);
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    state.history = Array.isArray(saved.history) ? saved.history : [];
    state.mode = saved.mode || "standard";
    state.theme = saved.theme || "dark";
    state.muted = Boolean(saved.muted);
    if (saved.settings) {
      for (const [key, value] of Object.entries(saved.settings)) {
        if (els[key] && "value" in els[key]) els[key].value = value;
      }
    }
  } catch {
    state.history = [];
  }
}

function save() {
  const settings = {
    delayMode: els.delayMode.value,
    delayMin: els.delayMin.value,
    delayMax: els.delayMax.value,
    parTime: els.parTime.value,
    lockout: els.lockout.value,
    volume: els.volume.value,
    threshold: els.threshold.value
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    mode: state.mode,
    theme: state.theme,
    muted: state.muted,
    settings,
    history: state.history.slice(0, 30)
  }));
}

async function ensureAudio() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) {
    showToast("Audio non supporté.");
    return null;
  }
  if (!state.audioContext) state.audioContext = new AudioContext();
  if (state.audioContext.state === "suspended") await state.audioContext.resume();
  return state.audioContext;
}

async function beep(kind = "start") {
  if (state.muted) return;
  const context = await ensureAudio();
  if (!context) return;

  const volume = clamp(toNumber(els.volume.value, 80) / 100, 0, 1);
  const start = context.currentTime;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const frequency = kind === "par" ? 960 : 3200;
  const duration = kind === "par" ? .08 : .1;

  oscillator.type = kind === "par" ? "triangle" : "square";
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(.001, volume * .23), start + .01);
  gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + .03);
  state.ignoreAudioUntil = now() + (kind === "start" ? 170 : 130);
}

function getDelay() {
  const min = clamp(toNumber(els.delayMin.value, 1), 0, 20);
  const max = clamp(toNumber(els.delayMax.value, 3), min, 20);
  return els.delayMode.value === "random" ? min + Math.random() * (max - min) : min;
}

async function startSession() {
  await ensureAudio();
  clearTimeout(state.parTimer);
  state.shots = [];
  state.sessionSaved = false;
  state.stoppedElapsed = 0;
  state.lastShotWall = 0;
  state.overThreshold = false;
  state.waitDuration = getDelay();
  state.waitStart = now();
  render();
  setRunState("waiting", "Attente", `Départ dans ${state.waitDuration.toFixed(1)} s`);
  startTimerLoop();

  setTimeout(async () => {
    if (state.status !== "waiting") return;
    await beep("start");
    state.startTime = now();
    state.stoppedElapsed = 0;
    setRunState("running", "Go", state.micActive ? `Micro actif (${state.micBackend})` : "Mode manuel");
    startTimerLoop();
    if (isParMode()) {
      state.parTimer = setTimeout(async () => {
        if (state.status === "running") {
          await beep("par");
          els.runState.textContent = "Par";
          els.statusText.textContent = "Par time atteint";
        }
      }, getParTime() * 1000);
    }
  }, state.waitDuration * 1000);
}

function stopSession() {
  if (state.status !== "waiting" && state.status !== "running") return;
  clearTimeout(state.parTimer);
  cancelAnimationFrame(state.timerFrame);
  if (state.status === "running") state.stoppedElapsed = elapsed();
  setRunState("stopped", "Stop", "Session stoppée");
  saveCurrentSession();
  render();
}

function resetSession() {
  clearTimeout(state.parTimer);
  cancelAnimationFrame(state.timerFrame);
  state.shots = [];
  state.stoppedElapsed = 0;
  state.sessionSaved = false;
  els.timerValue.textContent = "0.00";
  els.timerFace.style.setProperty("--ring", "0deg");
  setRunState("idle", "Standby", "Prêt");
  render();
}

function startTimerLoop() {
  cancelAnimationFrame(state.timerFrame);
  const tick = () => {
    if (state.status === "waiting") {
      const waitElapsed = (now() - state.waitStart) / 1000;
      const remaining = Math.max(0, state.waitDuration - waitElapsed);
      els.timerValue.textContent = remaining.toFixed(2);
      const ring = state.waitDuration ? clamp(waitElapsed / state.waitDuration, 0, 1) * 360 : 360;
      els.timerFace.style.setProperty("--ring", `${ring}deg`);
    }
    if (state.status === "running") {
      const time = elapsed();
      els.timerValue.textContent = time.toFixed(2);
      const base = isParMode() ? getParTime() : Math.max(6, time);
      els.timerFace.style.setProperty("--ring", `${clamp(time / base, 0, 1) * 360}deg`);
    }
    if (state.status === "waiting" || state.status === "running") state.timerFrame = requestAnimationFrame(tick);
  };
  tick();
}

function addShot(level = 1, source = "manual") {
  if (state.status !== "running") return;
  const stamp = now();
  if (stamp - state.lastShotWall < getLockoutMs()) return;
  const time = (stamp - state.startTime) / 1000;
  const previous = state.shots.at(-1);
  const split = previous ? time - previous.time : time;
  state.shots.push({
    id: uid(),
    time,
    split,
    level: clamp(level, 0, 1),
    source
  });
  state.lastShotWall = stamp;
  render();
}

function handleMeterMessage(data) {
  const score = clamp(Math.max(data.peak * 1.05, data.rms * 3.8, data.delta * .9, data.clip * 1.2), 0, 1);
  const threshold = getActiveThreshold();
  const sharpRise = data.delta > threshold * .34 || data.peak > state.noiseFloor * 9 || data.clip > .02;
  const trigger = score >= threshold && sharpRise;
  const stamp = now();

  state.currentLevel = score;
  state.heldLevel = Math.max(state.heldLevel, score);
  state.lastScore = score;

  if (state.calibrating) state.calibration.push(score);

  if (trigger && state.status === "running" && stamp > state.ignoreAudioUntil && !state.overThreshold) {
    state.overThreshold = true;
    addShot(score, "micro");
  }

  if (score < threshold * .42) state.overThreshold = false;
  if (state.status !== "running" || score < threshold * .7) {
    state.noiseFloor = clamp(state.noiseFloor * .965 + data.rms * .035, .003, .14);
  }
}

function meterProcessorSource() {
  return `
    class ShotMeterProcessor extends AudioWorkletProcessor {
      process(inputs, outputs) {
        const input = inputs[0] && inputs[0][0];
        const output = outputs[0] && outputs[0][0];
        if (output) output.fill(0);
        if (!input) return true;

        let sum = 0;
        let peak = 0;
        let delta = 0;
        let clipped = 0;
        let previous = this.previous || 0;

        for (let index = 0; index < input.length; index += 1) {
          const sample = input[index];
          const absolute = Math.abs(sample);
          const jump = Math.abs(sample - previous);
          if (absolute > peak) peak = absolute;
          if (jump > delta) delta = jump;
          if (absolute > .985) clipped += 1;
          sum += sample * sample;
          previous = sample;
        }

        this.previous = previous;
        this.port.postMessage({
          rms: Math.sqrt(sum / input.length),
          peak,
          delta,
          clip: clipped / input.length
        });
        return true;
      }
    }
    registerProcessor("shot-meter", ShotMeterProcessor);
  `;
}

function fallbackProcess(event) {
  const input = event.inputBuffer.getChannelData(0);
  const output = event.outputBuffer.getChannelData(0);
  output.fill(0);
  let sum = 0;
  let peak = 0;
  let delta = 0;
  let clipped = 0;
  let previous = fallbackProcess.previous || 0;
  for (let index = 0; index < input.length; index += 1) {
    const sample = input[index];
    const absolute = Math.abs(sample);
    const jump = Math.abs(sample - previous);
    if (absolute > peak) peak = absolute;
    if (jump > delta) delta = jump;
    if (absolute > .985) clipped += 1;
    sum += sample * sample;
    previous = sample;
  }
  fallbackProcess.previous = previous;
  handleMeterMessage({
    rms: Math.sqrt(sum / input.length),
    peak,
    delta,
    clip: clipped / input.length
  });
}

async function startMic() {
  if (state.micActive) return stopMic();
  if (!window.isSecureContext) {
    showToast("Le micro demande HTTPS ou localhost.");
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    showToast("Micro non disponible.");
    return;
  }

  try {
    const context = await ensureAudio();
    if (!context) return;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1
      }
    });

    const source = context.createMediaStreamSource(stream);
    const filter = context.createBiquadFilter();
    const silentGain = context.createGain();
    filter.type = "highpass";
    filter.frequency.value = state.mode === "dry" ? 900 : 650;
    filter.Q.value = .7;
    silentGain.gain.value = 0;

    source.connect(filter);
    state.stream = stream;
    state.source = source;
    state.filter = filter;
    state.silentGain = silentGain;
    state.noiseFloor = .012;
    state.overThreshold = false;

    if (context.audioWorklet) {
      const blob = new Blob([meterProcessorSource()], { type: "application/javascript" });
      const url = URL.createObjectURL(blob);
      await context.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      const node = new AudioWorkletNode(context, "shot-meter", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1]
      });
      node.port.onmessage = (event) => handleMeterMessage(event.data);
      filter.connect(node).connect(silentGain).connect(context.destination);
      state.meterNode = node;
      state.micBackend = "worklet";
    } else {
      const node = context.createScriptProcessor(512, 1, 1);
      node.onaudioprocess = fallbackProcess;
      filter.connect(node).connect(silentGain).connect(context.destination);
      state.meterNode = node;
      state.micBackend = "fallback";
    }

    state.micActive = true;
    els.calibrateBtn.disabled = false;
    els.micBtn.innerHTML = `${icons.micOff} Couper`;
    updateMicBadge();
    startUiMeter();
    showToast("Micro actif.");
  } catch {
    stopMic();
    showToast("Autorisation micro refusée.");
  }
}

function stopMic() {
  cancelAnimationFrame(state.uiFrame);
  if (state.meterNode) {
    if (state.meterNode.port) state.meterNode.port.onmessage = null;
    if ("onaudioprocess" in state.meterNode) state.meterNode.onaudioprocess = null;
    state.meterNode.disconnect();
  }
  if (state.filter) state.filter.disconnect();
  if (state.source) state.source.disconnect();
  if (state.silentGain) state.silentGain.disconnect();
  if (state.stream) state.stream.getTracks().forEach((track) => track.stop());

  state.stream = null;
  state.source = null;
  state.filter = null;
  state.meterNode = null;
  state.silentGain = null;
  state.micActive = false;
  state.micBackend = "none";
  state.currentLevel = 0;
  state.heldLevel = 0;
  state.overThreshold = false;
  els.meterFill.style.width = "0%";
  els.levelText.textContent = `0 / ${Math.round(getActiveThreshold() * 100)}%`;
  els.calibrateBtn.disabled = true;
  els.micBtn.innerHTML = `${icons.mic} Micro`;
  updateMicBadge();
}

function updateMicBadge() {
  els.micBadge.textContent = state.micActive ? `Micro ${state.micBackend}` : "Micro off";
  els.micBadge.className = state.micActive ? "badge good" : "badge";
}

function startUiMeter() {
  cancelAnimationFrame(state.uiFrame);
  const tick = () => {
    const threshold = getActiveThreshold();
    const level = clamp(Math.max(state.currentLevel, state.heldLevel), 0, 1);
    els.meterFill.style.width = `${Math.round(level * 100)}%`;
    els.levelText.textContent = `${Math.round(level * 100)} / ${Math.round(threshold * 100)}%`;
    state.currentLevel *= .62;
    state.heldLevel *= .82;
    state.uiFrame = requestAnimationFrame(tick);
  };
  tick();
}

async function calibrate() {
  if (!state.micActive) return;
  state.calibrating = true;
  state.calibration = [];
  showToast("Calibration...");
  await new Promise((resolve) => setTimeout(resolve, 1200));
  state.calibrating = false;
  const samples = state.calibration.filter(Number.isFinite).sort((a, b) => a - b);
  const p95 = samples[Math.floor(samples.length * .95)] || state.noiseFloor;
  const suggested = clamp(Math.round(Math.max(p95 * 2.2, state.noiseFloor * 8, .04) * 100), 4, 55);
  els.threshold.value = suggested;
  updateThreshold();
  save();
  showToast(`Seuil ${suggested}%.`);
}

function stats() {
  const first = state.shots[0]?.time || 0;
  const splits = state.shots.slice(1).map((shot) => shot.split);
  const best = splits.length ? Math.min(...splits) : 0;
  const avg = splits.length ? splits.reduce((total, split) => total + split, 0) / splits.length : 0;
  const total = state.shots.at(-1)?.time || 0;
  return { first, best, avg, total, count: state.shots.length };
}

function render() {
  const current = stats();
  els.shotCount.textContent = current.count;
  els.lastSplit.textContent = format(state.shots.at(-1)?.split || 0);
  els.firstShot.textContent = format(current.first);
  els.bestSplit.textContent = format(current.best);
  els.avgSplit.textContent = format(current.avg);
  els.parResult.textContent = isParMode() && current.total ? `${current.total - getParTime() >= 0 ? "+" : ""}${(current.total - getParTime()).toFixed(2)}` : isParMode() ? format(getParTime()) : "--";

  els.shotsBody.innerHTML = "";
  els.shotsEmpty.style.display = state.shots.length ? "none" : "block";
  state.shots.forEach((shot, index) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${index + 1}</td>
      <td>${shot.time.toFixed(2)} s</td>
      <td>${shot.split.toFixed(2)} s</td>
      <td>${Math.round(shot.level * 100)}%</td>
      <td>${shot.source}</td>
    `;
    els.shotsBody.appendChild(row);
  });
  renderHistory();
  save();
}

function saveCurrentSession(force = false) {
  if (state.sessionSaved || (!force && !state.shots.length)) return;
  const current = stats();
  state.history.unshift({
    id: uid(),
    date: new Date().toISOString(),
    mode: state.mode,
    count: current.count,
    first: current.first,
    best: current.best,
    avg: current.avg,
    total: current.total || elapsed(),
    par: isParMode() ? getParTime() : null,
    shots: state.shots.map((shot) => ({
      time: Number(shot.time.toFixed(3)),
      split: Number(shot.split.toFixed(3)),
      level: Number(shot.level.toFixed(3)),
      source: shot.source
    }))
  });
  state.history = state.history.slice(0, 30);
  state.sessionSaved = true;
  save();
  renderHistory();
  showToast("Session sauvegardée.");
}

function renderHistory() {
  els.historyList.innerHTML = "";
  if (!state.history.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "Aucune session.";
    els.historyList.appendChild(empty);
    return;
  }
  for (const session of state.history) {
    const item = document.createElement("article");
    item.className = "history-item";
    const date = new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(session.date));
    item.innerHTML = `
      <header><strong>${session.mode}</strong><time>${date}</time></header>
      <div class="history-stats">
        <span>Tirs <b>${session.count}</b></span>
        <span>1er <b>${format(session.first)}</b></span>
        <span>Best <b>${format(session.best)}</b></span>
        <span>Total <b>${format(session.total)}</b></span>
      </div>
    `;
    els.historyList.appendChild(item);
  }
}

function exportCsv() {
  const rows = [["session_id", "date", "mode", "shot", "time", "split", "signal", "source"]];
  const sessions = state.history.length ? state.history : [{
    id: "current",
    date: new Date().toISOString(),
    mode: state.mode,
    shots: state.shots
  }];

  for (const session of sessions) {
    for (const [index, shot] of session.shots.entries()) {
      rows.push([session.id, session.date, session.mode, index + 1, shot.time, shot.split, shot.level, shot.source]);
    }
  }
  if (rows.length === 1) {
    showToast("Rien à exporter.");
    return;
  }

  const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "shot-timer.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function setMode(mode) {
  state.mode = mode;
  $$(".mode-tabs button").forEach((button) => button.classList.toggle("active", button.dataset.mode === mode));
  els.parTime.disabled = mode === "standard";
  if (state.filter) state.filter.frequency.value = mode === "dry" ? 900 : 650;
  render();
}

function updateThreshold() {
  const threshold = getManualThreshold();
  els.meter.style.setProperty("--threshold", `${threshold * 100}%`);
  els.levelText.textContent = `${Math.round(state.currentLevel * 100)} / ${Math.round(getActiveThreshold() * 100)}%`;
}

function setTheme(theme) {
  state.theme = theme;
  document.documentElement.dataset.theme = theme;
  save();
}

function toggleSound() {
  state.muted = !state.muted;
  els.soundBtn.innerHTML = state.muted ? icons.volumeOff : icons.volumeOn;
  save();
}

function clearHistory() {
  state.history = [];
  save();
  renderHistory();
  showToast("Historique effacé.");
}

function bindEvents() {
  els.startBtn.addEventListener("click", startSession);
  els.stopBtn.addEventListener("click", stopSession);
  els.resetBtn.addEventListener("click", resetSession);
  els.manualBtn.addEventListener("click", () => addShot(1, "manuel"));
  els.micBtn.addEventListener("click", startMic);
  els.calibrateBtn.addEventListener("click", calibrate);
  els.saveBtn.addEventListener("click", () => saveCurrentSession(true));
  els.exportBtn.addEventListener("click", exportCsv);
  els.clearBtn.addEventListener("click", clearHistory);
  els.themeBtn.addEventListener("click", () => setTheme(state.theme === "dark" ? "light" : "dark"));
  els.soundBtn.addEventListener("click", toggleSound);
  els.threshold.addEventListener("input", () => {
    updateThreshold();
    save();
  });

  $$(".mode-tabs button").forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));
  [els.delayMode, els.delayMin, els.delayMax, els.parTime, els.lockout, els.volume].forEach((input) => {
    input.addEventListener("input", () => {
      render();
      save();
    });
  });

  window.addEventListener("keydown", (event) => {
    if (event.target.matches("input, select, button")) return;
    if (event.code === "Space") {
      event.preventDefault();
      if (state.status === "running" || state.status === "waiting") stopSession();
      else startSession();
    }
    if (event.key.toLowerCase() === "s" && state.status === "running") addShot(1, "manuel");
    if (event.key.toLowerCase() === "r") resetSession();
  });

  window.addEventListener("beforeunload", () => {
    if (state.status === "running") saveCurrentSession();
    stopMic();
  });
}

function boot() {
  load();
  bindEvents();
  setTheme(state.theme);
  setMode(state.mode);
  updateThreshold();
  updateMicBadge();
  setRunState("idle", "Standby", "Prêt");
  els.soundBtn.innerHTML = state.muted ? icons.volumeOff : icons.volumeOn;
  els.secureBadge.textContent = window.isSecureContext ? "HTTPS OK" : "HTTPS requis";
  els.secureBadge.className = window.isSecureContext ? "badge good" : "badge warn";
  els.micBtn.innerHTML = `${icons.mic} Micro`;
  render();
}

boot();
