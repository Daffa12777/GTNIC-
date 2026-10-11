"""Tool yang dapat dipanggil agent. Semua tool memvalidasi input dan mengembalikan dict.

Guardrail keselamatan berlaku di lapisan tool, sehingga tetap berlaku walaupun
keputusan datang dari LLM: tindakan berisiko tinggi tanpa persetujuan ditolak.
"""
import datetime as dt
import httpx

from . import db, ml, rag, simulator as sim
from .config import TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, WINDOW

FAULT_PART = {
    "bearing": "Bearing 6309",
    "impeller": "Impeller CP-150",
    "cavitation": "Strainer sisi hisap",
    "overload": "Overload relay",
}
FAULT_SKILL = {"bearing": "mekanik", "impeller": "mekanik", "cavitation": "mekanik", "overload": "listrik"}
FAULT_LABEL = {
    "normal": "Normal", "bearing": "Bearing aus / kurang pelumas", "impeller": "Impeller aus / tersumbat",
    "cavitation": "Kavitasi", "overload": "Overload motor",
}
FAULT_QUERY = {
    "bearing": "bearing aus kurang pelumas getaran naik suhu bearing naik",
    "impeller": "impeller aus tersumbat tekanan turun debit turun arus naik",
    "cavitation": "kavitasi getaran acak tekanan tidak stabil suara kerikil",
    "overload": "overload motor arus naik suhu motor naik",
}


# ---------------------------------------------------------------- sensor & ML
def get_pump(pump_id: str):
    return db.q("SELECT * FROM pumps WHERE id=?", (pump_id,), one=True)


def get_sensor_data(pump_id: str, window: int = WINDOW) -> dict:
    if not get_pump(pump_id):
        return {"error": f"pompa tidak ditemukan: {pump_id}"}
    window = max(1, min(int(window), 300))
    rows = sim.recent(pump_id, window)
    if not rows:
        return {"error": "belum ada data sensor"}
    last = rows[-1]
    nom = sim.nominal(pump_id)
    return {
        "pump_id": pump_id, "n": len(rows), "latest": {k: last[k] for k in sim.SENSORS},
        "nominal": nom,
        "mean": {k: round(sum(r[k] for r in rows) / len(rows), 3) for k in sim.SENSORS},
        "rows": rows,
    }


def check_sensor_validity(pump_id: str) -> dict:
    rows = sim.recent(pump_id, 5)
    bad = []
    if rows:
        for k in sim.SENSORS:
            vals = [r[k] for r in rows]
            if any(v is None for v in vals) or all(v == 0 for v in vals):
                bad.append(k)
    return {"valid": not bad, "suspect_sensors": bad}


def analyze_pump(pump_id: str) -> dict:
    if not get_pump(pump_id):
        return {"error": f"pompa tidak ditemukan: {pump_id}"}
    rows = sim.recent(pump_id, WINDOW)
    res = ml.analyze(rows, sim.nominal(pump_id))
    res["pump_id"] = pump_id
    return res


def detect_anomaly(pump_id: str) -> dict:
    r = analyze_pump(pump_id)
    if "error" in r or not r.get("ready"):
        return r
    return {"pump_id": pump_id, "is_anomaly": r["is_anomaly"], "anomaly_score": r["anomaly_score"], "threshold": r["threshold"]}


def classify_fault(pump_id: str) -> dict:
    r = analyze_pump(pump_id)
    if "error" in r or not r.get("ready"):
        return r
    return {"pump_id": pump_id, "label": r["label"], "confidence": r["confidence"], "probs": r["probs"]}


def critical_flags(pump_id: str, latest: dict) -> list:
    nom = sim.nominal(pump_id)
    flags = []
    if latest["vibration"] >= 7.1: flags.append("getaran >= 7,1 mm/s")
    if latest["bearing_temp"] >= 85: flags.append("suhu >= 85 C")
    if latest["current"] >= nom["current"] * 1.30: flags.append("arus >= 130% nominal")
    if latest["pressure"] <= nom["pressure"] * 0.65: flags.append("tekanan <= 65% nominal")
    return flags


# ---------------------------------------------------------------- RAG
def search_manual(query: str, k: int = 3) -> dict:
    if not query or not query.strip():
        return {"error": "query kosong"}
    hits = rag.search(query, k=k, kind="manual")
    return {"query": query, "results": hits}


def search_history(pump_id: str | None = None, fault: str | None = None, days: int = 365) -> dict:
    cutoff = db.now() - days * 86400
    sql, params = "SELECT * FROM case_history WHERE ts >= ?", [cutoff]
    if pump_id:
        sql += " AND pump_id=?"; params.append(pump_id)
    if fault:
        sql += " AND fault=?"; params.append(fault)
    rows = db.q(sql + " ORDER BY ts DESC", tuple(params))
    return {"pump_id": pump_id, "fault": fault, "cases": rows}


