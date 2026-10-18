"""Compose the promo's background music — royalty-free by construction.

A 37 s ambient/lo-fi bed in A minor at 84 BPM: warm pad + bell arpeggio + soft
bass + airy texture, with a gentle smear "reverb". Everything is synthesised
here with numpy, so the result carries no third-party rights — you own it.

output: promo/bgm-ambient.wav / .mp3 / bgm-ambient-wave.png (waveform preview)
"""

import subprocess
import wave
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

SR = 44100
BPM = 84.0
BEAT = 60.0 / BPM
BAR = 4 * BEAT
PHRASES = 3
TAIL = 3.0
DUR = PHRASES * 4 * BAR + TAIL
N = int(SR * DUR)
rng = np.random.default_rng(7)

# Am7 · Fmaj7 · Cmaj7 · G6 — one bar each, repeated three times.
CHORDS = [
    [57, 60, 64, 67],
    [53, 57, 60, 64],
    [48, 52, 55, 59],
    [55, 59, 62, 64],
]


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


def add(buf, start, signal, pan=0.0):
    """Mix `signal` into the stereo buffer at `start` seconds."""
    n0 = int(start * SR)
    if n0 >= N or signal.size == 0:
        return
    n = min(signal.size, N - n0)
    left = np.sqrt(0.5 * (1 - pan))
    right = np.sqrt(0.5 * (1 + pan))
    buf[0, n0:n0 + n] += signal[:n] * left
    buf[1, n0:n0 + n] += signal[:n] * right


def pad(freq, dur, amp=0.20, attack=0.9, release=1.6, detune=0.0012):
    tt = np.arange(int(dur * SR)) / SR
    env = np.minimum(1.0, tt / attack) * np.clip((dur - tt) / release, 0, 1)
    sig = np.zeros_like(tt)
    for k, weight in enumerate((1.0, 0.42, 0.20, 0.09, 0.04), start=1):
        sig += weight * np.sin(2 * np.pi * freq * k * (1 + detune) * tt + 0.4 * k)
        sig += weight * np.sin(2 * np.pi * freq * k * (1 - detune) * tt + 1.1 * k)
    return amp * env * sig / 2


def bell(freq, amp=0.16, dur=1.1):
    tt = np.arange(int(dur * SR)) / SR
    env = np.exp(-tt * 5.2) * np.minimum(1.0, tt / 0.006)
    sig = np.sin(2 * np.pi * freq * tt)
    sig += 0.30 * np.sin(2 * np.pi * freq * 2.01 * tt) * np.exp(-tt * 8.5)
    sig += 0.12 * np.sin(2 * np.pi * freq * 3.02 * tt) * np.exp(-tt * 12.0)
    return amp * env * sig


def bass(freq, dur, amp=0.22):
    tt = np.arange(int(dur * SR)) / SR
    env = np.minimum(1.0, tt / 0.05) * np.clip((dur - tt) / 0.45, 0, 1)
    return amp * env * (np.sin(2 * np.pi * freq * tt) + 0.25 * np.sin(2 * np.pi * freq * 2 * tt))


def smear(buf, taps=((0.017, 0.42), (0.029, 0.28), (0.047, 0.18), (0.071, 0.11))):
    """Cheap diffuse tail: a few attenuated, delayed copies."""
    out = buf.copy()
    for delay, gain in taps:
        d = int(delay * SR)
        out[:, d:] += gain * buf[:, :-d]
    return out


music = np.zeros((2, N))

