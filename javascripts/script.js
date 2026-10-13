"use strict";

const settings = {
  fm: { wave: "triangle", attack: .17, decay: .70, sustain: .35, release: .87, reverb: .50, delay: .80, chorus: .43 },
  duo: { wave: "triangle", attack: .17, decay: .70, sustain: .35, release: .87, reverb: .50, delay: .80, chorus: .43 },
  volume: .50,
  mix: "sine"
};

const playButton = document.getElementById("playButton");
const message = document.getElementById("errorMessage");
let busy = false;
function showError(text) {
  message.textContent = text;
  message.hidden = false;
  clearTimeout(showError.timer);
  showError.timer = setTimeout(() => { message.hidden = true; }, 7000);
}
function syncPlayButton() {
  playButton.classList.toggle("is-playing", playing);
  playButton.setAttribute("aria-pressed", String(playing));
  playButton.setAttribute("aria-label", playing ? "Pause" : "Play");
}

playButton.addEventListener("click", async () => {
  if (busy) return;
  busy = true;
  playButton.disabled = true;
  try {
    if (playing) await pauseAudio();
    else await resumeAudio();
    syncPlayButton();
  } catch (error) {
    console.error(error);
    showError("Cannot start audio: " + error.message);
  } finally {
    busy = false;
    playButton.disabled = false;
  }
});

function selectOption(button, selector) {
  button.closest('[role="group"]').querySelectorAll(selector).forEach(option => {
    const selected = option === button;
    option.classList.toggle("is-selected", selected);
    option.setAttribute("aria-pressed", String(selected));
  });
}
document.querySelectorAll("[data-instrument]").forEach(panel => {
  const instrument = panel.dataset.instrument;
  panel.querySelectorAll("[data-wave]").forEach(button => {
    button.setAttribute("aria-pressed", String(button.classList.contains("is-selected")));
    button.addEventListener("click", () => {
      settings[instrument].wave = button.dataset.wave;
      selectOption(button, "[data-wave]");
      updateOscillator(instrument);
    });
  });
  panel.querySelectorAll("input[data-param]").forEach(slider => {
    const param = slider.dataset.param;
    const output = slider.parentElement.querySelector("output");
    slider.addEventListener("input", () => {
      const value = Number(slider.value);
      settings[instrument][param] = value;
      if (output) output.textContent = value.toFixed(2);
      // Tone.js nodes are updated live, without offline re-rendering.
      updateInstrument(instrument);
    });
  });
});

const volumeSlider = document.getElementById("volume");
volumeSlider.addEventListener("input", () => {
  settings.volume = Number(volumeSlider.value);
  updateInstrument("master");
});
document.querySelectorAll("[data-mix]").forEach(button => {
  button.setAttribute("aria-pressed", String(button.classList.contains("is-selected")));
  button.addEventListener("click", () => {
    settings.mix = button.dataset.mix;
    selectOption(button, "[data-mix]");
    updateMixWave();
  });
});

const upper = document.getElementById("visualizerTop");
const lower = document.getElementById("visualizerBottom");
const BARS = 17;
function createBars(parent) {
  return Array.from({ length: BARS }, (_, i) => {
    const bar = document.createElement("span");
    bar.className = "wave-bar";
    bar.style.setProperty("--h", `${9 + 21 * (1 - Math.abs(i - 8) / 9)}px`);
    parent.appendChild(bar);
    return bar;
  });
}
const topBars = createBars(upper);
const bottomBars = createBars(lower);
function drawBars(bars, samples, now, invert) {
  const active = Boolean(samples && playing);
  for (let i = 0; i < bars.length; i++) {
    const index = samples ? Math.floor(i * (samples.length - 1) / (bars.length - 1)) : 0;
    let energy = active ? Math.abs(samples[index]) : 0;
    if (active && samples) {
      for (let j = 1; j <= 4; j++) energy = Math.max(energy, Math.abs(samples[Math.min(samples.length - 1,index+j)]));
    }
    const resting = 9 + 19 * (1 - Math.abs(i - 8) / 9);
    const amplitude = active ? 8 + Math.min(26, energy * 70) : resting;
    const jitter = active ? Math.sin(now / 170 + i * .75 + (invert ? 1.6 : 0)) * 1.5 : 0;
    bars[i].style.setProperty("--h", `${Math.max(8, Math.min(34, amplitude + jitter)).toFixed(1)}px`);
  }
}
function animate(now) {
  let fmSamples = null;
  let duoSamples = null;
  if (audio && playing) {
    fmSamples = audio.fmAnalyzer.getValue();
    duoSamples = audio.duoAnalyzer.getValue();
  }
  drawBars(topBars, fmSamples, now, false);
  drawBars(bottomBars, duoSamples, now, true);
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
