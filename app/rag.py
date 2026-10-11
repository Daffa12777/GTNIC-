"""RAG ringan: pemotongan dokumen, indeks TF-IDF, pencarian dengan sitasi.

Sumber: file .md dan .pdf di data/manuals (PDF dipotong per halaman) serta tabel
case_history (riwayat perbaikan). Indeks dibangun ulang saat riwayat bertambah.
"""
import re
import threading
from pathlib import Path

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import linear_kernel

from .config import MANUALS_DIR
from . import db

_lock = threading.Lock()
_chunks: list = []
_vec = None
_mat = None


def _md_chunks(path: Path):
    text = path.read_text(encoding="utf-8")
    title = next((l[2:].strip() for l in text.splitlines() if l.startswith("# ")), path.stem)
    parts = re.split(r"^## ", text, flags=re.M)[1:]
    for p in parts:
        head, _, body = p.partition("\n")
        m = re.match(r"([\d.]+)\s+(.*)", head.strip())
        sec, name = (m.group(1), m.group(2)) if m else ("", head.strip())
        yield {
            "source": title, "file": path.name, "locator": f"bagian {sec}" if sec else name,
            "heading": name, "text": f"{name}. {body.strip()}", "kind": "manual",
        }


def _pdf_chunks(path: Path):
    try:
        from pypdf import PdfReader
        reader = PdfReader(str(path))
    except Exception:
        return
    for i, page in enumerate(reader.pages, start=1):
        try:
            t = (page.extract_text() or "").strip()
        except Exception:
            t = ""
        if len(t) > 40:
            yield {"source": path.stem, "file": path.name, "locator": f"hal. {i}",
                   "heading": f"Halaman {i}", "text": t, "kind": "manual"}


def _history_chunks():
    for h in db.q("SELECT * FROM case_history"):
        yield {
            "source": "Riwayat perbaikan", "file": h["id"], "locator": h["id"],
            "heading": f"{h['pump_id']} - {h['fault']}",
            "text": f"Gejala: {h['symptoms']}. Jenis gangguan: {h['fault']}. Penyebab: {h['root_cause']}. Tindakan: {h['action']}.",
            "kind": "history", "pump_id": h["pump_id"], "fault": h["fault"],
        }


def build_index():
    global _chunks, _vec, _mat
    chunks = []
    for f in sorted(Path(MANUALS_DIR).glob("*")):
        if f.suffix.lower() == ".md":
            chunks += list(_md_chunks(f))
        elif f.suffix.lower() == ".pdf":
            chunks += list(_pdf_chunks(f))
    chunks += list(_history_chunks())
    if not chunks:
        return 0
    vec = TfidfVectorizer(lowercase=True, ngram_range=(1, 2), sublinear_tf=True, min_df=1)
    mat = vec.fit_transform([c["text"] for c in chunks])
    with _lock:
        _chunks, _vec, _mat = chunks, vec, mat
    return len(chunks)


def search(query: str, k: int = 3, kind: str | None = None) -> list:
    if _vec is None:
        build_index()
    if _vec is None:
        return []
    with _lock:
        qv = _vec.transform([query])
        sims = linear_kernel(qv, _mat).ravel()
        order = sims.argsort()[::-1]
        out = []
        for i in order:
            c = _chunks[i]
            if kind and c["kind"] != kind:
                continue
            if sims[i] <= 0.01:
                continue
            out.append({
                "source": c["source"], "locator": c["locator"], "heading": c["heading"],
                "score": round(float(sims[i]), 3), "kind": c["kind"],
                "citation": f"{c['source']}, {c['locator']}",
                "text": c["text"][:700],
                "pump_id": c.get("pump_id"), "fault": c.get("fault"),
            })
            if len(out) >= k:
                break
    return out
