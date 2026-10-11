"""API FastAPI + penyajian antarmuka web statis."""
import asyncio
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import agent, db, ml, monitor, rag, simulator as sim, tools
from .config import AUTO_AGENT, GEMINI_API_KEY, GEMINI_MODEL, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TICK_SECONDS

STATIC = Path(__file__).parent / "static"
LEVELS = {"awal": 0.22, "ringan": 0.3, "sedang": 0.55, "berat": 0.8}


def bootstrap():
    db.init_db()
    db.seed()
    sim.init_state()
    sim.seed_history()
    sim.start_scenario()
    ml.load()
    rag.build_index()
    monitor.AUTO["enabled"] = AUTO_AGENT
    for p in db.q("SELECT id FROM pumps"):
        monitor.STATUS[p["id"]] = monitor.compute_status(p["id"])


async def _loop():
    while True:
        try:
            await asyncio.to_thread(monitor.tick)
        except Exception as e:  # jangan hentikan loop karena satu galat
            print("monitor error:", repr(e))
        await asyncio.sleep(TICK_SECONDS)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await asyncio.to_thread(bootstrap)
    task = None
    if os.getenv("DISABLE_LOOP") != "1":
        task = asyncio.create_task(_loop())
    yield
    if task:
        task.cancel()


app = FastAPI(title="ManualMechanic", version="1.0.0", lifespan=lifespan)


# ------------------------------------------------------------------ model request
class InjectReq(BaseModel):
    pump_id: str
    fault: str
    level: str = "ringan"
    rate: float | None = None


class PumpReq(BaseModel):
    pump_id: str
    ticks: int = 30


class DiagnoseReq(BaseModel):
    pump_id: str
    complaint: str = ""
    mode: str = "policy"


class ChatReq(BaseModel):
    message: str
    case_id: str | None = None
    mode: str = "policy"


class TextReq(BaseModel):
    text: str = ""


class CompleteReq(BaseModel):
    root_cause: str = ""
    action: str = ""
    duration_min: float = 60.0


class AutoReq(BaseModel):
    enabled: bool


def _check(res):
    if isinstance(res, dict) and "error" in res and len(res) == 1:
        raise HTTPException(400, res["error"])
    return res


# ------------------------------------------------------------------ rute
@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/config")
def config():
    return {
        "llm_available": bool(GEMINI_API_KEY), "llm_model": GEMINI_MODEL if GEMINI_API_KEY else None,
        "telegram_configured": bool(TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID),
        "auto_agent": monitor.AUTO["enabled"], "tick_seconds": TICK_SECONDS,
    }


@app.post("/api/auto")
def set_auto(r: AutoReq):
    monitor.AUTO["enabled"] = r.enabled
    return {"auto_agent": r.enabled}


@app.get("/api/metrics")
def metrics():
    return ml.metrics()


@app.get("/api/state")
def state(n: int = 60):
    pumps = []
    for p in db.q("SELECT * FROM pumps"):
        st = monitor.STATUS.get(p["id"]) or monitor.compute_status(p["id"])
        rows = sim.recent(p["id"], n)
        pumps.append({
            **p, "status": st,
            "series": {k: [r[k] for r in rows] for k in sim.SENSORS},
            "sim": {k: v for k, v in sim.STATE.get(p["id"], {}).items()},
            "open_case": (agent.open_case_for(p["id"]) or {}).get("id"),
        })
    return {"pumps": pumps, "auto_agent": monitor.AUTO["enabled"]}


@app.post("/api/simulator/inject")
def inject(r: InjectReq):
    sev = LEVELS.get(r.level, 0.3)
    rate = r.rate if r.rate is not None else (0.01 if r.fault != "overload" else 0.008)
    try:
        st = sim.inject(r.pump_id, r.fault, sev, rate)
    except KeyError:
        raise HTTPException(404, "pompa tidak ditemukan")
    except ValueError as e:
        raise HTTPException(400, str(e))
    sim.advance(r.pump_id, 30)  # isi jendela dengan kondisi baru agar langsung terbaca
    monitor.STATUS[r.pump_id] = monitor.compute_status(r.pump_id)
    return {"ok": True, "sim": st}


@app.post("/api/simulator/advance")
def advance(r: PumpReq):
    if r.pump_id not in sim.STATE:
        raise HTTPException(404, "pompa tidak ditemukan")
    sim.advance(r.pump_id, r.ticks)
    monitor.STATUS[r.pump_id] = monitor.compute_status(r.pump_id)
    return {"ok": True}


@app.post("/api/simulator/reset")
def reset(r: PumpReq):
    if r.pump_id not in sim.STATE:
        raise HTTPException(404, "pompa tidak ditemukan")
    sim.reset_pump(r.pump_id)
    sim.advance(r.pump_id, 30)
    monitor.STATUS[r.pump_id] = monitor.compute_status(r.pump_id)
    return {"ok": True}


@app.post("/api/agent/diagnose")
def diagnose(r: DiagnoseReq):
    return _check(agent.diagnose(r.pump_id, complaint=r.complaint, trigger="manual", mode=r.mode))


@app.post("/api/agent/chat")
def chat(r: ChatReq):
    return agent.chat(r.message, r.case_id, r.mode)


@app.post("/api/agent/triage")
def triage():
    return agent.triage(trigger="manual")


@app.get("/api/cases")
def cases():
    return agent.list_cases()


@app.get("/api/cases/{case_id}")
def case(case_id: str):
    c = agent.get_case(case_id)
    if not c:
        raise HTTPException(404, "kasus tidak ditemukan")
    return c


@app.post("/api/cases/{case_id}/answer")
def answer(case_id: str, r: TextReq):
    return _check(agent.continue_case(case_id, r.text))


@app.post("/api/cases/{case_id}/approve")
def approve(case_id: str):
    return _check(agent.approve_case(case_id))


@app.post("/api/cases/{case_id}/reject")
def reject(case_id: str, r: TextReq):
    return _check(agent.reject_case(case_id, r.text))


@app.get("/api/work-orders")
def work_orders():
    return db.q("""SELECT w.*, t.name AS technician FROM work_orders w
                   LEFT JOIN technicians t ON t.id = w.technician_id ORDER BY w.created_at DESC LIMIT 60""")


@app.post("/api/work-orders/{wo_id}/complete")
def complete(wo_id: str, r: CompleteReq):
    return _check(agent.complete_work_order(wo_id, r.root_cause, r.action, r.duration_min))


@app.get("/api/inventory")
def inventory():
    return db.q("SELECT * FROM inventory ORDER BY name")


@app.get("/api/purchase-requests")
def purchases():
    return db.q("SELECT * FROM purchase_requests ORDER BY created_at DESC LIMIT 30")


@app.get("/api/notifications")
def notifications():
    return db.q("SELECT * FROM notifications ORDER BY id DESC LIMIT 40")


@app.get("/api/history")
def history():
    return db.q("SELECT * FROM case_history ORDER BY ts DESC LIMIT 40")


@app.get("/api/logs")
def logs(limit: int = 80):
    return db.q("SELECT * FROM agent_logs ORDER BY id DESC LIMIT ?", (limit,))


@app.get("/api/manual/search")
def manual_search(q: str, k: int = 3):
    return tools.search_manual(q, k)


# ------------------------------------------------------------------ frontend
app.mount("/static", StaticFiles(directory=str(STATIC)), name="static")


@app.get("/")
def index():
    return FileResponse(STATIC / "index.html")
