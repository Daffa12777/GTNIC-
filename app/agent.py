"""Agent ManualMechanic (mode "policy": perencana deterministik dengan guardrail).

Alur: sensor -> validasi -> ML (anomali + klasifikasi) -> bukti dari teknisi -> riwayat
-> RAG -> keputusan berbasis keyakinan dan risiko -> eksekusi tool berantai
(stok, work order, pembelian, jadwal, notifikasi) atau tanya balik / minta
persetujuan / eskalasi. Mode "llm" (Gemini function calling) ada di llm.py.
"""
import json
import re
import time

from . import db, tools, simulator as sim
from .config import CONF_ACT, CONF_CONFIRM, GEMINI_API_KEY
from .tools import FAULT_LABEL, FAULT_PART, FAULT_QUERY, FAULT_SKILL

OPEN_STATUSES = ("menunggu_klarifikasi", "menunggu_persetujuan")

KEYWORDS = {
    "cavitation": ["kerikil", "kelereng", "berderak", "kavitasi", "strainer tersumbat", "katup hisap", "level tangki rendah", "suara pecah"],
    "bearing": ["menggeram", "gemuruh", "bearing", "pelumas", "grease", "rumah bearing panas", "berdengung"],
    "impeller": ["debit kecil", "debit turun", "aliran kecil", "aliran berkurang", "kotoran", "sampah", "impeller", "tersumbat"],
    "overload": ["trip", "bau terbakar", "motor panas", "tegangan", "overload", "ampere", "arus tinggi"],
}
NEGATORS = ("tidak", "tdk", "nggak", "gak", "ga", "bukan", "belum", "tanpa")

QUESTION = {
    "bearing": "apakah terdengar suara menggeram atau gemuruh dari rumah bearing, dan apakah rumah bearing terasa jauh lebih panas?",
    "cavitation": "apakah terdengar bunyi seperti kerikil atau berderak di dalam pompa, dan bagaimana kondisi strainer serta katup sisi hisap?",
    "impeller": "apakah debit keluaran terlihat berkurang, atau pernah ada kotoran atau sampah di saluran hisap?",
    "overload": "apakah motor terasa sangat panas, pernah trip, atau tegangan suplai terlihat tidak stabil?",
    "normal": "apakah ada gejala yang terlihat atau terdengar langsung di pompa ini?",
}


# ------------------------------------------------------------------ util
def _short(tool, res):
    if not isinstance(res, dict):
        return str(res)[:120]
    if "error" in res:
        return f"galat: {res['error']}"
    try:
        if tool == "get_sensor_data":
            l = res["latest"]
            return f"getaran {l['vibration']} mm/s, suhu {l['bearing_temp']} C, tekanan {l['pressure']} bar, arus {l['current']} A, debit {l['flow']} m3/jam"
        if tool == "check_sensor_validity":
            return "semua sensor valid" if res["valid"] else f"sensor mencurigakan: {', '.join(res['suspect_sensors'])}"
        if tool == "detect_anomaly":
            return f"{'ANOMALI' if res['is_anomaly'] else 'normal'} (skor {res['anomaly_score']}, ambang {res['threshold']})"
        if tool == "classify_fault":
            top = sorted(res["probs"].items(), key=lambda kv: -kv[1])[:3]
            return ", ".join(f"{FAULT_LABEL[k]} {v*100:.0f}%" for k, v in top)
        if tool == "search_manual":
            return "; ".join(f"{h['citation']} (skor {h['score']})" for h in res["results"][:2]) or "tidak ada hasil"
        if tool == "search_history":
            return f"{len(res['cases'])} kasus serupa"
        if tool == "check_inventory":
            return f"{res['name']}: stok {res['stock']}" if res.get("found") else "part tidak ditemukan"
        if tool == "create_work_order":
            return res.get("id", "") + (" (sudah ada)" if res.get("duplicate") else f" prioritas {res.get('priority')}")
        if tool == "schedule_technician":
            return f"{res['technician']} pada {res['scheduled_at']}" if res.get("scheduled") else "teknisi belum tersedia"
        if tool == "send_notification":
            return f"{res['recipient']}: {res['status']}"
        if tool == "create_purchase_request":
            return f"{res['id']} {res['part_name']} x{res['qty']}"
    except Exception:
        pass
    return json.dumps(res, ensure_ascii=False, default=str)[:140]


