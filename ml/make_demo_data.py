"""Pembangkit data DEMO berformat UCI (sintetis, bukan data asli).

Dipakai hanya agar proyek bisa dijalankan dan diuji tanpa mengunduh dataset asli.
Format file sama persis dengan dataset UCI, sehingga `train.py --data <folder>` bekerja identik.
Untuk hasil yang sah, latih dengan dataset asli: `python train.py --download`.
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np

from data import COMPONENTS, SENSORS, severity

# Nilai dasar kondisi sehat (rentang tipikal, hanya untuk demo sintetis).
BASE = {"PS1": 160, "PS2": 110, "PS3": 105, "PS4": 80, "PS5": 9.5, "PS6": 9.4,
        "EPS1": 2500, "FS1": 6.6, "FS2": 10.2, "TS1": 35, "TS2": 41, "TS3": 38, "TS4": 31,
        "VS1": 0.60, "CE": 40, "CP": 2.0, "SE": 55}
SAMPLES = {"PS1": 60, "PS2": 60, "PS3": 60, "PS4": 60, "PS5": 60, "PS6": 60, "EPS1": 60,
           "FS1": 30, "FS2": 30, "TS1": 20, "TS2": 20, "TS3": 20, "TS4": 20, "VS1": 20, "CE": 20, "CP": 20, "SE": 20}


def cycle_means(lv: dict, rng) -> tuple[dict, dict]:
    """Rata-rata dan sigma deret waktu satu siklus dari tingkat kerusakan tiap komponen."""
    s = {c: severity(c, lv[c]) for c in COMPONENTS}
    m = {k: v * (1 + rng.normal(0, 0.004)) for k, v in BASE.items()}
    sg = {k: abs(v) * 0.004 for k, v in BASE.items()}
    # kebocoran pompa: tekanan dan debit turun, daya dan suhu naik
    m["PS1"] -= 9 * s["pump"]; m["FS1"] -= 1.3 * s["pump"]; m["EPS1"] += 230 * s["pump"]
    m["TS1"] += 2.4 * s["pump"]; m["VS1"] += 0.09 * s["pump"]; m["SE"] -= 6 * s["pump"]
    # katup: tekanan hilir turun, fluktuasi tekanan dan debit naik
    m["PS3"] -= 7 * s["valve"]; m["PS2"] -= 5 * s["valve"]; m["FS2"] -= 0.9 * s["valve"]
    sg["PS1"] += 2.8 * s["valve"]; sg["FS1"] += 0.25 * s["valve"]; m["EPS1"] += 60 * s["valve"]
    # pendingin: suhu naik, efisiensi dan daya pendingin turun
    for t, k in (("TS1", 7), ("TS2", 9), ("TS3", 8), ("TS4", 7)):
        m[t] += k * s["cooler"]
    m["CE"] -= 31 * s["cooler"]; m["CP"] -= 1.6 * s["cooler"]; m["SE"] -= 4 * s["cooler"]
    # akumulator: denyut tekanan membesar, tekanan sisi sistem turun
    sg["PS1"] += 4.0 * s["accumulator"]; sg["PS2"] += 3.2 * s["accumulator"]
    m["PS4"] -= 6 * s["accumulator"]; m["VS1"] += 0.05 * s["accumulator"]; m["FS2"] += 0.4 * s["accumulator"]
    return m, sg


def make(out: Path, n: int = 2205, seed: int = 11) -> None:
    rng = np.random.default_rng(seed)
    out.mkdir(parents=True, exist_ok=True)
    rows = {s: [] for s in SENSORS}
    prof = []
    for _ in range(n):
        lv = {}
        for c, spec in COMPONENTS.items():
            levels = spec["levels"]
            p = np.array([0.66] + [0.34 / (len(levels) - 1)] * (len(levels) - 1))
            lv[c] = int(rng.choice(levels, p=p))
        m, sg = cycle_means(lv, rng)
        for s in SENSORS:
            rows[s].append(m[s] + rng.normal(0, max(sg[s], 1e-6), SAMPLES[s]))
        prof.append([lv["cooler"], lv["valve"], lv["pump"], lv["accumulator"], 0])
    for s in SENSORS:
        np.savetxt(out / f"{s}.txt", np.array(rows[s]), fmt="%.4f", delimiter="\t")
    np.savetxt(out / "profile.txt", np.array(prof), fmt="%d", delimiter="\t")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="data/demo_uci_format")
    ap.add_argument("--n", type=int, default=2205)
    a = ap.parse_args()
    make(Path(a.out), a.n)
    print(f"Data demo sintetis (format UCI) ditulis ke {a.out}")
