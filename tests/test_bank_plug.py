from controller.plugs.bank_plug import BankPlug

AUNTY = "0240000001"
KOFI = "0240000002"


def test_send_moves_pretend_money():
    bank = BankPlug()
    before_a = bank.balance(AUNTY)
    before_k = bank.balance(KOFI)
    result = bank.send(AUNTY, KOFI, 100, unique_key="k1")
    assert result["status"] == "ok"
    assert bank.balance(AUNTY) == before_a - 100
    assert bank.balance(KOFI) == before_k + 100
    assert bank.history(AUNTY)[-1]["amount"] == 100


def test_duplicate_key_is_refused():
    bank = BankPlug()
    bank.send(AUNTY, KOFI, 100, unique_key="k1")
    balance_after_first = bank.balance(AUNTY)
    again = bank.send(AUNTY, KOFI, 100, unique_key="k1")
    assert again["status"] == "refused"
    assert bank.balance(AUNTY) == balance_after_first


def test_insufficient_balance_is_refused():
    bank = BankPlug()
    before = bank.balance(AUNTY)
    result = bank.send(AUNTY, KOFI, before + 1, unique_key="k2")
    assert result["status"] == "insufficient"
    assert bank.balance(AUNTY) == before


def test_unknown_account_is_refused():
    bank = BankPlug()
    result = bank.send(AUNTY, "0000000000", 10, unique_key="k3")
    assert result["status"] == "unknown_account"


def test_reset_restores_starting_state():
    bank = BankPlug()
    starting_balance = bank.balance(AUNTY)
    starting_history_len = len(bank.history())
    bank.send(AUNTY, KOFI, 100, unique_key="k1")
    bank.reset()
    assert bank.balance(AUNTY) == starting_balance
    assert len(bank.history()) == starting_history_len


def test_pair_max_safe_uses_history():
    bank = BankPlug()
    assert bank.pair_max_safe(AUNTY, KOFI) == 100
    assert bank.pair_max_safe(AUNTY, "0240000006") == 0
    assert bank.has_safe_history(AUNTY, KOFI) is True
    assert bank.has_safe_history(AUNTY, "0240000005") is False


def test_everything_is_labelled_simulated():
    bank = BankPlug()
    assert bank.source == "simulated"