class Trace:
    def __init__(self, case_id, items=None):
        self.case_id = case_id
        self.items = items or []

    def add(self, kind, title, detail="", tool=None, args=None, result=None):
        item = {"n": len(self.items) + 1, "kind": kind, "title": title, "detail": detail,
                "tool": tool, "args": args, "ts": time.time()}
        if result is not None:
            item["result"] = _short(tool, result) if tool else str(result)
        self.items.append(item)
        return item

    def tool(self, name, **args):
        res = tools.call_tool(name, args)
        short = _short(name, res)
        self.add("tool", f"Memanggil {name}", short, tool=name, args=args, result=res)
        db.x("INSERT INTO agent_logs (ts, case_id, step, tool, input, output) VALUES (?,?,?,?,?,?)",
             (db.now(), self.case_id, f"step{len(self.items)}", name, db.dumps(args), db.dumps(res)[:2000]))
        return res


def apply_evidence(probs: dict, text: str):
    """Sesuaikan probabilitas berdasarkan kata kunci dari teknisi (dengan negasi sederhana)."""
    if not text:
        return probs, []
    t = text.lower()
    tokens = re.findall(r"[a-z0-9]+", t)
    notes, p = [], dict(probs)
    for fault, words in KEYWORDS.items():
        for w in words:
            idx = t.find(w)
            if idx < 0:
                continue
            before = re.findall(r"[a-z0-9]+", t[max(0, idx - 28):idx])[-3:]
            neg = any(b in NEGATORS for b in before)
            if neg:
                p[fault] = p.get(fault, 0) * 0.35
                notes.append(f"'{w}' dinegasikan, menurunkan {FAULT_LABEL[fault]}")
            else:
                p[fault] = p.get(fault, 0) * 3.0 + 0.02
                notes.append(f"'{w}' mendukung {FAULT_LABEL[fault]}")
            break
    s = sum(p.values()) or 1.0
    return {k: round(v / s, 4) for k, v in p.items()}, notes


def assess_risk(label, latest, flags, nom):
    if flags:
        return "tinggi"
    if label == "overload":
        return "tinggi" if (latest["current"] >= nom["current"] * 1.25 or latest["bearing_temp"] >= 80) else "sedang"
    if label == "bearing":
        return "sedang" if (latest["vibration"] >= 5 or latest["bearing_temp"] >= 70) else "rendah"
    if label == "impeller":
        return "sedang" if latest["pressure"] <= nom["pressure"] * 0.80 else "rendah"
    return "sedang"


# ------------------------------------------------------------------ case persistence
def _save_case(case_id, trace, status, state, fault=None, conf=None, risk=None, summary=None, mode="policy"):
    now = db.now()
    exists = db.q("SELECT id FROM cases WHERE id=?", (case_id,), one=True)
    if not exists:
        db.x("INSERT INTO cases VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
             (case_id, state.get("pump_id"), status, fault, conf, risk, summary,
              db.dumps(trace.items), db.dumps(state), now, now, mode))
    else:
        db.x("UPDATE cases SET status=?, fault=?, confidence=?, risk=?, summary=?, trace=?, state=?, updated_at=? WHERE id=?",
             (status, fault, conf, risk, summary, db.dumps(trace.items), db.dumps(state), now, case_id))


def get_case(case_id):
    c = db.q("SELECT * FROM cases WHERE id=?", (case_id,), one=True)
    if not c:
        return None
    c["trace"] = json.loads(c["trace"] or "[]")
    c["state"] = json.loads(c["state"] or "{}")
    st = c["state"]
    c["question"] = st.get("question") if c["status"] == "menunggu_klarifikasi" else None
    c["plan"] = st.get("plan") if c["status"] == "menunggu_persetujuan" else None
    c["probs"] = st.get("probs")
    return c


def list_cases(limit=30):
    rows = db.q("SELECT id, pump_id, status, fault, confidence, risk, summary, created_at, mode FROM cases ORDER BY created_at DESC LIMIT ?", (limit,))
    return rows


