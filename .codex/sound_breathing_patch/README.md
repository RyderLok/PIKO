# Sound Breathing patch

This package changes the system from:

audio -> bass/mid/treble/level/flux -> one generic particle sphere

to:

audio -> waveform + whole-clip spectrum + time-varying spectrogram
      -> direct morphology uniforms
      + live FFT band animation
      -> visibly different sound identities

Files:

- `acousticBreathingDriver.js`
  Reads waveform, spectrum and spectrogram arrays and produces per-frame values.

- `python_audio_features_patch.py`
  Extracts waveform, spectrum, spectrogram and frame features without normalizing every recording into an identical range.

- `membraneSphere_integration.js`
  Integration snippets for `SoundMembraneSphere`.

- `featureDebug.js`
  Logs a fingerprint after every recording to detect stale or saturated feature values.

Important implementation rules:

1. Use live FFT for playback timing and motion.
2. Use the whole-clip spectrum for persistent base morphology.
3. Use the spectrogram column at the current playback time for local, changing surface patterns.
4. Use waveform envelope and slope for breathing and transient direction.
5. Do not combine every feature with `Math.max`.
6. Do not aggressively multiply and clamp every feature to 1.
7. Use `??`, not `||`, for numeric values that may legitimately be zero.
8. Confirm `window.activeAudioFeatures` and the acoustic arrays are replaced after every recording.