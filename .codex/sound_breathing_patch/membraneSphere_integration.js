/**
 * membraneSphere_integration.js
 *
 * Merge these sections into web-demo/membraneSphere.js.
 * This is an integration patch, not a replacement for your whole class.
 */

import { AcousticBreathingDriver } from "./acousticBreathingDriver.js";

/* ------------------------------------------------------------------ */
/* 1. Add these uniforms when creating the ShaderMaterial.             */
/* ------------------------------------------------------------------ */

const extraAcousticUniforms = {
  u_waveEnvelope: { value: 0 },
  u_waveSlope: { value: 0 },
  u_spectrumBands: { value: new THREE.Vector4(0.25, 0.25, 0.25, 0.25) },
  u_spectrogramBands: { value: new THREE.Vector4(0.25, 0.25, 0.25, 0.25) },
  u_spectralCentroid: { value: 0.5 },
  u_spectralSpread: { value: 0.2 },
  u_spectralEntropy: { value: 0.3 },
};

// Example:
// uniforms: {
//   ...existingUniforms,
//   ...extraAcousticUniforms,
// }


/* ------------------------------------------------------------------ */
/* 2. Add these methods to SoundMembraneSphere.                        */
/* ------------------------------------------------------------------ */

SoundMembraneSphere.prototype.applyAcousticViz = function applyAcousticViz(
  acoustic,
  options = {}
) {
  const playbackTimeProvider =
    options.playbackTimeProvider ??
    (() => {
      const audio = window.App?.playbackAudio;
      return audio && Number.isFinite(audio.currentTime)
        ? audio.currentTime
        : null;
    });

  this.acousticDriver = new AcousticBreathingDriver(acoustic, {
    loop: options.loop ?? true,
    playbackTimeProvider,
  });
};

SoundMembraneSphere.prototype._mixAudioStates = function _mixAudioStates(
  directState,
  liveState,
  liveWeight = 0.62
) {
  if (!directState) return liveState;
  if (!liveState) return directState;

  const mix = (a = 0, b = 0) => a + (b - a) * liveWeight;

  return {
    bass: mix(directState.bass, liveState.bass),
    lowMid: mix(directState.lowMid, liveState.lowMid),
    mid: mix(directState.mid, liveState.mid),
    treble: mix(directState.treble, liveState.treble),
    level: mix(directState.level, liveState.level),
    flux: mix(directState.flux, liveState.flux),
    transient: Math.max(directState.transient ?? 0, liveState.transient ?? 0),
  };
};

SoundMembraneSphere.prototype._writeDirectAcousticUniforms =
function _writeDirectAcousticUniforms(frame) {
  if (!frame || !this.material?.uniforms) return;

  const uniforms = this.material.uniforms;
  const shader = frame.shaderState;

  if (uniforms.u_waveEnvelope) {
    uniforms.u_waveEnvelope.value = shader.waveEnvelope;
  }
  if (uniforms.u_waveSlope) {
    uniforms.u_waveSlope.value = shader.waveSlope;
  }
  if (uniforms.u_spectrumBands) {
    uniforms.u_spectrumBands.value.set(...shader.spectrumBands);
  }
  if (uniforms.u_spectrogramBands) {
    uniforms.u_spectrogramBands.value.set(...shader.spectrogramBands);
  }
  if (uniforms.u_spectralCentroid) {
    uniforms.u_spectralCentroid.value = shader.spectralCentroid;
  }
  if (uniforms.u_spectralSpread) {
    uniforms.u_spectralSpread.value = shader.spectralSpread;
  }
  if (uniforms.u_spectralEntropy) {
    uniforms.u_spectralEntropy.value = shader.spectralEntropy;
  }
};


/* ------------------------------------------------------------------ */
/* 3. Replace the "Math.max against defaults" section in _pullAudio.   */
/*    Use weighted mixing so clips do not all saturate to the same     */
/*    values.                                                          */
/* ------------------------------------------------------------------ */

