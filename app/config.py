"""Konfigurasi aplikasi dari environment variable."""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

# Muat file .env sederhana (KEY=VALUE) bila ada; variabel yang sudah diset di environment tidak ditimpa.
_env = BASE_DIR / ".env"
if _env.exists():
    for _line in _env.read_text(encoding="utf-8").splitlines():
        _line = _line.strip()
        if _line and not _line.startswith("#") and "=" in _line:
            _k, _v = _line.split("=", 1)
            os.environ.setdefault(_k.strip(), _v.strip().strip('"').strip("'"))
DATA_DIR = BASE_DIR / "data"
MODELS_DIR = BASE_DIR / "models"
MANUALS_DIR = DATA_DIR / "manuals"

DB_PATH = Path(os.getenv("DB_PATH", str(DATA_DIR / "manualmechanic.db")))
if not DB_PATH.is_absolute():
    DB_PATH = BASE_DIR / DB_PATH

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip()
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "").strip()

TICK_SECONDS = float(os.getenv("TICK_SECONDS", "2"))
AUTO_AGENT = os.getenv("AUTO_AGENT", "true").lower() in ("1", "true", "yes")

WINDOW = 30  # jumlah pembacaan per jendela analisis

# Ambang keputusan agent
CONF_ACT = 0.80      # >= : eksekusi otomatis (jika risiko tidak tinggi)
CONF_CONFIRM = 0.50  # >= : minta klarifikasi / persetujuan; < : eskalasi
