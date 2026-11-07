"""Cek overfitting: akurasi latih vs uji, validasi silang 5 lipatan, dan split berurutan.
Jalankan dari folder ml:  python check_overfit.py
"""
import json
from pathlib import Path

import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score
from sklearn.model_selection import StratifiedKFold, train_test_split

from data import COMPONENTS, load_uci

HERE = Path(__file__).resolve().parent
SEED = 42

def rf():
    return RandomForestClassifier(n_estimators=250, class_weight="balanced", n_jobs=-1, random_state=SEED)

X, Y = load_uci(HERE / "data" / "uci")
print(f"Dataset: {len(X)} siklus, {X.shape[1]} fitur\n")

# Sama seperti train.py: split acak stratifikasi 75/25
strat = Y["cooler"].astype(str) + "_" + Y["pump"].astype(str)
tr, te = train_test_split(np.arange(len(X)), test_size=0.25, random_state=SEED, stratify=strat)

# Split berurutan: 75% siklus awal untuk latih, 25% siklus akhir untuk uji
cut = int(len(X) * 0.75)
btr, bte = np.arange(cut), np.arange(cut, len(X))

skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=SEED)
result = {}
print(f"{'komponen':12s} {'latih':>7s} {'uji acak':>9s} {'CV5 rata2':>10s} {'CV5 sd':>7s} {'uji berurutan':>14s}")
for c in COMPONENTS:
    y = Y[c]
    m = rf().fit(X.iloc[tr], y.iloc[tr])
    a_tr = accuracy_score(y.iloc[tr], m.predict(X.iloc[tr]))
    a_te = accuracy_score(y.iloc[te], m.predict(X.iloc[te]))
    cv = []
    for a, b in skf.split(X, y):
        cv.append(accuracy_score(y.iloc[b], rf().fit(X.iloc[a], y.iloc[a]).predict(X.iloc[b])))
    mb = rf().fit(X.iloc[btr], y.iloc[btr])
    a_bl = accuracy_score(y.iloc[bte], mb.predict(X.iloc[bte]))
    result[c] = {"akurasi_latih": round(a_tr, 4), "akurasi_uji_acak": round(a_te, 4),
                 "cv5_rata2": round(float(np.mean(cv)), 4), "cv5_sd": round(float(np.std(cv)), 4),
                 "akurasi_uji_berurutan": round(a_bl, 4)}
    print(f"{c:12s} {a_tr:7.4f} {a_te:9.4f} {np.mean(cv):10.4f} {np.std(cv):7.4f} {a_bl:14.4f}")

out = HERE / "artifacts" / "overfit_check.json"
out.write_text(json.dumps(result, indent=2), encoding="utf-8")
print(f"\nDisimpan ke {out}")