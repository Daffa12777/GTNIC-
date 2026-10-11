"""Latih ulang model dari data simulasi:  python scripts/train.py"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app import ml

_, m = ml.train(save=True)
import json
print(json.dumps(m, indent=2, ensure_ascii=False))
