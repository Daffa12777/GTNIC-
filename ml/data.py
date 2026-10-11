"""Pemuat dataset UCI "Condition Monitoring of Hydraulic Systems" (CC BY 4.0).

Sumber : https://archive.ics.uci.edu/dataset/447/condition+monitoring+of+hydraulic+systems
Format : satu file teks per sensor (baris = siklus 60 detik, kolom = sampel), ditambah profile.txt
         berisi 5 kolom label per siklus.

Fitur per siklus = rata-rata dan simpangan baku tiap sensor (17 sensor x 2 = 34 fitur).
"""
from __future__ import annotations

import io
import urllib.request
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd

UCI_URL = "https://archive.ics.uci.edu/static/public/447/condition+monitoring+of+hydraulic+systems.zip"

SENSORS = ["PS1", "PS2", "PS3", "PS4", "PS5", "PS6", "EPS1", "FS1", "FS2",
           "TS1", "TS2", "TS3", "TS4", "VS1", "CE", "CP", "SE"]

# Satuan dan arti sensor (dipakai UI dan dokumentasi).
SENSOR_INFO = {
    "PS1": ("Tekanan PS1", "bar"), "PS2": ("Tekanan PS2", "bar"), "PS3": ("Tekanan PS3", "bar"),
    "PS4": ("Tekanan PS4", "bar"), "PS5": ("Tekanan PS5", "bar"), "PS6": ("Tekanan PS6", "bar"),
    "EPS1": ("Daya motor", "W"), "FS1": ("Debit FS1", "L/mnt"), "FS2": ("Debit FS2", "L/mnt"),
    "TS1": ("Suhu TS1", "°C"), "TS2": ("Suhu TS2", "°C"), "TS3": ("Suhu TS3", "°C"), "TS4": ("Suhu TS4", "°C"),
    "VS1": ("Getaran", "mm/s"), "CE": ("Efisiensi pendingin", "%"), "CP": ("Daya pendingin", "kW"),
    "SE": ("Faktor efisiensi", "%"),
}

# Kolom profile.txt -> nama komponen, dan nilai tiap kolom berurutan dari sehat ke paling parah.
COMPONENTS = {
    "cooler": {"column": 0, "levels": [100, 20, 3],
               "name": "Pendingin (cooler)", "meaning": {100: "efisiensi penuh", 20: "efisiensi menurun", 3: "mendekati gagal total"}},
    "valve": {"column": 1, "levels": [100, 90, 80, 73],
              "name": "Katup proporsional", "meaning": {100: "switching optimal", 90: "lag kecil", 80: "lag berat", 73: "mendekati gagal total"}},
    "pump": {"column": 2, "levels": [0, 1, 2],
             "name": "Pompa (kebocoran internal)", "meaning": {0: "tidak bocor", 1: "bocor ringan", 2: "bocor berat"}},
    "accumulator": {"column": 3, "levels": [130, 115, 100, 90],
                    "name": "Akumulator hidrolik", "meaning": {130: "tekanan optimal", 115: "sedikit menurun", 100: "menurun berat", 90: "mendekati gagal total"}},
}


def severity(component: str, level: int) -> float:
    """0 = sehat, 1 = tingkat paling parah (mendekati gagal total)."""
    lv = COMPONENTS[component]["levels"]
    return lv.index(int(level)) / (len(lv) - 1)


def feature_names() -> list[str]:
    return [f"{s}_{k}" for s in SENSORS for k in ("mean", "std")]


def _row_stats(path: Path) -> tuple[np.ndarray, np.ndarray]:
    a = pd.read_csv(path, sep="\t", header=None, engine="c").to_numpy(dtype=float)
    return a.mean(axis=1), a.std(axis=1)


def load_uci(folder: str | Path) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Baca folder UCI -> (X fitur, Y label). Y berisi cooler, valve, pump, accumulator, stable."""
    folder = Path(folder)
    cols = {}
    for s in SENSORS:
        f = folder / f"{s}.txt"
        if not f.exists():
            raise FileNotFoundError(f"{f} tidak ditemukan. Jalankan: python train.py --download")
        m, sd = _row_stats(f)
        cols[f"{s}_mean"], cols[f"{s}_std"] = m, sd
    X = pd.DataFrame(cols)
    prof = pd.read_csv(folder / "profile.txt", sep="\t", header=None).to_numpy()
    if len(prof) != len(X):
        raise ValueError(f"jumlah siklus tidak cocok: sensor {len(X)} vs profile {len(prof)}")
    Y = pd.DataFrame({"cooler": prof[:, 0], "valve": prof[:, 1], "pump": prof[:, 2],
                      "accumulator": prof[:, 3], "stable": prof[:, 4]})
    return X, Y


def download_uci(dest: str | Path) -> Path:
    """Unduh dan ekstrak dataset UCI (sekitar 73 MB) ke folder dest."""
    dest = Path(dest)
    dest.mkdir(parents=True, exist_ok=True)
    if (dest / "profile.txt").exists():
        return dest
    print(f"Mengunduh {UCI_URL} ...")
    req = urllib.request.Request(UCI_URL, headers={"User-Agent": "ManualMechanic/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r:
        blob = r.read()
    with zipfile.ZipFile(io.BytesIO(blob)) as z:
        z.extractall(dest)
    print(f"Selesai: {dest}")
    return dest
