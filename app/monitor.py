"""Monitor: menghitung status tiap pompa per tick dan memicu agent otomatis."""
from . import db, tools, simulator as sim, ml
from .config import WINDOW

STATUS: dict = {}
AUTO = {"enabled": True}


def compute_status(pump_id: str) -> dict:
    rows = sim.recent(pump_id, WINDOW)
    if not rows:
        return {"state": "tidak ada data"}
    latest = rows[-1]
    valid = tools.check_sensor_validity(pump_id)
    if not valid["valid"]:
        return {"state": "sensor", "label": "sensor", "confidence": 0.0, "suspect": valid["suspect_sensors"],
                "latest": {k: latest[k] for k in sim.SENSORS}}
    an = ml.analyze(rows, sim.nominal(pump_id))
    flags = tools.critical_flags(pump_id, latest)
    if not an.get("ready"):
        state, label, conf = "normal", "normal", 1.0
    else:
        label, conf = an["label"], an["confidence"]
        if flags:
            state = "kritis"
        elif (label != "normal" and conf >= 0.6) or (an["is_anomaly"] and an["anomaly_score"] < an["threshold"] * 1.5):
            state = "waspada"
        else:
            state = "normal"
    return {"state": state, "label": label, "confidence": conf,
            "anomaly_score": an.get("anomaly_score"), "is_anomaly": an.get("is_anomaly"),
            "probs": an.get("probs"), "flags": flags, "latest": {k: latest[k] for k in sim.SENSORS}}


def has_open_work(pump_id: str) -> bool:
    wo = db.q("SELECT id FROM work_orders WHERE pump_id=? AND status NOT IN ('selesai','dibatalkan')", (pump_id,), one=True)
    return bool(wo)


def tick():
    """Satu siklus: bangkitkan data, hitung status, picu agent bila perlu."""
    from . import agent
    sim.step_all()
    for p in db.q("SELECT id FROM pumps"):
        pid = p["id"]
        STATUS[pid] = compute_status(pid)
    if not AUTO["enabled"]:
        return
    now = db.now()
    for pid, st in STATUS.items():
        # agent otomatis hanya dipicu bila classifier melihat pola gangguan, ambang kritis, atau sensor bermasalah.
        # Anomali murni tanpa pola tetap tampil sebagai "waspada" di dashboard.
        pattern = st["state"] == "waspada" and st.get("label") not in (None, "normal")
        if not (st["state"] in ("kritis", "sensor") or pattern):
            continue
        if has_open_work(pid) or agent.open_case_for(pid):
            continue
        last = db.q("SELECT created_at FROM cases WHERE pump_id=? ORDER BY created_at DESC", (pid,), one=True)
        if last and now - last["created_at"] < 30:
            continue
        agent.diagnose(pid, trigger="auto")