def open_case_for(pump_id):
    return db.q("SELECT id FROM cases WHERE pump_id=? AND status IN ('menunggu_klarifikasi','menunggu_persetujuan') ORDER BY created_at DESC",
                (pump_id,), one=True)


# ------------------------------------------------------------------ eksekusi rencana
def _execute_plan(case_id, trace, state, approved=False):
    plan = state["plan"]
    pump_id, label, risk = state["pump_id"], plan["fault"], plan["risk"]
    part = FAULT_PART.get(label, "")
    inv = trace.tool("check_inventory", part_name=part) if part else {"found": False}
    in_stock = bool(inv.get("available"))
    desc = (f"Diagnosis agent: {FAULT_LABEL[label]} (keyakinan {plan['confidence']*100:.0f}%). "
            f"Dasar: {plan['citation']}. {plan['advice']}")
    if part and not in_stock:
        desc += f" Stok {part} kosong: lakukan tindakan sementara yang aman dan tunggu pengadaan."
    pr = {"low": "rendah"}.get(risk, risk)
    wo = trace.tool("create_work_order", pump_id=pump_id, title=f"{FAULT_LABEL[label]} pada {pump_id}",
                    description=desc, priority=pr, part=part, case_id=case_id, risk=risk, approved=approved)
    wid = wo.get("id")
    result = {"work_order": wid, "purchase_request": None, "technician": None, "notified": None}
    if not wid:
        trace.add("decision", "Tindakan tidak dapat dijalankan", wo.get("error", "work order gagal dibuat"))
        return result, False
    if part and not in_stock:
        pr_res = trace.tool("create_purchase_request", part_name=part, qty=1,
                            reason=f"Dibutuhkan untuk {wid} ({FAULT_LABEL[label]} pada {pump_id})", work_order_id=wid)
        result["purchase_request"] = pr_res.get("id")
    sched = trace.tool("schedule_technician", work_order_id=wid, skill=FAULT_SKILL.get(label, "mekanik"),
                       senior=(risk == "tinggi"))
    if not sched.get("scheduled"):
        trace.add("decision", "Teknisi belum tersedia", "Work order tetap terbuka dan masuk antrean; supervisor diberi tahu.")
        n = trace.tool("send_notification", recipient="Dewi Anggraini",
                       message=f"{wid} untuk {pump_id} ({FAULT_LABEL[label]}) belum punya teknisi tersedia. Mohon alokasikan.")
        result["notified"] = n.get("status")
        return result, True
    result["technician"] = sched["technician"]
    msg = (f"{wid} {pump_id}: {FAULT_LABEL[label]} (risiko {risk}). Jadwal {sched['scheduled_at']}. "
           f"Part {part or '-'}: {'tersedia' if in_stock else 'KOSONG, pembelian diajukan'}. Dasar: {plan['citation']}.")
    n = trace.tool("send_notification", recipient=sched["technician"], message=msg)
    result["notified"] = n.get("status")
    return result, True


def _summary_after(state, result):
    p = state["plan"]
    acts = []
    if result.get("work_order"):
        acts.append(f"{result['work_order']} dibuat")
    if result.get("technician"):
        acts.append(f"teknisi {result['technician']} dijadwalkan")
    if result.get("purchase_request"):
        acts.append(f"{result['purchase_request']} diajukan karena stok kosong")
    if result.get("notified"):
        acts.append(f"notifikasi {result['notified']}")
    head = f"Diagnosis: {FAULT_LABEL[p['fault']]} (keyakinan {p['confidence']*100:.0f}%), risiko {p['risk']}."
    body = (" Tindakan: " + ", ".join(acts) + ".") if acts else ""
    return f"{head}{body} Dasar: {p['citation']}."


