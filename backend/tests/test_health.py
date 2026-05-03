from fastapi.testclient import TestClient

from paperloom.main import app


def test_health_returns_bool_flags():
    client = TestClient(app)
    r = client.get("/api/health")
    assert r.status_code == 200
    data = r.json()
    assert set(data.keys()) == {"ollama", "opf", "opf_auto_install"}
    assert isinstance(data["ollama"], bool)
    assert isinstance(data["opf"], bool)
    assert isinstance(data["opf_auto_install"], bool)
