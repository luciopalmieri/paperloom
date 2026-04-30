from fastapi.testclient import TestClient

from src.main import app


def test_health_returns_two_bools():
    client = TestClient(app)
    r = client.get("/api/health")
    assert r.status_code == 200
    data = r.json()
    assert set(data.keys()) == {"ollama", "opf"}
    assert isinstance(data["ollama"], bool)
    assert isinstance(data["opf"], bool)