# ------------------------------------------------------------------ keputusan
def _decide(case_id, trace, state, mode="policy"):
    """Putuskan tindakan dari state (probs, risk). Mengembalikan (status, summary)."""
    probs = state["probs"]
    ranked = sorted(probs.items(), key=lambda kv: -kv[1])
    label, conf = ranked[0]
    second = ranked[1]
    risk = state["risk"]
    pump_id = state["pump_id"]
    trace.add("reasoning", "Penalaran gabungan",
              f"Hipotesis teratas: {FAULT_LABEL[label]} ({conf*100:.0f}%), berikutnya {FAULT_LABEL[second[0]]} ({second[1]*100:.0f}%). "
              f"Risiko dinilai {risk}. Ambang eksekusi otomatis {CONF_ACT*100:.0f}%, ambang eskalasi {CONF_CONFIRM*100:.0f}%.")

    if label == "normal":
        # sinyal awal lemah: belum cukup untuk bertindak, jangan eskalasi berlebihan
        best, pf = next((k, v) for k, v in ranked if k != "normal")
        if pf >= 0.15 and not state.get("clarified"):
            q = (f"Pembacaan masih mendekati normal, tetapi ada sinyal awal {FAULT_LABEL[best]} ({pf*100:.0f}%). "
                 f"Mohon bantu konfirmasi di lapangan: {QUESTION[best]}")
            state["question"] = q
            trace.add("decision", "Tanya balik ke teknisi", q)
            return "menunggu_klarifikasi", "Sinyal awal belum cukup kuat. Agent menunggu konfirmasi lapangan sebelum bertindak."
        summary = "Sinyal awal masih lemah dan belum cukup untuk tindakan. Agent terus memantau dan akan menganalisis ulang bila pola menguat."
        trace.add("decision", "Dipantau, belum bertindak", summary)
        state["plan"] = None
        return "dipantau", summary

    if conf < CONF_CONFIRM:
        summary = (f"Keyakinan {conf*100:.0f}% di bawah ambang eskalasi. "
                   f"Kasus dieskalasi ke teknisi senior dengan ringkasan data.")
        trace.add("decision", "Eskalasi ke teknisi senior", summary)
        trace.tool("escalate_to_senior", pump_id=pump_id,
                   summary=f"Anomali pada {pump_id}, hipotesis: " + ", ".join(f"{FAULT_LABEL[k]} {v*100:.0f}%" for k, v in ranked[:3]) + ". Perlu inspeksi langsung.")
        state["plan"] = None
        return "dieskalasi", summary

    cites = state.get("citations") or []
    plan = {
        "fault": label, "confidence": conf, "risk": risk,
        "citation": cites[0] if cites else "belum ada sitasi",
        "advice": state.get("advice", ""),
    }
    state["plan"] = plan

    if conf >= CONF_ACT and risk != "tinggi":
        trace.add("decision", "Eksekusi otomatis",
                  "Keyakinan tinggi dan risiko tidak tinggi, agent menjalankan rantai tindakan tanpa menunggu manusia.")
        result, ok = _execute_plan(case_id, trace, state, approved=False)
        return ("selesai_otomatis" if ok else "gagal"), _summary_after(state, result)

    if risk == "tinggi":
        trace.add("decision", "Butuh persetujuan manusia",
                  "Risiko tinggi: agent hanya merekomendasikan dan tidak menjalankan tindakan sebelum supervisor menyetujui.")
        trace.tool("send_notification", recipient="Dewi Anggraini",
                   message=f"PERSETUJUAN DIPERLUKAN {pump_id}: {FAULT_LABEL[label]} ({conf*100:.0f}%), risiko tinggi. Buka dashboard untuk menyetujui atau menolak.")
        summary = (f"Diagnosis: {FAULT_LABEL[label]} (keyakinan {conf*100:.0f}%), risiko tinggi. "
                   f"Menunggu persetujuan supervisor. Dasar: {plan['citation']}.")
        return "menunggu_persetujuan", summary

    # keyakinan sedang
    if not state.get("clarified"):
        a, b = ranked[0][0], ranked[1][0]
        if b == "normal":
            q = (f"Gejala awal mengarah ke {FAULT_LABEL[a]} ({ranked[0][1]*100:.0f}%), tetapi belum cukup kuat dibanding kondisi normal ({ranked[1][1]*100:.0f}%). "
                 f"Mohon bantu konfirmasi di lapangan: {QUESTION[a]}")
        else:
            q = (f"Gejala mengarah ke {FAULT_LABEL[a]} ({ranked[0][1]*100:.0f}%) dan {FAULT_LABEL[b]} ({ranked[1][1]*100:.0f}%). "
                 f"Untuk membedakan, pertama {QUESTION[a]} Kedua, {QUESTION[b]}")
        state["question"] = q
        trace.add("decision", "Tanya balik ke teknisi", q)
        return "menunggu_klarifikasi", "Keyakinan belum cukup. Agent menunggu jawaban teknisi untuk membedakan hipotesis."
    trace.add("decision", "Minta konfirmasi", "Setelah klarifikasi keyakinan masih di bawah ambang otomatis, jadi tindakan menunggu konfirmasi manusia.")
    summary = f"Diagnosis: {FAULT_LABEL[label]} (keyakinan {conf*100:.0f}%). Menunggu konfirmasi sebelum tindakan dijalankan."
    return "menunggu_persetujuan", summary


