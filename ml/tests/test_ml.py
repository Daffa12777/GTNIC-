"""Tes ML: pemuat format UCI, pelatihan, dan API inferensi (memakai data demo sintetis berformat UCI)."""
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import make_demo_data  # noqa: E402
from data import COMPONENTS, feature_names, load_uci, severity  # noqa: E402


@pytest.fixture(scope="module")
def demo(tmp_path_factory):
    d = tmp_path_factory.mktemp("uci")
    make_demo_data.make(d, n=600, seed=3)
    return d


def test_loader_shapes_and_labels(demo):
    X, Y = load_uci(demo)
    assert X.shape == (600, 34)
    assert list(X.columns) == feature_names()
    for c, spec in COMPONENTS.items():
        assert set(Y[c].unique()) <= set(spec["levels"])
    assert np.isfinite(X.to_numpy()).all()


def test_severity_scale():
    assert severity("cooler", 100) == 0 and severity("cooler", 3) == 1
    assert severity("valve", 100) == 0 and severity("valve", 73) == 1
    assert 0 < severity("valve", 90) < severity("valve", 80) < 1


def test_loader_rejects_mismatched_profile(tmp_path):
    make_demo_data.make(tmp_path, n=50, seed=1)
    (tmp_path / "profile.txt").write_text("100\t100\t0\t130\t0\n", encoding="utf-8")
    with pytest.raises(ValueError):
        load_uci(tmp_path)


def test_train_and_predict(demo, tmp_path, monkeypatch):
    import app as service
    import train

    monkeypatch.setattr(train, "ART", tmp_path)
    monkeypatch.setattr(train, "HERE", tmp_path)
    monkeypatch.setattr("sys.argv", ["train.py", "--data", str(demo)])
    train.main()
    assert (tmp_path / "model.joblib").exists() and (tmp_path / "profiles.json").exists()

    monkeypatch.setattr(service, "ART", tmp_path)
    service._m = None
    from fastapi.testclient import TestClient

    client = TestClient(service.app)
    X, Y = load_uci(demo)
    healthy = np.where((Y[["cooler", "valve", "pump", "accumulator"]].to_numpy() == [100, 100, 0, 130]).all(axis=1))[0][0]
    r = client.post("/predict", json={"features": X.iloc[healthy].to_dict()}).json()
    assert all(c["severity"] == 0 for c in r["components"].values())

    bad = int(np.where(Y["cooler"].to_numpy() == 3)[0][0])
    r = client.post("/predict", json={"features": X.iloc[bad].to_dict()}).json()
    assert r["components"]["cooler"]["severity"] == 1.0
    assert client.post("/predict", json={"features": {"PS1_mean": 1.0}}).status_code == 422