# ---------------------------------------------------------------- inventory
def check_inventory(part_name: str) -> dict:
    if not part_name:
        return {"error": "nama part kosong"}
    row = db.q("SELECT * FROM inventory WHERE LOWER(name) LIKE ?", (f"%{part_name.lower()}%",), one=True)
    if not row:
        return {"found": False, "part_name": part_name}
    return {"found": True, "part_id": row["part_id"], "name": row["name"], "stock": row["stock"],
            "available": row["stock"] > 0, "location": row["location"]}


def create_purchase_request(part_name: str, qty: int, reason: str, work_order_id: str = "") -> dict:
    if qty < 1 or qty > 50:
        return {"error": "qty harus 1-50"}
    pid = db.next_id("PR", "purchase_requests")
    db.x("INSERT INTO purchase_requests VALUES (?,?,?,?,?,?,?)",
         (pid, part_name, int(qty), reason, work_order_id, "menunggu persetujuan", db.now()))
    return {"id": pid, "part_name": part_name, "qty": qty, "status": "menunggu persetujuan"}


# ---------------------------------------------------------------- work order
def create_work_order(pump_id: str, title: str, description: str, priority: str, part: str = "",
                      case_id: str = "", risk: str = "sedang", approved: bool = False) -> dict:
    if not get_pump(pump_id):
        return {"error": f"pompa tidak ditemukan: {pump_id}"}
    if priority not in ("rendah", "sedang", "tinggi"):
        return {"error": "priority harus rendah|sedang|tinggi"}
    if not title or not description:
        return {"error": "title dan description wajib"}
    if risk == "tinggi" and not approved:
        return {"error": "tindakan berisiko tinggi membutuhkan persetujuan manusia", "requires_approval": True}
    dup = db.q("SELECT id FROM work_orders WHERE pump_id=? AND status NOT IN ('selesai','dibatalkan') AND title=?",
               (pump_id, title), one=True)
    if dup:
        return {"id": dup["id"], "duplicate": True, "note": "work order serupa masih terbuka"}
    wid = db.next_id("WO", "work_orders")
    db.x("INSERT INTO work_orders VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
         (wid, pump_id, case_id, title, description, priority, "terbuka", None, None, part, db.now(), None))
    return {"id": wid, "pump_id": pump_id, "priority": priority, "status": "terbuka"}


def schedule_technician(work_order_id: str, skill: str, senior: bool = False) -> dict:
    wo = db.q("SELECT * FROM work_orders WHERE id=?", (work_order_id,), one=True)
    if not wo:
        return {"error": f"work order tidak ditemukan: {work_order_id}"}
    sql = "SELECT * FROM technicians WHERE available=1 AND skill=?"
    params = [skill]
    techs = db.q(sql, tuple(params))
    if senior:
        techs = [t for t in techs if t["level"] == "senior"] or db.q(
            "SELECT * FROM technicians WHERE available=1 AND level='senior'")
    if not techs:
        return {"error": "tidak ada teknisi tersedia", "scheduled": False}
    tech = techs[0]
    base = dt.datetime.now()
    if wo["priority"] == "tinggi":
        when = base + dt.timedelta(hours=2)
    elif wo["priority"] == "sedang":
        when = (base + dt.timedelta(days=1)).replace(hour=8, minute=0, second=0, microsecond=0)
    else:
        when = (base + dt.timedelta(days=2)).replace(hour=8, minute=0, second=0, microsecond=0)
    when_s = when.strftime("%Y-%m-%d %H:%M")
    db.x("UPDATE work_orders SET technician_id=?, scheduled_at=?, status='terjadwal' WHERE id=?",
         (tech["id"], when_s, work_order_id))
    db.x("UPDATE technicians SET available=0 WHERE id=?", (tech["id"],))
    return {"scheduled": True, "technician": tech["name"], "technician_id": tech["id"],
            "contact": tech["contact"], "scheduled_at": when_s}


# ---------------------------------------------------------------- notifikasi
def send_notification(recipient: str, message: str, channel: str = "telegram") -> dict:
    if not message:
        return {"error": "pesan kosong"}
    status, detail = "disimulasikan", "Telegram belum dikonfigurasi; pesan hanya dicatat."
    if channel == "telegram" and TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID:
        try:
            r = httpx.post(
                f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
                json={"chat_id": TELEGRAM_CHAT_ID, "text": f"[{recipient}] {message}"}, timeout=8,
            )
            if r.status_code == 200:
                status, detail = "terkirim", "Terkirim melalui Telegram Bot API."
            else:
                status, detail = "gagal", f"Telegram HTTP {r.status_code}"
        except Exception as e:  # jaringan, DNS, timeout
            status, detail = "gagal", f"{type(e).__name__}: {e}"
    nid = db.x("INSERT INTO notifications (ts, recipient, channel, message, status, detail) VALUES (?,?,?,?,?,?)",
               (db.now(), recipient, channel, message, status, detail))
    return {"id": nid, "recipient": recipient, "status": status, "detail": detail}