# ------------------------------------------------------------------ diagnosis
def diagnose(pump_id: str, complaint: str = "", trigger: str = "manual", mode: str = "policy"):
    if not tools.get_pump(pump_id):
        return {"error": f"pompa tidak ditemukan: {pump_id}"}
    existing = open_case_for(pump_id)
    if existing and trigger != "manual":
        return get_case(existing["id"])
    if existing:
        return get_case(existing["id"])

    note = ""
    if mode == "llm" and GEMINI_API_KEY:
        from . import llm
        try:
            return llm.diagnose_with_llm(pump_id, complaint)
        except Exception as e:  # jatuh ke mode policy
            note = f"Mode LLM gagal ({type(e).__name__}); beralih ke mode policy."

    case_id = db.next_id("C", "cases")
    trace = Trace(case_id)
    if note:
        trace.add("reasoning", "Peralihan mode", note)
    trace.add("reasoning", "Pemicu analisis",
              f"{'Otomatis oleh monitor' if trigger == 'auto' else 'Diminta pengguna'} untuk {pump_id}." + (f" Keluhan: \"{complaint}\"." if complaint else ""))

    data = trace.tool("get_sensor_data", pump_id=pump_id, window=30)
    if "error" in data:
        trace.add("decision", "Data tidak tersedia", data["error"])
        state = {"pump_id": pump_id}
        _save_case(case_id, trace, "gagal", state, summary=data["error"])
        return get_case(case_id)
    latest, nom = data["latest"], data["nominal"]
    dev = ", ".join(f"{k} {((latest[k]/nom[k])-1)*100:+.0f}%" for k in sim.SENSORS)
    trace.add("reasoning", "Perbandingan dengan nominal", f"Deviasi pembacaan terbaru terhadap nominal: {dev}.")

    valid = trace.tool("check_sensor_validity", pump_id=pump_id)
    state = {"pump_id": pump_id, "complaint": complaint}
    if not valid["valid"]:
        bad = ", ".join(valid["suspect_sensors"])
        trace.add("decision", "Sensor mencurigakan, diagnosis pompa ditunda",
                  f"Sensor {bad} mengirim nilai nol sementara sensor lain tidak menunjukkan pola gangguan. Agent tidak menyimpulkan kerusakan pompa dari satu sensor.")
        wo = trace.tool("create_work_order", pump_id=pump_id, title=f"Periksa sensor {bad} pada {pump_id}",
                        description=f"Sensor {bad} mengirim nilai nol. Verifikasi kabel dan sensor, bandingkan dengan pengukuran manual (panduan bagian 1.5).",
                        priority="sedang", part="Sensor getaran", case_id=case_id, risk="sedang")
        if wo.get("id"):
            sched = trace.tool("schedule_technician", work_order_id=wo["id"], skill="listrik")
            if sched.get("scheduled"):
                trace.tool("send_notification", recipient=sched["technician"],
                           message=f"{wo['id']}: periksa sensor {bad} pada {pump_id}. Jadwal {sched['scheduled_at']}.")
        summary = f"Sensor {bad} pada {pump_id} diduga bermasalah. Tiket pemeriksaan sensor dibuat."
        _save_case(case_id, trace, "sensor_bermasalah", state, risk="rendah", summary=summary)
        return get_case(case_id)

    an = tools.analyze_pump(pump_id)
    trace.tool("detect_anomaly", pump_id=pump_id)
    cl = trace.tool("classify_fault", pump_id=pump_id)
    if "error" in cl or not an.get("ready"):
        trace.add("decision", "Data belum cukup", an.get("reason", "analisis belum siap"))
        _save_case(case_id, trace, "gagal", state, summary="Data belum cukup untuk analisis.")
        return get_case(case_id)

    probs = dict(an["probs"])
    if an["is_anomaly"] and an["label"] == "normal":
        # detektor anomali dan classifier berselisih: kondisi kemungkinan tahap awal gangguan
        probs["normal"] = probs.get("normal", 0) * 0.25
        tot = sum(probs.values()) or 1.0
        probs = {k: round(v / tot, 4) for k, v in probs.items()}
        trace.add("reasoning", "Detektor berselisih, hipotesis normal diturunkan",
                  "Detektor anomali menandai data abnormal sedangkan classifier memilih normal. Pola ini khas tahap awal gangguan, "
                  "jadi probabilitas normal dikalikan 0,25 sebelum menimbang hipotesis lain.")
    if complaint:
        probs, notes = apply_evidence(probs, complaint)
        if notes:
            trace.add("reasoning", "Bukti dari keluhan teknisi", "; ".join(notes))
    state["sensor_probs"] = an["probs"]

    if an["label"] == "normal" and not an["is_anomaly"] and (not complaint or probs.get("normal", 0) >= 0.8):
        summary = f"Tidak ada gangguan terdeteksi pada {pump_id}. Semua sensor dalam rentang normal."
        if complaint:
            summary += " Karena ada keluhan, disarankan inspeksi fisik untuk memastikan."
            trace.tool("create_work_order", pump_id=pump_id, title=f"Inspeksi visual {pump_id}",
                       description=f"Keluhan teknisi: {complaint}. Sensor normal, lakukan inspeksi fisik.",
                       priority="rendah", case_id=case_id, risk="rendah")
        trace.add("decision", "Tidak ada tindakan korektif", summary)
        _save_case(case_id, trace, "tidak_ada_gangguan", state, fault="normal", conf=an["confidence"], risk="rendah", summary=summary)
        return get_case(case_id)

    label = max(probs, key=probs.get)
    flags = tools.critical_flags(pump_id, latest)
    if flags:
        trace.add("reasoning", "Ambang kritis terlampaui", "; ".join(flags))
    risk = assess_risk(label, latest, flags, nom)

    # riwayat dan kekambuhan
    rec = trace.tool("search_history", pump_id=pump_id, fault=label if label != "normal" else None, days=90)
    if rec["cases"]:
        c = rec["cases"][0]
        trace.add("reasoning", "Kemungkinan kegagalan berulang",
                  f"{c['id']} (kasus serupa pada pompa ini): penyebab sebelumnya \"{c['root_cause']}\". Selain tindakan standar, periksa akar masalah tersebut.")
        state["advice"] = f"Kasus serupa sebelumnya ({c['id']}): {c['root_cause']}. Periksa akar masalah ini agar tidak berulang."

    q = FAULT_QUERY.get(label, "anomali pompa")
    man = trace.tool("search_manual", query=q)
    cites = [h["citation"] for h in man.get("results", [])]
    state.update(probs=probs, risk=risk, citations=cites)
    if man.get("results") and not state.get("advice"):
        top = man["results"][0]["text"]
        m = re.search(r"Tindakan:\s*(.*?)(?:\sSpare part|\sRisiko|$)", top, flags=re.S)
        state["advice"] = (m.group(1).strip() if m else "")[:260]
    elif man.get("results"):
        top = man["results"][0]["text"]
        m = re.search(r"Tindakan:\s*(.*?)(?:\sSpare part|\sRisiko|$)", top, flags=re.S)
        if m:
            state["advice"] += " Tindakan standar: " + m.group(1).strip()[:200]

    status, summary = _decide(case_id, trace, state)
    ranked = sorted(state["probs"].items(), key=lambda kv: -kv[1])
    _save_case(case_id, trace, status, state, fault=ranked[0][0], conf=ranked[0][1], risk=risk, summary=summary)
    return get_case(case_id)


