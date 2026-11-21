/**
 * featureDebug.js
 * Run after each recording to confirm the values are actually different.
 */
export function logSoundFingerprint(name, features, acoustic) {
  const spectrum = acoustic?.spectrum ?? [];
  const spectrogram = acoustic?.spectrogram ?? [];

  const mean = (values) =>
    values.length
      ? values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length
      : 0;

  const flattenMean = (matrix) => {
    let sum = 0;
    let count = 0;
    for (const row of matrix ?? []) {
      for (const value of row ?? []) {
        sum += Number(value || 0);
        count += 1;
      }
    }
    return count ? sum / count : 0;
  };

  console.table({
    name,
    bass: features?.bass ?? 0,
    mid: features?.mid ?? 0,
    treble: features?.treble ?? 0,
    volume: features?.volume ?? features?.energy ?? 0,
    roughness: features?.roughness ?? 0,
    spectralVariation: features?.spectralVariation ?? 0,
    spectrumMean: mean(spectrum),
    spectrogramMean: flattenMean(spectrogram),
    waveformPoints: acoustic?.waveform?.length ?? 0,
    spectrumBins: spectrum.length,
    spectrogramRows: spectrogram.length,
    spectrogramColumns: spectrogram[0]?.length ?? 0,
  });
}