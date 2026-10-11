"""Mode LLM: Gemini function calling di atas tool yang sama (REST, tanpa SDK).

Catatan: guardrail tetap berlaku karena dijalankan di lapisan tool (mis. work order
berisiko tinggi ditolak tanpa persetujuan). Mode ini bersifat eksperimental dan
membutuhkan GEMINI_API_KEY serta akses jaringan ke Google.
"""
import json
import httpx

from . import db, tools
from .agent import Trace, _save_case, get_case, _short
from .config import GEMINI_API_KEY, GEMINI_MODEL

URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
MAX_STEPS = 12

SYSTEM = """Kamu adalah ManualMechanic, agent perawatan pompa sentrifugal untuk tim maintenance pabrik.
Gunakan tool, jangan menebak angka. Urutan kerja yang disarankan:
1) get_sensor_data dan check_sensor_validity; jika sensor mencurigakan, jangan simpulkan kerusakan pompa.
2) detect_anomaly dan classify_fault (model ML membaca sensor; kamu tidak menganalisis angka mentah).
3) search_history dan search_manual untuk dasar diagnosis; sebut sitasi (sumber dan bagian) pada jawaban akhir.
4) Keputusan: keyakinan >= 80% dan risiko bukan tinggi -> check_inventory, create_work_order, bila stok kosong create_purchase_request,
   schedule_technician (skill mekanik atau listrik), lalu send_notification.
   Keyakinan 50-80% -> jelaskan ambiguitas dan tanyakan klarifikasi tanpa membuat work order.
   Keyakinan < 50% atau pola tidak dikenal -> escalate_to_senior.
   Risiko tinggi (arus >= 125% nominal, suhu >= 80 C, atau ambang kritis) -> hanya rekomendasikan dan minta persetujuan supervisor; jangan membuat work order.
5) Jawab ringkas dalam Bahasa Indonesia, sebut ID work order yang dibuat dan sitasi manual.
Jika sebuah tool mengembalikan error, baca pesannya dan perbaiki parameter atau pilih langkah lain."""


def _declarations():
    return [{"name": n, "description": d, "parameters": p} for n, d, p in tools.TOOL_SPECS]


def _call(contents):
    body = {
        "system_instruction": {"parts": [{"text": SYSTEM}]},
        "contents": contents,
        "tools": [{"function_declarations": _declarations()}],
    }
    r = httpx.post(URL.format(model=GEMINI_MODEL), headers={"x-goog-api-key": GEMINI_API_KEY},
                   json=body, timeout=60)
    r.raise_for_status()
    return r.json()


def _loop(task: str, trace: Trace):
    contents = [{"role": "user", "parts": [{"text": task}]}]
    final, needs_approval = "", False
    for _ in range(MAX_STEPS):
        data = _call(contents)
        cand = (data.get("candidates") or [{}])[0].get("content", {})
        parts = cand.get("parts", [])
        contents.append({"role": "model", "parts": parts})
        calls = [p["functionCall"] for p in parts if "functionCall" in p]
        texts = [p["text"] for p in parts if "text" in p]
        if texts:
            trace.add("reasoning", "Penalaran LLM", " ".join(texts)[:600])
        if not calls:
            final = " ".join(texts).strip()
            break
        responses = []
        for fc in calls:
            name, args = fc["name"], dict(fc.get("args") or {})
            res = trace.tool(name, **args) if name in tools.REGISTRY else {"error": f"tool tidak dikenal: {name}"}
            if isinstance(res, dict) and res.get("requires_approval"):
                needs_approval = True
            responses.append({"functionResponse": {"name": name, "response": {"result": res}}})
        contents.append({"role": "user", "parts": responses})
    return final or "Analisis selesai.", needs_approval


def diagnose_with_llm(pump_id: str, complaint: str = ""):
    case_id = db.next_id("C", "cases")
    trace = Trace(case_id)
    trace.add("reasoning", "Mode LLM", f"Model {GEMINI_MODEL} menjalankan loop function calling.")
    task = f"Diagnosis dan tindak lanjut untuk {pump_id}." + (f" Keluhan teknisi: {complaint}" if complaint else "")
    final, needs = _loop(task, trace)
    status = "menunggu_persetujuan" if needs else "selesai_llm"
    _save_case(case_id, trace, status, {"pump_id": pump_id, "probs": None}, summary=final, mode="llm")
    return get_case(case_id)


def chat_with_llm(message: str):
    case_id = db.next_id("C", "cases")
    trace = Trace(case_id)
    final, needs = _loop(message, trace)
    used_tools = any(i["kind"] == "tool" for i in trace.items)
    case = None
    if used_tools:
        _save_case(case_id, trace, "menunggu_persetujuan" if needs else "selesai_llm", {"pump_id": None}, summary=final, mode="llm")
        case = get_case(case_id)
    return {"reply": final, "case": case}
