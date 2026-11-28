import pytest
from fastapi.testclient import TestClient

from controller.app import create_app
from controller.momoguard_store import MoMoGuardStore
from controller.seed import seed_demo


@pytest.fixture()
def client():
    store = MoMoGuardStore(":memory:")
    seed_demo(store)
    app = create_app(store=store, seed=False)
    return TestClient(app)