import os
import sys
import tempfile
from pathlib import Path

os.environ["DISABLE_LOOP"] = "1"
os.environ["DB_PATH"] = str(Path(tempfile.mkdtemp()) / "test.db")
os.environ["AUTO_AGENT"] = "false"
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
