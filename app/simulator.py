"""Simulator data sensor pompa sentrifugal.

Setiap pompa memiliki kondisi (fault + severity 0..1). Severity naik bertahap
setiap tick sehingga gejala berkembang perlahan seperti kondisi nyata.
"""
import threading
import numpy as np

from . import db

SENSORS = ["vibration", "bearing_temp", "pressure", "current", "flow"]
FAULTS = ["normal", "bearing", "impeller", "cavitation", "overload"]
NOISE = {"vibration": 0.12, "bearing_temp": 0.6, "pressure": 0.05, "current": 0.35, "flow": 1.2}
NOMINAL_DEFAULT = {"vibration": 2.5, "bearing_temp": 55.0, "pressure": 4.5, "current": 18.0, "flow": 120.0}

_rng = np.random.default_rng(7)
_lock = threading.Lock()
STATE: dict = {}   # pump_id -> {"fault", "severity", "rate", "dropout"}
_NOMINALS: dict = {}


def generate_reading(nom: dict, fault: str, s: float, rng=None) -> dict:
    """Satu pembacaan sensor untuk kondisi (fault, severity s)."""
    rng = rng or _rng
    v, t, p, c, f = (nom[k] for k in SENSORS)
    n = {k: rng.normal(0, NOISE[k]) for k in SENSORS}
    if fault == "bearing":
        v = v * (1 + 2.2 * s); t = t + 32 * s; c = c * (1 + 0.04 * s); p = p * (1 - 0.02 * s)
    elif fault == "impeller":
        p = p * (1 - 0.38 * s); f = f * (1 - 0.35 * s); c = c * (1 + 0.18 * s)
        v = v * (1 + 0.15 * s); t = t + 4 * s
    elif fault == "cavitation":
        v = v * (1 + 0.9 * s); p = p * (1 - 0.15 * s); f = f * (1 - 0.12 * s); t = t + 3 * s
        n["vibration"] += rng.normal(0, 0.9 * s)
        n["pressure"] += rng.normal(0, 0.35 * s)
        n["flow"] += rng.normal(0, 5.0 * s)
        n["current"] += rng.normal(0, 1.2 * s)
    elif fault == "overload":
        c = c * (1 + 0.45 * s); t = t + 22 * s; v = v * (1 + 0.2 * s)
    out = {
        "vibration": max(0.0, v + n["vibration"]),
        "bearing_temp": t + n["bearing_temp"],
        "pressure": max(0.0, p + n["pressure"]),
        "current": max(0.0, c + n["current"]),
        "flow": max(0.0, f + n["flow"]),
    }
    return {k: round(float(val), 3) for k, val in out.items()}


def load_nominals():
    for p in db.q("SELECT * FROM pumps"):
        _NOMINALS[p["id"]] = {
            "vibration": p["nom_vibration"], "bearing_temp": p["nom_temp"],
            "pressure": p["nom_pressure"], "current": p["nom_current"], "flow": p["nom_flow"],
        }


def nominal(pump_id: str) -> dict:
    return _NOMINALS.get(pump_id, NOMINAL_DEFAULT)


def _insert(pump_id: str, reading: dict, ts: float):
    db.x(
        "INSERT INTO sensor_readings (pump_id, ts, vibration, bearing_temp, pressure, current, flow) VALUES (?,?,?,?,?,?,?)",
        (pump_id, ts, *(reading[k] for k in SENSORS)),
    )


def init_state():
    """Kondisi awal demo: Pump-02 bearing berkembang, Pump-03 impeller berkembang lambat."""
    load_nominals()
    STATE.clear()
    for pid in _NOMINALS:
        STATE[pid] = {"fault": "normal", "severity": 0.0, "rate": 0.0, "dropout": False}


def start_scenario():
    """Mulai skenario demo setelah riwayat normal terisi."""
    STATE["Pump-02"].update(fault="bearing", severity=0.0, rate=0.008)
    STATE["Pump-03"].update(fault="impeller", severity=0.0, rate=0.004)


def seed_history(n=90, interval=2.0):
    """Isi riwayat awal agar grafik langsung terisi."""
    import time
    if db.q("SELECT COUNT(*) AS n FROM sensor_readings", one=True)["n"]:
        return
    t0 = time.time() - n * interval
    with _lock:
        for i in range(n):
            for pid in list(STATE):
                _advance_one(pid, ts=t0 + i * interval)


def _advance_one(pid: str, ts: float):
    st = STATE[pid]
    if st["rate"] and st["fault"] != "normal":
        st["severity"] = min(1.0, st["severity"] + st["rate"])
    r = generate_reading(nominal(pid), st["fault"], st["severity"])
    if st.get("dropout"):
        r["vibration"] = 0.0
    _insert(pid, r, ts)
    return r


def step_all(ts=None):
    import time
    ts = ts or time.time()
    with _lock:
        for pid in list(STATE):
            _advance_one(pid, ts)
    # pangkas data lama
    for pid in list(STATE):
        db.x("DELETE FROM sensor_readings WHERE pump_id=? AND id < (SELECT MAX(id) FROM sensor_readings WHERE pump_id=?) - 800", (pid, pid))


def advance(pump_id: str, ticks: int):
    import time
    with _lock:
        for i in range(max(1, ticks)):
            _advance_one(pump_id, time.time() + i * 0.001)


def inject(pump_id: str, fault: str, severity: float = 0.3, rate: float = 0.01):
    if pump_id not in STATE:
        raise KeyError(pump_id)
    with _lock:
        st = STATE[pump_id]
        if fault == "sensor_error":
            st["dropout"] = True
            return st
        st["dropout"] = False
        if fault not in FAULTS:
            raise ValueError(f"fault tidak dikenal: {fault}")
        st.update(fault=fault, severity=0.0 if fault == "normal" else float(severity),
                  rate=0.0 if fault == "normal" else float(rate))
        return st


def reset_pump(pump_id: str):
    with _lock:
        STATE[pump_id].update(fault="normal", severity=0.0, rate=0.0, dropout=False)


def recent(pump_id: str, n: int):
    rows = db.q("SELECT * FROM sensor_readings WHERE pump_id=? ORDER BY id DESC LIMIT ?", (pump_id, n))
    return list(reversed(rows))
