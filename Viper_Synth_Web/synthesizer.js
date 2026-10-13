"use strict";

const BPM = 154;
const beat = 60 / BPM;
const STEPS_PER_BAR = 16;
const STEP_TIME = beat / 4;


const leadNotes = [
  [78,null,85,81,78,null,76,73,78,null,81,85,88,85,81,null],
  [78,81,85,null,88,85,81,78,76,78,81,null,85,81,78,null],
  [74,null,81,78,74,78,81,83,85,null,81,78,76,74,73,null],
  [76,80,83,null,88,83,80,76,73,null,76,80,83,80,76,null],
  [78,null,85,90,88,85,81,null,78,81,85,88,90,88,85,null],
  [78,81,85,null,88,85,81,78,76,78,81,85,88,null,85,81],
  [74,null,78,81,86,85,81,78,74,78,81,null,85,81,78,null],
  [76,80,83,88,83,80,76,null,73,76,80,83,88,83,80,null],
  [78,null,81,85,90,null,88,85,81,78,76,78,81,85,88,null],
  [81,85,88,null,85,81,78,76,78,81,85,88,90,88,85,null],
  [74,null,78,81,86,81,78,null,74,78,81,86,88,86,81,null],
  [76,80,83,null,88,83,80,76,73,76,80,83,88,null,83,80],
  [78,85,90,88,85,81,78,76,78,null,81,85,90,88,85,null],
  [80,83,88,null,83,80,76,73,76,80,83,88,85,83,80,null],
  [74,78,81,86,85,81,78,null,74,78,81,86,85,81,78,null],
  [76,null,80,83,88,83,80,76,73,76,80,83,78,null,76,null]
];
const bassRoots = [42,42,38,40,42,42,38,40,42,45,38,40,42,40,38,40];
const bassHits = [0, 3, 6, 8, 11, 14];
const duration = leadNotes.length * STEPS_PER_BAR * STEP_TIME;


let audio = null;
let playing = false;
const channels = {};
const clamp = value => Math.max(0, Math.min(1, Number(value) || 0));
const waveType = wave => wave === "pulse" ? "square" : wave;
const noteName = midi => Tone.Frequency(midi, "midi").toNote();

function envelopeOptions(values) {
  return {
    attack: 0.005 + clamp(values.attack) * 0.22,
    decay: 0.04 + clamp(values.decay) * 0.40,
    sustain: clamp(values.sustain),
    release: 0.04 + clamp(values.release) * 0.45
  };
}

function setEffect(effect, amount) {
  effect.wet.rampTo(clamp(amount), 0.04);
}

function createChannel(kind) {
  const values = settings[kind];
  const synth = kind === "fm"
    ? new Tone.PolySynth(Tone.FMSynth, {
        maxPolyphony: 12,
        oscillator: { type: waveType(values.wave) },
        modulation: { type: "sine" },
        harmonicity: 2,
        modulationIndex: 1.25,
        envelope: envelopeOptions(values),
        modulationEnvelope: { attack: 0.008, decay: 0.16, sustain: 0.4, release: 0.25 }
      })
    : new Tone.PolySynth(Tone.DuoSynth, {
        maxPolyphony: 8,
        vibratoAmount: 0.08,
        vibratoRate: 2.1,
        harmonicity: 1.004,
        voice0: { oscillator: { type: waveType(values.wave) }, envelope: envelopeOptions(values) },
        voice1: { oscillator: { type: waveType(values.wave) }, envelope: envelopeOptions(values) }
      });

  const input = new Tone.Gain(kind === "fm" ? 0.36 : 0.52);
  const chorus = new Tone.Chorus({ frequency: 1.2, delayTime: 3.5, depth: 0.55, wet: 0 }).start();
  const delay = new Tone.PingPongDelay({ delayTime: "8n.", feedback: 0.28, wet: 0 });
  const reverb = new Tone.Freeverb({ roomSize: 0.72, dampening: 2800, wet: 0 });
  const analyzer = new Tone.Waveform(256);
  synth.connect(input);
  input.chain(chorus, delay, reverb, audio.master);
  input.connect(analyzer);
  const channel = { kind, synth, input, chorus, delay, reverb, analyzer };
  channels[kind] = channel;
  applyChannel(kind);
  return channel;
}