def continue_case(case_id: str, text: str):
    case = get_case(case_id)
    if not case:
        return {"error": "kasus tidak ditemukan"}
    if case["status"] != "menunggu_klarifikasi":
        return {"error": f"kasus berstatus {case['status']}, tidak menunggu klarifikasi"}
    state = case["state"]
    trace = Trace(case_id, case["trace"])
    trace.add("reasoning", "Jawaban teknisi", text)
    probs, notes = apply_evidence(state["probs"], text)
    trace.add("reasoning", "Pembaruan hipotesis",
              ("; ".join(notes) if notes else "Jawaban tidak mengandung bukti yang dikenali, keyakinan tidak berubah."))
    state["probs"] = probs
    state["clarified"] = True
    state["question"] = None
    status, summary = _decide(case_id, trace, state)
    ranked = sorted(state["probs"].items(), key=lambda kv: -kv[1])
    _save_case(case_id, trace, status, state, fault=ranked[0][0], conf=ranked[0][1], risk=state["risk"], summary=summary)
    return get_case(case_id)


def approve_case(case_id: str):
    case = get_case(case_id)
    if not case or case["status"] != "menunggu_persetujuan":
        return {"error": "kasus tidak menunggu persetujuan"}
    state = case["state"]
    trace = Trace(case_id, case["trace"])
    trace.add("decision", "Disetujui supervisor", "Tindakan dijalankan setelah persetujuan manusia.")
    result, ok = _execute_plan(case_id, trace, state, approved=True)
    summary = _summary_after(state, result) if ok else "Persetujuan diberikan tetapi tindakan gagal dijalankan."
    _save_case(case_id, trace, "disetujui_dijalankan" if ok else "gagal", state,
               fault=case["fault"], conf=case["confidence"], risk=case["risk"], summary=summary)
    return get_case(case_id)


