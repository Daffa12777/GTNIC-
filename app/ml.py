"""Model ML: deteksi anomali (IsolationForest) + klasifikasi gangguan (RandomForest).

Fitur per jendela WINDOW pembacaan, per sensor: rata-rata (dinormalisasi terhadap
nilai nominal pompa), standar deviasi, dan kemiringan tren.
"""
import json
import numpy as np
import joblib
from sklearn.ensemble import IsolationForest, RandomForestClassifier
from sklearn.metrics import classification_report, f1_score
from sklearn.model_selection import train_test_split

from .config import MODELS_DIR, WINDOW
from . import simulator as sim

SENSORS = sim.SENSORS
FEATURE_NAMES = [f"{s}_{k}" for s in SENSORS for k in ("mean", "std", "slope")]
MODEL_PATH = MODELS_DIR / "fault_model.joblib"
METRICS_PATH = MODELS_DIR / "metrics.json"

_bundle = None


def window_features(rows: list, nom: dict) -> np.ndarray:
    """rows: list of dict sensor (urut waktu). Mengembalikan vektor fitur."""
    feats = []
    x_idx = np.arange(len(rows))
    for s in SENSORS:
        arr = np.array([r[s] for r in rows], dtype=float) / nom[s]
        slope = np.polyfit(x_idx, arr, 1)[0] if len(arr) > 1 else 0.0
        feats += [arr.mean(), arr.std(), slope * WINDOW]
    return np.array(feats)


def _make_window(nom, fault, s_start, rng):
    rows = []
    for i in range(WINDOW):
        s = 0.0 if fault == "normal" else min(1.0, s_start + 0.06 * i / WINDOW)
        rows.append(sim.generate_reading(nom, fault, s, rng))
    return rows


def build_dataset(n_per_class=700, seed=11):
    rng = np.random.default_rng(seed)
    X, y, pure = [], [], []
    for fault in sim.FAULTS:
        for _ in range(n_per_class):
            scale = rng.uniform(0.94, 1.08, size=5)
            nom = {k: sim.NOMINAL_DEFAULT[k] * scale[i] for i, k in enumerate(SENSORS)}
            s0 = 0.0 if fault == "normal" else rng.uniform(0.12, 1.0)
            rows = _make_window(nom, fault, s0, rng)
            X.append(window_features(rows, nom))
            # severity sangat rendah dianggap belum bergejala (label normal)
            y.append("normal" if (fault != "normal" and s0 < 0.2) else fault)
            pure.append(fault == "normal")  # normal murni, untuk melatih detektor anomali
    return np.array(X), np.array(y), np.array(pure)


def train(save=True):
    X, y, pure = build_dataset()
    idx = np.arange(len(X))
    tr_i, te_i = train_test_split(idx, test_size=0.25, random_state=3, stratify=y)
    X_tr, X_te, y_tr, y_te = X[tr_i], X[te_i], y[tr_i], y[te_i]
    pure_tr, pure_te = pure[tr_i], pure[te_i]
    clf = RandomForestClassifier(n_estimators=250, min_samples_leaf=2, random_state=3, n_jobs=-1)
    clf.fit(X_tr, y_tr)
    pred = clf.predict(X_te)
    macro = float(f1_score(y_te, pred, average="macro"))
    report = classification_report(y_te, pred, output_dict=True, zero_division=0)

    normal_feats = X_tr[pure_tr]
    iso = IsolationForest(n_estimators=200, contamination="auto", random_state=3)
    iso.fit(normal_feats)
    thr = float(np.percentile(iso.decision_function(normal_feats), 0.7))
    anomaly_recall = float(np.mean(iso.decision_function(X_te[y_te != "normal"]) < thr))
    false_alarm = float(np.mean(iso.decision_function(X_te[pure_te]) < thr))

    bundle = {"clf": clf, "iso": iso, "iso_threshold": thr, "classes": list(clf.classes_)}
    metrics = {
        "note": "Dievaluasi pada data simulasi (hold-out 25%), bukan data pabrik nyata.",
        "n_samples": int(len(X)), "macro_f1": round(macro, 4),
        "per_class_f1": {k: round(v["f1-score"], 4) for k, v in report.items() if k in sim.FAULTS},
        "anomaly_recall_on_faults": round(anomaly_recall, 4),
        "anomaly_false_alarm_on_normal": round(false_alarm, 4),
        "window": WINDOW, "features": FEATURE_NAMES,
    }
    if save:
        MODELS_DIR.mkdir(parents=True, exist_ok=True)
        joblib.dump(bundle, MODEL_PATH)
        METRICS_PATH.write_text(json.dumps(metrics, indent=2, ensure_ascii=False))
    return bundle, metrics


def load():
    global _bundle
    if _bundle is None:
        try:
            _bundle = joblib.load(MODEL_PATH)
        except Exception:  # file belum ada atau versi scikit-learn berbeda: latih ulang
            _bundle, _ = train(save=True)
    return _bundle


def metrics():
    if METRICS_PATH.exists():
        return json.loads(METRICS_PATH.read_text())
    return {}


def analyze(rows: list, nom: dict) -> dict:
    """Analisis satu jendela: skor anomali + probabilitas tiap jenis gangguan."""
    b = load()
    if len(rows) < WINDOW:
        return {"ready": False, "reason": f"data belum cukup ({len(rows)}/{WINDOW})"}
    f = window_features(rows[-WINDOW:], nom).reshape(1, -1)
    score = float(b["iso"].decision_function(f)[0])
    proba = b["clf"].predict_proba(f)[0]
    probs = {c: round(float(p), 4) for c, p in zip(b["clf"].classes_, proba)}
    label = max(probs, key=probs.get)
    return {
        "ready": True,
        "anomaly_score": round(score, 4),
        "is_anomaly": bool(score < b["iso_threshold"]),
        "threshold": round(b["iso_threshold"], 4),
        "probs": probs,
        "label": label,
        "confidence": probs[label],
    }
