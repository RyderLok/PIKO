"""
python_audio_features_patch.py

Replace or merge this function into python-service/audio_analyzer.py.
It returns waveform, whole-clip spectrum, spectrogram, and frameFeatures.
"""

from __future__ import annotations

from typing import Any, Dict, List
import numpy as np
import librosa


def _clamp01(value: float) -> float:
    return float(max(0.0, min(1.0, value)))


def _safe_normalize(values: np.ndarray) -> np.ndarray:
    values = np.asarray(values, dtype=np.float32)
    peak = float(np.max(np.abs(values))) if values.size else 0.0
    return values / peak if peak > 1e-9 else values


def _downsample_axis(matrix: np.ndarray, target_rows: int, target_cols: int) -> np.ndarray:
    row_indices = np.linspace(0, matrix.shape[0] - 1, min(target_rows, matrix.shape[0])).astype(int)
    col_indices = np.linspace(0, matrix.shape[1] - 1, min(target_cols, matrix.shape[1])).astype(int)
    return matrix[np.ix_(row_indices, col_indices)]


def extract_acoustic_payload(y: np.ndarray, sr: int) -> Dict[str, Any]:
    y = np.asarray(y, dtype=np.float32).reshape(-1)
    duration = float(len(y) / max(1, sr))

    if len(y) < 256:
        padded = np.pad(y, (0, 256 - len(y)))
    else:
        padded = y

    # Keep the original amplitude relationship. Do not normalize each clip
    # before RMS/level analysis, otherwise quiet and loud sounds become identical.
    n_fft = 2048 if len(padded) >= 2048 else 512
    hop_length = max(128, n_fft // 4)

    stft = librosa.stft(
        padded,
        n_fft=n_fft,
        hop_length=hop_length,
        window="hann",
        center=True,
    )
    magnitude = np.abs(stft).astype(np.float32)
    power = magnitude ** 2
    frequencies = librosa.fft_frequencies(sr=sr, n_fft=n_fft)

    # Waveform: preserve the temporal envelope, but cap output size.
    waveform_count = min(1200, max(256, len(y)))
    waveform_indices = np.linspace(0, max(0, len(y) - 1), waveform_count).astype(int)
    waveform = y[waveform_indices] if len(y) else np.zeros(waveform_count, dtype=np.float32)

    # Spectrum: log-compressed whole-clip profile.
    mean_spectrum = np.mean(magnitude, axis=1)
    mean_spectrum = np.log1p(mean_spectrum * 12.0)
    mean_spectrum = _safe_normalize(mean_spectrum)
    spectrum_indices = np.linspace(
        0, max(0, len(mean_spectrum) - 1), min(256, len(mean_spectrum))
    ).astype(int)
    spectrum = mean_spectrum[spectrum_indices]

    # Spectrogram: normalized against a fixed dB range, not each column.
    spectrogram_db = librosa.amplitude_to_db(magnitude, ref=np.max)
    spectrogram_norm = np.clip((spectrogram_db + 80.0) / 80.0, 0.0, 1.0)
    spectrogram_small = _downsample_axis(
        spectrogram_norm,
        target_rows=96,
        target_cols=180,
    )

    rms = librosa.feature.rms(S=magnitude)[0]
    centroid = librosa.feature.spectral_centroid(S=magnitude, sr=sr)[0]
    bandwidth = librosa.feature.spectral_bandwidth(S=magnitude, sr=sr)[0]
    zcr = librosa.feature.zero_crossing_rate(padded, frame_length=n_fft, hop_length=hop_length)[0]
    onset = librosa.onset.onset_strength(
        S=librosa.power_to_db(power + 1e-12),
        sr=sr,
        hop_length=hop_length,
    )

    # Positive spectral flux, normalized globally for the clip.
    normalized_frames = magnitude / (np.sum(magnitude, axis=0, keepdims=True) + 1e-9)
    delta = np.diff(normalized_frames, axis=1, prepend=normalized_frames[:, :1])
    flux = np.sum(np.maximum(delta, 0.0), axis=0)

    nyquist = max(1.0, sr / 2.0)

    def band_ratio(low_hz: float, high_hz: float) -> np.ndarray:
        mask = (frequencies >= low_hz) & (frequencies < high_hz)
        band_energy = np.sum(power[mask], axis=0) if np.any(mask) else np.zeros(power.shape[1])
        total_energy = np.sum(power, axis=0) + 1e-9
        return band_energy / total_energy

    bass = band_ratio(20, 250)
    low_mid = band_ratio(250, 1000)
    mid = band_ratio(1000, 4000)
    treble = band_ratio(4000, nyquist + 1)

    frame_count = min(
        len(rms),
        len(centroid),
        len(bandwidth),
        len(zcr),
        len(onset),
        len(flux),
        len(bass),
        len(low_mid),
        len(mid),
        len(treble),
    )

    # Fixed-reference normalization prevents every recording from being stretched
    # to the same 0..1 range.
    centroid_norm = np.clip(centroid[:frame_count] / nyquist, 0.0, 1.0)
    bandwidth_norm = np.clip(bandwidth[:frame_count] / nyquist, 0.0, 1.0)
    rms_norm = np.clip(rms[:frame_count] / 0.35, 0.0, 1.0)
    onset_norm = np.clip(onset[:frame_count] / 8.0, 0.0, 1.0)
    flux_norm = np.clip(flux[:frame_count] / 0.35, 0.0, 1.0)

    frame_features: List[Dict[str, float]] = []
    frame_step = max(1, frame_count // 240)

    for index in range(0, frame_count, frame_step):
        frame_features.append(
            {
                "time": float(librosa.frames_to_time(index, sr=sr, hop_length=hop_length)),
                "rms": _clamp01(float(rms_norm[index])),
                "centroid": _clamp01(float(centroid_norm[index])),
                "bandwidth": _clamp01(float(bandwidth_norm[index])),
                "zcr": _clamp01(float(zcr[index] * 4.0)),
                "onset": _clamp01(float(onset_norm[index])),
                "flux": _clamp01(float(flux_norm[index])),
                "bass": _clamp01(float(bass[index])),
                "lowMid": _clamp01(float(low_mid[index])),
                "mid": _clamp01(float(mid[index])),
                "treble": _clamp01(float(treble[index])),
            }
        )

    return {
        "waveform": [float(value) for value in waveform],
        "spectrum": [float(value) for value in spectrum],
        "spectrogram": [
            [float(value) for value in row]
            for row in spectrogram_small
        ],
        "frameFeatures": frame_features,
        "sampleRate": int(sr),
        "duration": duration,
    }