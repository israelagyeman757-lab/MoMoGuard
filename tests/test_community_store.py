from controller.community.factory import create_community_store
from controller.community.sqlite_store import SQLiteCommunityStore
from controller.plugs.glance_plug import GlancePlug


def _sample_row(**overrides):
    base = {
        "ts": "2026-11-28T10:00:00+00:00",
        "day": "2026-11-28",
        "reporter_id": "abcd1234abcd1234",
        "number": "0240000999",
        "trick": "community_reported",
        "description": "",
        "community": "",
        "incident_time": "",
        "claimed_identity": "",
        "request_type": "",
        "lost_money": None,
        "channel": "",
        "verification_state": "unverified",
    }
    base.update(overrides)
    return base


def test_sqlite_store_dedupes_per_day():
    store = SQLiteCommunityStore(":memory:")
    assert store.insert_report(_sample_row()) is True
    assert store.insert_report(_sample_row()) is False
    assert len(store.reports_for_number("0240000999")) == 1


def test_sqlite_store_reset_clears_rows():
    store = SQLiteCommunityStore(":memory:")
    store.insert_report(_sample_row())
    store.reset()
    assert store.list_reports() == []


def test_factory_defaults_to_sqlite_without_supabase_env():
    store = create_community_store()
    assert isinstance(store, SQLiteCommunityStore)


def test_factory_selects_supabase_when_env_set(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")
    store = create_community_store()
    assert store.backend == "supabase"


def test_glance_plug_uses_injected_sqlite_store():
    store = SQLiteCommunityStore(":memory:")
    g = GlancePlug(store=store)
    g.report("0240000100", "community_reported", "r1")
    assert len(g.local_reports()) == 1
    g.reset()
    assert g.local_reports() == []