function applyChannel(kind) {
  if (!audio) return;
  const ch = channels[kind];
  if (!ch) return;
  const values = settings[kind];
  const env = envelopeOptions(values);
  if (kind === "fm") {
    ch.synth.set({ oscillator: { type: waveType(values.wave) }, envelope: env });
  } else {
    ch.synth.set({
      voice0: { oscillator: { type: waveType(values.wave) }, envelope: env },
      voice1: { oscillator: { type: waveType(values.wave) }, envelope: env }
    });
  }
  setEffect(ch.reverb, values.reverb * (kind === "duo" ? 0.35 : 0.65));
  setEffect(ch.delay, values.delay * (kind === "duo" ? 0.30 : 0.65));
  setEffect(ch.chorus, values.chorus * 0.70);
}

function updateOscillator(kind) { applyChannel(kind); }
function updateInstrument(kind) {
  if (!audio) return;
  if (kind === "master") {
    audio.master.gain.rampTo(settings.volume * 0.9, 0.04);
  } else {
    applyChannel(kind);
  }
}

function updateMixWave() {
  if (!audio) return;
  audio.shaper.setMap(x => {
    let shaped;
    switch (settings.mix) {
      case "triangle": shaped = x; break;
      case "pulse": shaped = Math.tanh(x * 2.5); break;
      case "sawtooth": shaped = Math.tanh(x * 1.7); break;
      default: shaped = Math.sin(x * Math.PI / 2);
    }
    return 0.90 * x + 0.10 * shaped;
  });
}

function scheduleMusic() {
  const melody = [];
  const bass = [];
  leadNotes.forEach((barNotes, bar) => {
    barNotes.forEach((note, step) => {
      const time = (bar * STEPS_PER_BAR + step) * STEP_TIME;
      if (note !== null) melody.push([time, { note: noteName(note), gate: STEP_TIME * 0.82 }]);
      if (bassHits.includes(step)) {
        bass.push([time, {
          note: noteName(bassRoots[bar] + (step === 6 ? 7 : 0)),
          gate: STEP_TIME * (step === 0 || step === 8 ? 2.1 : 1.25)
        }]);
      }
    });
  });
  audio.fmPart = new Tone.Part((time, event) => {
    channels.fm.synth.triggerAttackRelease(event.note, event.gate, time, 0.73);
  }, melody);
  audio.duoPart = new Tone.Part((time, event) => {
    channels.duo.synth.triggerAttackRelease(event.note, event.gate, time, 0.8);
  }, bass);
  for (const part of [audio.fmPart, audio.duoPart]) {
    part.loop = true;
    part.loopEnd = duration;
    part.start(0);
  }
}

async function initializeAudio() {
  if (audio) return;
  if (typeof Tone === "undefined") {
    throw new Error("Tone.js не загрузилась. Проверьте подключение к интернету и CDN.");
  }
  await Tone.start(); // Browser requires an actual user gesture.
  Tone.Transport.bpm.value = BPM;
  const master = new Tone.Gain(settings.volume * 0.9);
  const shaper = new Tone.WaveShaper(1024);
  const limiter = new Tone.Limiter(-1).toDestination();
  master.chain(shaper, limiter);
  audio = { master, shaper, limiter };
  updateMixWave();
  createChannel("fm");
  createChannel("duo");
  audio.fmAnalyzer = channels.fm.analyzer;
  audio.duoAnalyzer = channels.duo.analyzer;
  scheduleMusic();
  Tone.Transport.start();
  playing = true;
}

async function pauseAudio() {
  if (!audio || !playing) return;
  Tone.Transport.pause();
  channels.fm.synth.releaseAll();
  channels.duo.synth.releaseAll();
  playing = false;
}

async function resumeAudio() {
  if (!audio) return initializeAudio();
  await Tone.start();
  if (!playing) {
    Tone.Transport.start();
    playing = true;
  }
}

async function resetAudio() {
  if (!audio) return;
  Tone.Transport.stop();
  channels.fm.synth.releaseAll();
  channels.duo.synth.releaseAll();
  if (playing) Tone.Transport.start();
}
