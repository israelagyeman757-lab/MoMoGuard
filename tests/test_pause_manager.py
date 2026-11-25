import asyncio

import pytest

from controller.pause_manager import PauseManager

SENDER = "0240000001"
RECIPIENT = "0240000002"
AMOUNT = 300.0


@pytest.fixture
def pm():
    return PauseManager(timeout_s=180)


async def test_pass_releases_payment_once(pm):
    ref = await pm.pause(SENDER, RECIPIENT, AMOUNT)
    result = await pm.submit_result(ref, SENDER, "release")
    assert result["status"] == "released"
    assert result["payment"] == {
        "sender": SENDER, "recipient": RECIPIENT, "amount": AMOUNT,
    }


async def test_fail_cancels_payment(pm):
    ref = await pm.pause(SENDER, RECIPIENT, AMOUNT)
    result = await pm.submit_result(ref, SENDER, "cancel")
    assert result["status"] == "cancelled"
    after = await pm.resume(ref, SENDER)
    assert after["status"] == "cancelled"


async def test_no_answer_expires_and_never_releases():
    pm = PauseManager(timeout_s=0.05)
    ref = await pm.pause(SENDER, RECIPIENT, AMOUNT)
    await asyncio.sleep(0.15)
    after = await pm.resume(ref, SENDER)
    assert after["status"] == "expired"
    late = await pm.submit_result(ref, SENDER, "release")
    assert late["status"] == "refused"


async def test_max_three_attempts_then_cancelled(pm):
    ref = await pm.pause(SENDER, RECIPIENT, AMOUNT)
    first = await pm.submit_result(ref, SENDER, "hold")
    assert first["status"] == "pending"
    assert first["attempts_left"] == 2
    second = await pm.submit_result(ref, SENDER, "hold")
    assert second["attempts_left"] == 1
    third = await pm.submit_result(ref, SENDER, "hold")
    assert third["status"] == "cancelled"
    assert third["attempts_left"] == 0
    fourth = await pm.submit_result(ref, SENDER, "release")
    assert fourth["status"] == "refused"


async def test_wrong_sender_is_refused(pm):
    ref = await pm.pause(SENDER, RECIPIENT, AMOUNT)
    result = await pm.submit_result(ref, "0240000099", "release")
    assert result["status"] == "refused"
    after = await pm.resume(ref, SENDER)
    assert after["status"] == "pending"


async def test_replay_of_released_reference_is_refused(pm):
    ref = await pm.pause(SENDER, RECIPIENT, AMOUNT)
    await pm.submit_result(ref, SENDER, "release")
    replay = await pm.submit_result(ref, SENDER, "release")
    assert replay["status"] == "refused"


async def test_reference_is_bound_to_recipient_and_amount(pm):
    ref = await pm.pause(SENDER, RECIPIENT, AMOUNT)
    record = pm.get(ref)
    assert record["recipient"] == RECIPIENT
    assert record["amount"] == AMOUNT


async def test_unknown_reference_is_refused(pm):
    result = await pm.submit_result("no-such-ref", SENDER, "release")
    assert result["status"] == "refused"


async def test_reset_clears_paused_payments(pm):
    ref = await pm.pause(SENDER, RECIPIENT, AMOUNT)
    await pm.reset()
    assert pm.get(ref) is None


async def test_expiry_notifies_callback():
    expired_refs = []
    pm = PauseManager(timeout_s=0.05, on_expire=expired_refs.append)
    ref = await pm.pause(SENDER, RECIPIENT, AMOUNT)
    await asyncio.sleep(0.15)
    assert expired_refs == [ref]