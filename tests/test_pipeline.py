"""Uji end-to-end alur agent terhadap API (simulator + ML + RAG + tool)."""
import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def inject(c, pump, fault, level, ticks=30):
    c.post("/api/simulator/inject", json={"pump_id": pump, "fault": fault, "level": level, "rate": 0.0})
    c.post("/api/simulator/advance", json={"pump_id": pump, "ticks": ticks})


def diagnose(c, pump, complaint=""):
    r = c.post("/api/agent/diagnose", json={"pump_id": pump, "complaint": complaint})
    assert r.status_code == 200, r.text
    return r.json()


def tools_used(case):
    return [t["tool"] for t in case["trace"] if t["tool"]]


def test_health_and_state(client):
    assert client.get("/health").json()["status"] == "ok"
    pumps = client.get("/api/state").json()["pumps"]
    assert len(pumps) == 4 and all(len(p["series"]["vibration"]) > 0 for p in pumps)


def test_model_metrics_present(client):
    m = client.get("/api/metrics").json()
    assert m["macro_f1"] > 0.9 and "simulasi" in m["note"]


def test_bearing_auto_execution_chain(client):
    inject(client, "Pump-02", "bearing", "sedang")
    case = diagnose(client, "Pump-02")
    assert case["fault"] == "bearing" and case["status"] == "selesai_otomatis"
    used = tools_used(case)
    for t in ("get_sensor_data", "classify_fault", "search_manual", "check_inventory",
              "create_work_order", "schedule_technician", "send_notification"):
        assert t in used
    assert "bagian 1.1" in case["summary"]  # sitasi manual


def test_impeller_stock_empty_creates_purchase_request(client):
    inject(client, "Pump-03", "impeller", "sedang")
    case = diagnose(client, "Pump-03")
    assert case["fault"] == "impeller" and case["status"] == "selesai_otomatis"
    assert "create_purchase_request" in tools_used(case)
    assert client.get("/api/purchase-requests").json()[0]["part_name"].startswith("Impeller")


def test_overload_high_risk_requires_approval(client):
    inject(client, "Pump-04", "overload", "berat")
    wo_before = len(client.get("/api/work-orders").json())
    case = diagnose(client, "Pump-04")
    assert case["status"] == "menunggu_persetujuan" and case["risk"] == "tinggi"
    assert "create_work_order" not in tools_used(case)  # agent tidak bertindak sendiri
    assert len(client.get("/api/work-orders").json()) == wo_before
    done = client.post(f"/api/cases/{case['id']}/approve").json()
    assert done["status"] == "disetujui_dijalankan"
    assert len(client.get("/api/work-orders").json()) == wo_before + 1


def test_guardrail_blocks_high_risk_tool_call_without_approval():
    from app import tools
    res = tools.create_work_order("Pump-01", "uji", "uji guardrail", "tinggi", risk="tinggi", approved=False)
    assert res.get("requires_approval") is True


def test_ambiguous_case_asks_then_resolves(client):
    inject(client, "Pump-01", "cavitation", "awal")
    case = diagnose(client, "Pump-01")
    assert case["status"] in ("menunggu_klarifikasi", "selesai_otomatis", "menunggu_persetujuan")
    if case["status"] == "menunggu_klarifikasi":
        assert case["question"]
        res = client.post(f"/api/cases/{case['id']}/answer",
                          json={"text": "Terdengar seperti kerikil di dalam pompa, strainer tersumbat"}).json()
        assert res["status"] in ("selesai_otomatis", "menunggu_persetujuan")
        assert res["fault"] == "cavitation"


def test_negation_evidence_lowers_hypothesis():
    from app.agent import apply_evidence
    base = {"bearing": 0.5, "cavitation": 0.4, "impeller": 0.05, "normal": 0.03, "overload": 0.02}
    pos, _ = apply_evidence(base, "terdengar seperti kerikil")
    neg, _ = apply_evidence(base, "tidak terdengar kerikil")
    assert pos["cavitation"] > base["cavitation"] > neg["cavitation"]


def test_normal_pump_with_complaint_creates_inspection(client):
    client.post("/api/simulator/reset", json={"pump_id": "Pump-01"})
    # selesaikan kasus terbuka lebih dulu agar tidak mengembalikan kasus lama
    for c in client.get("/api/cases").json():
        if c["pump_id"] == "Pump-01" and c["status"] in ("menunggu_klarifikasi", "menunggu_persetujuan"):
            client.post(f"/api/cases/{c['id']}/reject", json={"text": "uji"})
    case = diagnose(client, "Pump-01", complaint="agak bising")
    assert case["status"] in ("tidak_ada_gangguan", "selesai_otomatis", "menunggu_klarifikasi", "menunggu_persetujuan")


