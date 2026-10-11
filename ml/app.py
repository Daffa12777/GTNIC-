"""Layanan inferensi ML (FastAPI). Dipanggil oleh backend NestJS.

Endpoint:
  GET  /health
  GET  /meta      metadata model + metrik evaluasi
  POST /predict   {"features": {"PS1_mean": 160.2, ...}} -> anomali + tingkat kerusakan tiap komponen
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel

from data import COMPONENTS, severity

HERE = Path(__file__).resolve().parent
ART = Path(os.getenv("ML_ARTIFACTS", HERE / "artifacts"))
API_KEY = os.getenv("ML_API_KEY", "").strip()

app = FastAPI(title="ManualMechanic ML", version="1.0")
_m = None


def model():
    global _m
    if _m is None:
        p = ART / "model.joblib"
        if not p.exists():
            raise HTTPException(503, "model belum dilatih: jalankan python train.py")
        try:
            _m = joblib.load(p)
        except Exception as e:  # versi scikit-learn berbeda dari saat training
            raise HTTPException(503, f"model tidak dapat dimuat ({type(e).__name__}); latih ulang di mesin ini: python train.py --demo atau --download")
    return _m


def auth(x_api_key: str = Header(default="")):
    if API_KEY and x_api_key != API_KEY:
        raise HTTPException(401, "API key salah")


class Req(BaseModel):
    features: dict[str, float]


@app.get("/health")
def health():
    return {"ok": (ART / "model.joblib").exists()}


@app.get("/meta", dependencies=[Depends(auth)])
def meta():
    m = model()
    mt = json.loads((ART / "metrics.json").read_text(encoding="utf-8")) if (ART / "metrics.json").exists() else {}
    return {"source": m["source"], "trained_at": m["trained_at"], "features": m["features"], "metrics": mt}


@app.post("/predict", dependencies=[Depends(auth)])
def predict(req: Req):
    m = model()
    miss = [f for f in m["features"] if f not in req.features]
    if miss:
        raise HTTPException(422, f"fitur hilang: {miss[:5]}")
    x = pd.DataFrame([[req.features[f] for f in m["features"]]], columns=m["features"])
    if not np.isfinite(x.to_numpy()).all():
        raise HTTPException(422, "fitur memuat nilai tidak valid")
    score = float(m["iso"].score_samples(x)[0])
    comps = {}
    for c, rf in m["rfs"].items():
        p = rf.predict_proba(x)[0]
        k = int(np.argmax(p))
        level = int(rf.classes_[k])
        comps[c] = {
            "level": level, "severity": round(severity(c, level), 3), "confidence": round(float(p[k]), 4),
            "probs": {str(int(cl)): round(float(v), 4) for cl, v in zip(rf.classes_, p)},
            "p_degraded": round(float(1 - p[list(rf.classes_).index(COMPONENTS[c]["levels"][0])]), 4),
        }
    return {"anomaly": {"score": round(score, 4), "threshold": round(m["threshold"], 4), "is_anomaly": score < m["threshold"]},
            "components": comps, "source": m["source"]}