def reject_case(case_id: str, note: str = ""):
    case = get_case(case_id)
    if not case or case["status"] not in OPEN_STATUSES:
        return {"error": "kasus tidak dapat ditolak"}
    trace = Trace(case_id, case["trace"])
    trace.add("decision", "Ditolak supervisor", note or "Tidak ada tindakan dijalankan.")
    _save_case(case_id, trace, "ditolak", case["state"], fault=case["fault"], conf=case["confidence"],
               risk=case["risk"], summary="Rekomendasi ditolak oleh supervisor. Tidak ada tindakan dijalankan.")
    return get_case(case_id)


def complete_work_order(wo_id: str, root_cause: str = "", action: str = "", duration_min: float = 60.0):
    wo = db.q("SELECT * FROM work_orders WHERE id=?", (wo_id,), one=True)
    if not wo:
        return {"error": "work order tidak ditemukan"}
    if wo["status"] == "selesai":
        return {"error": "work order sudah selesai"}
    db.x("UPDATE work_orders SET status='selesai', closed_at=? WHERE id=?", (db.now(), wo_id))
    if wo["technician_id"]:
        db.x("UPDATE technicians SET available=1 WHERE id=?", (wo["technician_id"],))
    case = get_case(wo["case_id"]) if wo["case_id"] else None
    fault = (case or {}).get("fault") or "normal"
    symptoms = (case or {}).get("summary") or wo["title"]
    tools.save_case_history(wo["pump_id"], symptoms[:200], fault,
                            root_cause or "Sesuai diagnosis agent", action or wo["description"][:200], duration_min)
    sim.reset_pump(wo["pump_id"])
    if case and case["status"] in ("selesai_otomatis", "disetujui_dijalankan", "dieskalasi"):
        trace = Trace(case["id"], case["trace"])
        trace.add("action", "Pekerjaan selesai", f"{wo_id} ditutup. Hasil disimpan ke riwayat kasus dan indeks pengetahuan diperbarui.")
        _save_case(case["id"], trace, "selesai", case["state"], fault=case["fault"], conf=case["confidence"],
                   risk=case["risk"], summary=case["summary"])
    return {"ok": True, "work_order": wo_id}


