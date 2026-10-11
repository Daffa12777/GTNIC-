"""Lapisan database SQLite (koneksi per pemanggilan, mode WAL)."""
import json
import sqlite3
import time
from contextlib import contextmanager

from .config import DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS pumps (
  id TEXT PRIMARY KEY, name TEXT, location TEXT, model TEXT, criticality TEXT,
  nom_vibration REAL, nom_temp REAL, nom_pressure REAL, nom_current REAL, nom_flow REAL
);
CREATE TABLE IF NOT EXISTS sensor_readings (
  id INTEGER PRIMARY KEY AUTOINCREMENT, pump_id TEXT, ts REAL,
  vibration REAL, bearing_temp REAL, pressure REAL, current REAL, flow REAL
);
CREATE INDEX IF NOT EXISTS idx_readings_pump_ts ON sensor_readings(pump_id, id);
CREATE TABLE IF NOT EXISTS inventory (
  part_id TEXT PRIMARY KEY, name TEXT, stock INTEGER, location TEXT, min_stock INTEGER
);
CREATE TABLE IF NOT EXISTS technicians (
  id TEXT PRIMARY KEY, name TEXT, skill TEXT, level TEXT, available INTEGER, contact TEXT
);
CREATE TABLE IF NOT EXISTS work_orders (
  id TEXT PRIMARY KEY, pump_id TEXT, case_id TEXT, title TEXT, description TEXT,
  priority TEXT, status TEXT, technician_id TEXT, scheduled_at TEXT, part TEXT,
  created_at REAL, closed_at REAL
);
CREATE TABLE IF NOT EXISTS purchase_requests (
  id TEXT PRIMARY KEY, part_name TEXT, qty INTEGER, reason TEXT, work_order_id TEXT,
  status TEXT, created_at REAL
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts REAL, recipient TEXT, channel TEXT,
  message TEXT, status TEXT, detail TEXT
);
CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY, pump_id TEXT, status TEXT, fault TEXT, confidence REAL,
  risk TEXT, summary TEXT, trace TEXT, state TEXT, created_at REAL, updated_at REAL, mode TEXT
);
CREATE TABLE IF NOT EXISTS case_history (
  id TEXT PRIMARY KEY, pump_id TEXT, ts REAL, symptoms TEXT, fault TEXT, root_cause TEXT,
  action TEXT, duration_min REAL
);
CREATE TABLE IF NOT EXISTS agent_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts REAL, case_id TEXT, step TEXT, tool TEXT,
  input TEXT, output TEXT
);
"""


@contextmanager
def conn():
    c = sqlite3.connect(str(DB_PATH), timeout=15)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA journal_mode=WAL")
    try:
        yield c
        c.commit()
    finally:
        c.close()


def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with conn() as c:
        c.executescript(SCHEMA)


def q(sql, params=(), one=False):
    with conn() as c:
        cur = c.execute(sql, params)
        rows = [dict(r) for r in cur.fetchall()]
    if one:
        return rows[0] if rows else None
    return rows


def x(sql, params=()):
    with conn() as c:
        cur = c.execute(sql, params)
        return cur.lastrowid


def next_id(prefix: str, table: str) -> str:
    n = q(f"SELECT COUNT(*) AS n FROM {table}", one=True)["n"]
    return f"{prefix}-{n + 1:04d}"


def dumps(o):
    return json.dumps(o, ensure_ascii=False, default=str)


def now():
    return time.time()


def seed():
    """Isi data awal (idempoten)."""
    if q("SELECT COUNT(*) AS n FROM pumps", one=True)["n"]:
        return
    pumps = [
        ("Pump-01", "Pompa Sirkulasi Pendingin", "Utilitas, Area A", "CP-150", "tinggi", 2.5, 55, 4.5, 18, 120),
        ("Pump-02", "Pompa Transfer Bahan Baku", "Produksi, Line 1", "CP-150", "tinggi", 2.6, 56, 4.4, 19, 118),
        ("Pump-03", "Pompa Umpan Boiler", "Utilitas, Area B", "CP-200", "sedang", 2.4, 54, 4.6, 17, 122),
        ("Pump-04", "Pompa Proses Pencucian", "Produksi, Line 2", "CP-150", "sedang", 2.5, 55, 4.5, 18, 120),
    ]
    for p in pumps:
        x("INSERT INTO pumps VALUES (?,?,?,?,?,?,?,?,?,?)", p)
    inv = [
        ("SP-001", "Bearing 6309", 2, "Gudang A-1", 2),
        ("SP-002", "Impeller CP-150", 0, "Gudang A-2", 1),
        ("SP-003", "Mechanical seal", 3, "Gudang A-2", 1),
        ("SP-004", "Grease NLGI 2 (kartrid)", 10, "Gudang B-1", 4),
        ("SP-005", "Strainer sisi hisap", 4, "Gudang B-3", 2),
        ("SP-006", "Overload relay", 2, "Gudang C-1", 1),
        ("SP-007", "Sensor getaran", 1, "Gudang C-2", 1),
    ]
    for i in inv:
        x("INSERT INTO inventory VALUES (?,?,?,?,?)", i)
    techs = [
        ("T-01", "Andi Pratama", "mekanik", "junior", 1, "@andi"),
        ("T-02", "Budi Santoso", "listrik", "junior", 1, "@budi"),
        ("T-03", "Citra Lestari", "mekanik", "senior", 1, "@citra"),
        ("T-04", "Dewi Anggraini", "supervisor", "senior", 1, "@dewi"),
        ("T-05", "Eko Wahyudi", "mekanik", "junior", 1, "@eko"),
        ("T-06", "Fajar Nugroho", "listrik", "senior", 1, "@fajar"),
    ]
    for t in techs:
        x("INSERT INTO technicians VALUES (?,?,?,?,?,?)", t)
    hist = [
        ("H-0001", "Pump-02", now() - 40 * 86400, "getaran naik, suhu bearing naik", "bearing",
         "Bearing aus akibat pelumasan tidak sesuai jadwal", "Ganti bearing 6309, isi ulang grease, cek kelurusan poros", 95),
        ("H-0002", "Pump-03", now() - 75 * 86400, "tekanan turun, debit turun, arus naik", "impeller",
         "Impeller tersumbat kotoran dari saringan yang jebol", "Bongkar rumah pompa, bersihkan impeller, ganti strainer", 140),
        ("H-0003", "Pump-04", now() - 120 * 86400, "getaran acak, bunyi seperti kerikil", "cavitation",
         "Strainer sisi hisap tersumbat sebagian sehingga tekanan hisap rendah", "Bersihkan strainer, cek katup hisap terbuka penuh", 60),
        ("H-0004", "Pump-01", now() - 200 * 86400, "arus motor naik, motor panas", "overload",
         "Tegangan suplai tidak stabil dan beban proses berlebih", "Cek tegangan, setel ulang overload relay, kurangi beban proses", 110),
    ]
    for h in hist:
        x("INSERT INTO case_history VALUES (?,?,?,?,?,?,?,?)", h)