for phrase in range(PHRASES):
    bar0 = phrase * 4 * BAR
    for index, chord in enumerate(CHORDS):
        start = bar0 + index * BAR
        # Pad: chord tones, plus the seventh an octave up for air.
        for voice_index, midi in enumerate(chord):
            pan = -0.35 + 0.23 * voice_index
            add(music, start, pad(hz(midi), BAR * 1.02, amp=0.115), pan=pan)
        add(music, start, pad(hz(chord[0] + 12), BAR, amp=0.042), pan=0.1)
        # Bass on the downbeat.
        add(music, start, bass(hz(chord[0] - 12), BAR * 0.96, amp=0.165), pan=0.0)
        # Bell arpeggio on eighths — lazy, slightly swung.
        pattern = [0, 2, 1, 3, 2, 1, 3, 2]
        for step, tone in enumerate(pattern):
            when = start + step * BEAT / 2 + (0.03 if step % 2 else 0.0)
            amp = 0.24 if step % 4 else 0.30
            add(music, when, bell(hz(chord[tone] + 12), amp=amp), pan=0.25 if step % 2 else -0.25)

# Airy texture: band-limited noise with a slow swell.
air = np.convolve(rng.standard_normal(N), np.ones(90) / 90, mode="same")
air *= np.linspace(0.0, 1.0, N) ** 0.7 * np.clip((DUR - np.arange(N) / SR) / 4.0, 0, 1)
music += 0.015 * np.stack([air, np.roll(air, 331)])

music = smear(music)

# Fades, soft clip, normalise to -1 dBFS.
tt = np.arange(N) / SR
fade = np.minimum(1.0, tt / 1.6) * np.clip((DUR - tt) / 2.6, 0, 1)
music *= fade
music = np.tanh(music * 1.25) / np.tanh(1.25)
peak = np.max(np.abs(music))
music *= 0.891 / peak

pcm = (np.clip(music, -1, 1).T * 32767).astype(np.int16)
out_wav = Path(__file__).with_name("bgm-ambient.wav")
with wave.open(str(out_wav), "wb") as handle:
    handle.setnchannels(2)
    handle.setsampwidth(2)
    handle.setframerate(SR)
    handle.writeframes(pcm.tobytes())

out_mp3 = Path(__file__).with_name("bgm-ambient.mp3")
subprocess.run(
    ["ffmpeg", "-y", "-loglevel", "error", "-i", str(out_wav), "-codec:a", "libmp3lame",
     "-b:a", "192k", "-metadata", "title=术语速查 · ambient bed", str(out_mp3)],
    check=True,
)

# Waveform preview so the result can be eyeballed without listening.
touch = Path(__file__).with_name("bgm-ambient-wave.png")
W, H = 1200, 360
img = Image.new("RGB", (W, H), (0x0D, 0x0F, 0x14))
draw = ImageDraw.Draw(img)
mono = pcm.astype(np.float32).mean(axis=1) / 32768.0
step = mono.size // W
mid = H // 2
for x in range(W):
    chunk = mono[x * step:(x + 1) * step]
    if chunk.size == 0:
        continue
    lo, hi = chunk.min(), chunk.max()
    draw.line([(x, mid - hi * (H * 0.46)), (x, mid - lo * (H * 0.46))], fill=(0x6B, 0x84, 0xFF))
draw.line([(0, mid), (W, mid)], fill=(0x2A, 0x31, 0x40))
for phrase in range(PHRASES):
    x = int(phrase * 4 * BAR / DUR * W)
    draw.line([(x, 0), (x, H)], fill=(0x2A, 0x31, 0x40))
draw.text((14, 12), f"术语速查 · ambient bed  {DUR:.1f}s  {BPM:.0f} BPM  A minor", font=ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 18), fill=(0x9A, 0xA4, 0xB5))
img.save(touch)

peak_db = 20 * np.log10(np.max(np.abs(music)) + 1e-12)
rms_db = 20 * np.log10(np.sqrt(np.mean(music ** 2)) + 1e-12)
print(f"wav {out_wav.name}  {out_wav.stat().st_size // 1024} KB")
print(f"mp3 {out_mp3.name}  {out_mp3.stat().st_size // 1024} KB")
print(f"duration {DUR:.1f}s  peak {peak_db:.2f} dBFS  rms {rms_db:.2f} dBFS  clipped={int(np.sum(np.abs(music) >= 1.0))}")