SoundMembraneSphere.prototype._pullDirectAcoustic =
function _pullDirectAcoustic(timeSeconds) {
  if (!this.acousticDriver) return null;
  const frame = this.acousticDriver.update(timeSeconds);
  this._writeDirectAcousticUniforms(frame);
  this._latestAcousticFrame = frame;
  return frame;
};

// Inside your existing _pullAudio(time, dt):
//
// const livePlayback = this._readLivePlayback();
// const directFrame = this._pullDirectAcoustic(time);
// const directState = directFrame?.audioState ?? null;
//
// const combined = this._mixAudioStates(
//   directState,
//   livePlayback,
//   livePlayback ? 0.62 : 0
// );
//
// if (combined) {
//   bass = combined.bass;
//   lowMid = combined.lowMid;
//   mid = combined.mid;
//   treble = combined.treble;
//   level = combined.level;
//   flux = combined.flux;
//   transient = combined.transient;
// }
//
// Important:
//   Do not use Math.max(default, feature) for every parameter.
//   Do not multiply every feature until it clamps to 1.
//   Use ?? instead of || for numeric features:
//     level = features.volume ?? features.energy ?? 0;


/* ------------------------------------------------------------------ */
/* 4. Add these declarations to MEMBRANE_VERT.                         */
/* ------------------------------------------------------------------ */

// uniform float u_waveEnvelope;
// uniform float u_waveSlope;
// uniform vec4 u_spectrumBands;
// uniform vec4 u_spectrogramBands;
// uniform float u_spectralCentroid;
// uniform float u_spectralSpread;
// uniform float u_spectralEntropy;


/* ------------------------------------------------------------------ */
/* 5. Insert this block after "vec3 pos" and "vec3 n" exist in shader. */
/*    It makes waveform, spectrum and spectrogram directly affect      */
/*    morphology, not only bass/mid/treble scalars.                    */
/* ------------------------------------------------------------------ */

/*
  // Waveform: whole-sphere breathing and attack direction.
  pos *= 1.0 + u_waveEnvelope * 0.085;
  pos += tangent * u_waveSlope * 0.028;

  // Whole-clip spectrum: persistent sound identity / base morphology.
  float baseLow =
    sin(pos.y * 2.6 + u_time * 0.18) *
    u_spectrumBands.x * 0.050;

  float baseMid =
    sin((pos.x + pos.z) * 7.5 + layerPhase + u_time * 0.36) *
    (u_spectrumBands.y + u_spectrumBands.z) * 0.026;

  float baseHigh =
    sin(pos.y * 19.0 + pos.x * 11.0 + layerPhase) *
    u_spectrumBands.w * 0.020;

  pos += n * (baseLow + baseMid + baseHigh) *
    (0.55 + u_spectralSpread * 0.75);

  // Spectrogram: time-varying frequency regions.
  float temporalLow =
    sin(pos.y * 3.0 - u_time * 0.42) *
    u_spectrogramBands.x * 0.045;

  float temporalMid =
    sin((pos.x - pos.z) * 9.0 + u_time * 0.78) *
    (u_spectrogramBands.y + u_spectrogramBands.z) * 0.022;

  float temporalHigh =
    jit *
    (u_spectrogramBands.w * 0.070) *
    (0.35 + u_spectralEntropy * 0.95);

  pos += n * (temporalLow + temporalMid + temporalHigh);

  // Centroid: low-centroid sounds remain broad; high-centroid sounds become
  // sharper and more radially displaced.
  pos += n * jit * mix(0.006, 0.050, u_spectralCentroid);
*/


/* ------------------------------------------------------------------ */
/* 6. Example usage after Python analysis completes.                   */
/* ------------------------------------------------------------------ */

// sphere.applyAcousticViz(pythonResult.acoustic, {
//   loop: true,
//   playbackTimeProvider: () => window.App?.playbackAudio?.currentTime ?? null,
// });