# ------------------------------------------------------------------ triage lintas pompa
def triage(trigger="manual"):
    """Urutkan pompa bermasalah dan tangani sesuai prioritas (Kasus 6)."""
    from . import monitor
    ranking = []
    crit = {"tinggi": 2, "sedang": 1}
    for p in db.q("SELECT * FROM pumps"):
        st = monitor.STATUS.get(p["id"])
        if not st or st["state"] == "normal":
            continue
        score = (2 if st["state"] == "kritis" else 1) * 10 + crit.get(p["criticality"], 0) * 3 + (1 - st.get("confidence", 0))
        ranking.append({"pump_id": p["id"], "state": st["state"], "label": st.get("label"),
                        "criticality": p["criticality"], "score": round(score, 2)})
    ranking.sort(key=lambda r: -r["score"])
    cases = []
    for r in ranking:
        c = diagnose(r["pump_id"], trigger=trigger)
        cases.append({"pump_id": r["pump_id"], "case_id": c.get("id"), "status": c.get("status")})
    return {"ranking": ranking, "cases": cases}


# ------------------------------------------------------------------ chat
def chat(message: str, case_id: str | None = None, mode: str = "policy"):
    msg = (message or "").strip()
    if not msg:
        return {"reply": "Tulis pertanyaan atau keluhan, misalnya: \"Pompa 3 bunyi kasar dan agak panas\".", "case": None}
    if mode == "llm" and GEMINI_API_KEY:
        from . import llm
        try:
            return llm.chat_with_llm(msg)
        except Exception as e:
            pass  # lanjut ke mode policy
    if case_id:
        c = get_case(case_id)
        if c and c["status"] == "menunggu_klarifikasi":
            res = continue_case(case_id, msg)
            return {"reply": res.get("summary") or "Jawaban diterima.", "case": res}
    low = msg.lower()
    m = re.search(r"(?:pompa|pump)[\s-]*0?(\d)", low)
    if m:
        pid = f"Pump-0{m.group(1)}"
        if not tools.get_pump(pid):
            return {"reply": f"{pid} tidak terdaftar.", "case": None}
        res = diagnose(pid, complaint=msg)
        return {"reply": res.get("summary") or "Analisis selesai.", "case": res}
    if any(w in low for w in ("prioritas", "triage", "semua pompa", "urutan")):
        t = triage()
        if not t["ranking"]:
            return {"reply": "Semua pompa dalam kondisi normal.", "case": None}
        lines = [f"{i+1}. {r['pump_id']} ({r['state']}, {FAULT_LABEL.get(r['label'], r['label'])})" for i, r in enumerate(t["ranking"])]
        return {"reply": "Urutan prioritas penanganan:\n" + "\n".join(lines), "case": None}
    if any(w in low for w in ("stok", "stock", "persediaan")):
        items = db.q("SELECT * FROM inventory")
        hit = [i for i in items if any(tok in i["name"].lower() for tok in re.findall(r"[a-z0-9]{4,}", low))]
        hit = hit or items
        return {"reply": "Stok: " + "; ".join(f"{i['name']} = {i['stock']}" for i in hit), "case": None}
    if "work order" in low or re.search(r"\bwo\b", low):
        wos = db.q("SELECT * FROM work_orders WHERE status!='selesai' ORDER BY created_at DESC LIMIT 8")
        if not wos:
            return {"reply": "Tidak ada work order terbuka.", "case": None}
        return {"reply": "Work order terbuka: " + "; ".join(f"{w['id']} {w['pump_id']} ({w['status']})" for w in wos), "case": None}
    if "status" in low or "kondisi" in low:
        from . import monitor
        return {"reply": "Status pompa: " + "; ".join(f"{k} {v['state']}" for k, v in monitor.STATUS.items()), "case": None}
    return {"reply": "Saya bisa menganalisis pompa (contoh: \"Pompa 3 bunyi kasar\"), menampilkan prioritas, stok part, atau work order terbuka.", "case": None}
