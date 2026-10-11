"""Latih model dari dataset UCI Hydraulic Systems.

Pemakaian:
  python train.py --download            # unduh dataset asli UCI (73 MB) lalu latih
  python train.py --data data/uci       # latih dari folder yang sudah ada
  python train.py --demo                # latih dari data sintetis berformat UCI (hanya untuk uji)

Keluaran di artifacts/: model.joblib, metrics.json, profiles.json (juga disalin ke ../backend/assets/).
Model:
  - Isolation Forest, dilatih hanya pada siklus sehat -> deteksi anomali.
  - Random Forest per komponen (pendingin, katup, pompa, akumulator) -> tingkat kerusakan + probabilitas.
"""
from __future__ import annotations

import argparse
import json
import shutil
import time
from pathlib import Path

import joblib
import numpy as np
from sklearn.ensemble import IsolationForest, RandomForestClassifier
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from data import COMPONENTS, SENSOR_INFO, SENSORS, download_uci, load_uci, severity
import make_demo_data

HERE = Path(__file__).resolve().parent
ART = HERE / "artifacts"
SEED = 42
BANK_SIZE = 40


def healthy_mask(Y):
    m = np.ones(len(Y), dtype=bool)
    for c, spec in COMPONENTS.items():
        m &= Y[c].to_numpy() == spec["levels"][0]
    return m