def test_sensor_dropout_does_not_blame_pump(client):
    client.post("/api/simulator/reset", json={"pump_id": "Pump-04"})
    for c in client.get("/api/cases").json():
        if c["pump_id"] == "Pump-04" and c["status"] in ("menunggu_klarifikasi", "menunggu_persetujuan"):
            client.post(f"/api/cases/{c['id']}/reject", json={"text": "uji"})
    client.post("/api/simulator/inject", json={"pump_id": "Pump-04", "fault": "sensor_error", "level": "ringan"})
    client.post("/api/simulator/advance", json={"pump_id": "Pump-04", "ticks": 10})
    case = diagnose(client, "Pump-04")
    assert case["status"] == "sensor_bermasalah"
    assert "classify_fault" not in tools_used(case)


def test_recurrence_detected_from_history(client):
    # Pump-02 punya riwayat bearing 40 hari lalu pada data awal
    client.post("/api/simulator/reset", json={"pump_id": "Pump-02"})
    for c in client.get("/api/cases").json():
        if c["pump_id"] == "Pump-02" and c["status"] in ("menunggu_klarifikasi", "menunggu_persetujuan"):
            client.post(f"/api/cases/{c['id']}/reject", json={"text": "uji"})
    for w in client.get("/api/work-orders").json():
        if w["pump_id"] == "Pump-02" and w["status"] != "selesai":
            client.post(f"/api/work-orders/{w['id']}/complete", json={})
    inject(client, "Pump-02", "bearing", "sedang")
    case = diagnose(client, "Pump-02")
    titles = [t["title"] for t in case["trace"]]
    assert "Kemungkinan kegagalan berulang" in titles


def test_complete_work_order_updates_history_and_rag(client):
    wos = [w for w in client.get("/api/work-orders").json() if w["status"] != "selesai"]
    assert wos
    n_before = len(client.get("/api/history").json())
    r = client.post(f"/api/work-orders/{wos[0]['id']}/complete", json={"root_cause": "uji", "action": "uji", "duration_min": 30})
    assert r.status_code == 200
    assert len(client.get("/api/history").json()) == n_before + 1


def test_chat_intents(client):
    assert "Stok" in client.post("/api/agent/chat", json={"message": "stok bearing berapa?"}).json()["reply"]
    assert client.post("/api/agent/chat", json={"message": "halo"}).status_code == 200


def test_weak_early_signal_is_not_escalated(client):
    """Sinyal awal yang lemah harus ditanyakan atau dipantau, bukan dieskalasi ke senior."""
    for c in client.get("/api/cases").json():
        if c["pump_id"] == "Pump-01" and c["status"] in ("menunggu_klarifikasi", "menunggu_persetujuan"):
            client.post(f"/api/cases/{c['id']}/reject", json={"text": "uji"})
    client.post("/api/simulator/reset", json={"pump_id": "Pump-01"})
    inject(client, "Pump-01", "bearing", "awal", ticks=30)
    case = diagnose(client, "Pump-01")
    assert case["status"] != "dieskalasi"


def test_llm_loop_mechanics_with_mocked_gemini(client, monkeypatch):
    """Menguji parsing function calling dan guardrail tanpa jaringan (respons Gemini di-mock)."""
    from app import llm, agent
    from app.agent import Trace
    script = iter([
        {"candidates": [{"content": {"parts": [{"functionCall": {"name": "get_sensor_data", "args": {"pump_id": "Pump-01"}}}]}}]},
        {"candidates": [{"content": {"parts": [{"functionCall": {"name": "create_work_order", "args": {
            "pump_id": "Pump-01", "title": "uji llm", "description": "uji", "priority": "tinggi", "risk": "tinggi"}}}]}}]},
        {"candidates": [{"content": {"parts": [{"text": "Selesai. Tindakan berisiko tinggi menunggu persetujuan."}]}}]},
    ])
    monkeypatch.setattr(llm, "_call", lambda contents: next(script))
    trace = Trace("C-TEST")
    final, needs = llm._loop("diagnosis Pump-01", trace)
    assert "persetujuan" in final
    assert needs is True  # guardrail tool menolak work order berisiko tinggi tanpa persetujuan
    assert [t["tool"] for t in trace.items if t["tool"]] == ["get_sensor_data", "create_work_order"]