def escalate_to_senior(pump_id: str, summary: str, case_id: str = "") -> dict:
    wo = create_work_order(pump_id, f"Eskalasi diagnosis {pump_id}", summary, "tinggi",
                           case_id=case_id, risk="sedang")
    sched = schedule_technician(wo["id"], "mekanik", senior=True) if "id" in wo else {}
    tech = sched.get("technician", "supervisor")
    n = send_notification(tech, f"ESKALASI {pump_id}: {summary}")
    return {"work_order": wo, "schedule": sched, "notification": n}


# ---------------------------------------------------------------- riwayat
def save_case_history(pump_id: str, symptoms: str, fault: str, root_cause: str, action: str,
                      duration_min: float = 0.0) -> dict:
    hid = db.next_id("H", "case_history")
    db.x("INSERT INTO case_history VALUES (?,?,?,?,?,?,?,?)",
         (hid, pump_id, db.now(), symptoms, fault, root_cause, action, duration_min))
    rag.build_index()
    return {"id": hid, "saved": True}


# ---------------------------------------------------------------- registri untuk LLM
def _obj(props: dict, required: list):
    return {"type": "OBJECT", "properties": props, "required": required}

S, I, B = {"type": "STRING"}, {"type": "INTEGER"}, {"type": "BOOLEAN"}

TOOL_SPECS = [
    ("get_sensor_data", "Ambil data sensor terbaru sebuah pompa (getaran, suhu bearing, tekanan, arus, debit).",
     _obj({"pump_id": S, "window": I}, ["pump_id"])),
    ("check_sensor_validity", "Cek apakah sensor pompa mengirim data valid (bukan nol/hilang).",
     _obj({"pump_id": S}, ["pump_id"])),
    ("detect_anomaly", "Jalankan model deteksi anomali pada jendela data terbaru pompa.",
     _obj({"pump_id": S}, ["pump_id"])),
    ("classify_fault", "Klasifikasi jenis gangguan (normal/bearing/impeller/cavitation/overload) beserta probabilitas.",
     _obj({"pump_id": S}, ["pump_id"])),
    ("search_manual", "Cari manual dan panduan perawatan (RAG) dan kembalikan potongan dengan sitasi.",
     _obj({"query": S}, ["query"])),
    ("search_history", "Cari riwayat perbaikan untuk pompa dan/atau jenis gangguan tertentu.",
     _obj({"pump_id": S, "fault": S}, [])),
    ("check_inventory", "Cek stok spare part berdasarkan nama.", _obj({"part_name": S}, ["part_name"])),
    ("create_purchase_request", "Buat permintaan pembelian part.",
     _obj({"part_name": S, "qty": I, "reason": S, "work_order_id": S}, ["part_name", "qty", "reason"])),
    ("create_work_order", "Buat work order. Risiko 'tinggi' ditolak kecuali sudah disetujui manusia.",
     _obj({"pump_id": S, "title": S, "description": S, "priority": S, "part": S, "risk": S},
          ["pump_id", "title", "description", "priority", "risk"])),
    ("schedule_technician", "Jadwalkan teknisi untuk work order. skill: mekanik atau listrik.",
     _obj({"work_order_id": S, "skill": S, "senior": B}, ["work_order_id", "skill"])),
    ("send_notification", "Kirim notifikasi ke teknisi atau supervisor.",
     _obj({"recipient": S, "message": S}, ["recipient", "message"])),
    ("escalate_to_senior", "Eskalasi kasus ke teknisi senior dengan ringkasan.",
     _obj({"pump_id": S, "summary": S}, ["pump_id", "summary"])),
]

REGISTRY = {
    "get_sensor_data": get_sensor_data, "check_sensor_validity": check_sensor_validity,
    "detect_anomaly": detect_anomaly, "classify_fault": classify_fault,
    "search_manual": search_manual, "search_history": search_history,
    "check_inventory": check_inventory, "create_purchase_request": create_purchase_request,
    "create_work_order": create_work_order, "schedule_technician": schedule_technician,
    "send_notification": send_notification, "escalate_to_senior": escalate_to_senior,
}


def call_tool(name: str, args: dict) -> dict:
    fn = REGISTRY.get(name)
    if not fn:
        return {"error": f"tool tidak dikenal: {name}"}
    try:
        res = fn(**(args or {}))
    except TypeError as e:
        return {"error": f"parameter tidak valid: {e}"}
    except Exception as e:
        return {"error": f"{type(e).__name__}: {e}"}
    if name == "get_sensor_data" and isinstance(res, dict):
        res = {k: v for k, v in res.items() if k != "rows"}  # ringkas untuk LLM/log
    return res