def build_profiles(X, Y, source, Xall=None, Yall=None):
    """Bank siklus nyata (dari split uji) untuk simulator: tiap (komponen, tingkat) dipilih siklus
    yang komponen lain paling sehat."""
    deg = np.zeros(len(Y), dtype=int)
    for c, spec in COMPONENTS.items():
        deg += (Y[c].to_numpy() != spec["levels"][0]).astype(int)
    r = lambda arr: [[round(float(v), 4) for v in row] for row in arr]
    healthy = X[healthy_mask(Y)].to_numpy()
    if len(healthy) < 10 and Xall is not None:   # split uji terlalu sedikit siklus sehat: ambil dari seluruh data
        healthy = Xall[healthy_mask(Yall)].to_numpy()
    banks = {}
    for c, spec in COMPONENTS.items():
        banks[c] = {}
        for lv in spec["levels"][1:]:
            idx = np.where(Y[c].to_numpy() == lv)[0]
            if len(idx) == 0:
                continue
            others = deg[idx] - 1
            singles = idx[others == 0]
            # utamakan siklus di mana HANYA komponen ini yang rusak; jika terlalu sedikit, ambil yang komponen lainnya paling sehat
            idx = singles[:BANK_SIZE] if len(singles) >= 8 else idx[np.argsort(others, kind="stable")][:BANK_SIZE]
            banks[c][str(lv)] = r(X.iloc[idx].to_numpy())
    return {
        "source": source, "features": list(X.columns), "healthy": r(healthy[:BANK_SIZE * 2]), "banks": banks,
        "sensors": {s: {"name": SENSOR_INFO[s][0], "unit": SENSOR_INFO[s][1]} for s in SENSORS},
        "components": {c: {"name": v["name"], "levels": v["levels"], "meaning": {str(k): m for k, m in v["meaning"].items()}}
                       for c, v in COMPONENTS.items()},
    }


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--download", action="store_true")
    g.add_argument("--data", type=str)
    g.add_argument("--demo", action="store_true")
    a = ap.parse_args()

    if a.demo:
        folder = HERE / "data" / "demo_uci_format"
        make_demo_data.make(folder)   # selalu bangkitkan ulang agar deterministik
        source = "demo_synthetic"
    elif a.download:
        folder, source = download_uci(HERE / "data" / "uci"), "uci_real"
    elif a.data:
        folder, source = Path(a.data), "uci_real"
    else:
        ap.error("pilih --download, --data FOLDER, atau --demo")

    t0 = time.time()
    X, Y = load_uci(folder)
    print(f"Dataset: {len(X)} siklus, {X.shape[1]} fitur (sumber: {source})")

    strat = Y["cooler"].astype(str) + "_" + Y["pump"].astype(str)
    idx_tr, idx_te = train_test_split(np.arange(len(X)), test_size=0.25, random_state=SEED, stratify=strat)
    Xtr, Xte, Ytr, Yte = X.iloc[idx_tr], X.iloc[idx_te], Y.iloc[idx_tr], Y.iloc[idx_te]

    metrics = {"source": source, "n_cycles": int(len(X)), "n_train": int(len(Xtr)), "n_test": int(len(Xte)),
               "split": "acak stratifikasi 75/25, seed 42", "components": {}}
    rfs = {}
    for c, spec in COMPONENTS.items():
        rf = RandomForestClassifier(n_estimators=250, class_weight="balanced", n_jobs=-1, random_state=SEED)
        rf.fit(Xtr, Ytr[c])
        pred = rf.predict(Xte)
        rfs[c] = rf
        metrics["components"][c] = {
            "accuracy": round(float(accuracy_score(Yte[c], pred)), 4),
            "macro_f1": round(float(f1_score(Yte[c], pred, average="macro")), 4),
            "classes": [int(v) for v in rf.classes_],
            "confusion_matrix": confusion_matrix(Yte[c], pred, labels=rf.classes_).tolist(),
        }
        print(f"  {c:12s} acc={metrics['components'][c]['accuracy']:.4f} macroF1={metrics['components'][c]['macro_f1']:.4f}")

    # Detektor anomali: hanya siklus sehat.
    htr = healthy_mask(Ytr)
    if htr.sum() < 30:   # jaga-jaga bila dataset punya sangat sedikit siklus sehat sempurna
        deg_tr = sum((Ytr[c].to_numpy() != spec["levels"][0]).astype(int) for c, spec in COMPONENTS.items())
        htr = np.zeros(len(Ytr), dtype=bool)
        htr[np.argsort(deg_tr, kind="stable")[:60]] = True
        print("  peringatan: siklus sehat sempurna < 30, detektor anomali memakai 60 siklus paling sehat")
    iso = make_pipeline(StandardScaler(), IsolationForest(n_estimators=300, random_state=SEED, contamination="auto"))
    iso.fit(Xtr[htr])
    s_h = iso.score_samples(Xtr[htr])
    threshold = float(np.percentile(s_h, 2))   # skor di bawah ambang = anomali
    s_te = iso.score_samples(Xte)
    hte = healthy_mask(Yte)
    if hte.sum() == 0:
        hte = np.zeros(len(Yte), dtype=bool)
    metrics["anomaly"] = {
        "trained_on_healthy_cycles": int(htr.sum()), "threshold": round(threshold, 4),
        "false_alarm_rate_healthy_test": round(float((s_te[hte] < threshold).mean()), 4) if hte.any() else None,
        "detection_rate_faulty_test": round(float((s_te[~hte] < threshold).mean()), 4),
        "n_healthy_test": int(hte.sum()), "n_faulty_test": int((~hte).sum()),
    }
    print("  anomali:", metrics["anomaly"])

    # Evaluasi keputusan gabungan: apakah seluruh tingkat komponen benar pada satu siklus.
    allok = np.ones(len(Xte), dtype=bool)
    for c in COMPONENTS:
        allok &= rfs[c].predict(Xte) == Yte[c].to_numpy()
    metrics["all_components_exact_match"] = round(float(allok.mean()), 4)

    ART.mkdir(exist_ok=True)
    joblib.dump({"features": list(X.columns), "iso": iso, "threshold": threshold, "rfs": rfs, "source": source,
                 "trained_at": time.strftime("%Y-%m-%d %H:%M:%S")}, ART / "model.joblib", compress=3)
    (ART / "metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    prof = build_profiles(Xte, Yte, source, X, Y)
    (ART / "profiles.json").write_text(json.dumps(prof), encoding="utf-8")
    be = HERE.parent / "backend" / "assets"
    if be.exists():
        shutil.copy(ART / "profiles.json", be / "profiles.json")
        shutil.copy(ART / "metrics.json", be / "ml_metrics.json")
        print("Disalin ke", be)
    print(f"Selesai dalam {time.time() - t0:.1f} dtk. Artefak: {ART}")


if __name__ == "__main__":
    main()
