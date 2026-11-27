"""Sandbox-backed bank plug: talks to the InnoFemme hackathon MTN MoMo sandbox.

This is a *real* HTTP client against the organisers' simulated Ghana mobile
money world (NOT the real MTN developer portal, NOT real money):

    docs: https://hackathon.innofemme.org/t/team-08/docs
    base: https://hackathon.innofemme.org/api/w/team-08

Confirmed by hitting the live sandbox with issued credentials (HTTP Basic,
CLIENT_ID:API_KEY -- no separate token step was needed; it mirrors the real
MTN MoMo Open API shape):
  - Network API:    GET  {base}/network/mtn/v1/subscribers/<msisdn>
                     -> real subscriber lookup (404 "is not a MTN subscriber"
                        for an unseeded number -- a genuine business
                        response, not an auth/path error)
  - Collections:    GET  {base}/momo/mtn/collection/v1_0/account/balance
                     POST {base}/momo/mtn/collection/v1_0/requesttopay
                     (body needs amount + payer.partyId) -- debits a
                     subscriber (the "payer") into this company's merchant
                     wallet
  - Disbursements:  POST {base}/momo/mtn/disbursement/v1_0/transfer
                     (body needs amount + payee.partyId) -- pays a
                     subscriber (the "payee") out of the merchant wallet
  - Credentials come from the MTN back office (/t/team-08/telco/mtn ->
    "Give a company API access" -> "Issue credentials").

NOTE: both money-movement calls go through this company's *merchant wallet*
(a sandbox concept, not a free-text field) -- see `send()` docstring for what
that means for a plain customer-to-customer transfer, and for the current
known limitation when no merchant is linked yet.

Paths are still env-configurable (MTN_MOMO_*_PATH below) in case a different
team/sandbox build uses different ones -- no code change needed, just set
the env var.

Interface contract: same as BankPlug (account/balance/history/send/
pair_max_safe/has_safe_history/distinct_senders/reset), so the controller
does not need to change to use this plug instead of the simulated one.

Because the sandbox does not expose a generic "history for this pair" query,
pair/typical-amount history is tracked locally for transfers made through
this process (same approach the simulated plug uses for its seed data), while
balance and subscriber identity are always read live from the sandbox.
"""

from __future__ import annotations

import base64
import os
import uuid
from datetime import datetime, timezone

import httpx

SANDBOX_BASE_URL = os.environ.get(
    "MTN_SANDBOX_BASE_URL", "https://hackathon.innofemme.org/api/w/team-08"
)
MOMO_CLIENT_ID = os.environ.get("MTN_MOMO_CLIENT_ID", "")
MOMO_API_KEY = os.environ.get("MTN_MOMO_API_KEY", "")

# Money-movement paths, relative to {base}/momo/mtn. Confirmed live against
# the team-08 sandbox (see module docstring); override if another sandbox
# build uses different ones.
REQUESTTOPAY_PATH = os.environ.get("MTN_MOMO_REQUESTTOPAY_PATH", "/collection/v1_0/requesttopay")
REQUESTTOPAY_STATUS_PATH = os.environ.get(
    "MTN_MOMO_REQUESTTOPAY_STATUS_PATH", "/collection/v1_0/requesttopay/{reference_id}"
)
TRANSFER_PATH = os.environ.get("MTN_MOMO_TRANSFER_PATH", "/disbursement/v1_0/transfer")
TRANSFER_STATUS_PATH = os.environ.get(
    "MTN_MOMO_TRANSFER_STATUS_PATH", "/disbursement/v1_0/transfer/{reference_id}"
)
BALANCE_PATH = os.environ.get("MTN_MOMO_BALANCE_PATH", "/collection/v1_0/account/balance")

NETWORK_SUBSCRIBER_PATH = os.environ.get(
    "MTN_NETWORK_SUBSCRIBER_PATH", "/network/mtn/v1/subscribers/{msisdn}"
)

REQUEST_TIMEOUT_S = float(os.environ.get("MTN_SANDBOX_TIMEOUT_S", "10"))


class MtnMomoBankPlug:
    """Real sandbox bank plug (MTN MoMo via the InnoFemme hackathon sandbox)."""

    source = "mtn_sandbox"

    def __init__(
        self,
        base_url: str | None = None,
        client_id: str | None = None,
        api_key: str | None = None,
        client: httpx.Client | None = None,
    ):
        self.base_url = (base_url or SANDBOX_BASE_URL).rstrip("/")
        self.client_id = client_id or MOMO_CLIENT_ID
        self.api_key = api_key or MOMO_API_KEY
        if not self.client_id or not self.api_key:
            raise RuntimeError(
                "MTN_MOMO_CLIENT_ID / MTN_MOMO_API_KEY are required for "
                "MtnMomoBankPlug. Issue credentials at the MTN back office "
                "(/t/team-08/telco/mtn) and put them in your local .env "
                "(see .env.example)."
            )
        self._client = client or httpx.Client(timeout=REQUEST_TIMEOUT_S)
        self.reset()

    def reset(self) -> None:
        """Clear the local pair/typical-amount cache (sandbox state itself is
        not reset by this -- use the sandbox's own seeding/reset if offered)."""
        self._history: list[dict] = []
        self._used_keys: set[str] = set()
        self._account_cache: dict[str, dict] = {}

    # -- auth -----------------------------------------------------------

    def _basic_auth_header(self) -> str:
        token = base64.b64encode(f"{self.client_id}:{self.api_key}".encode()).decode()
        return f"Basic {token}"

    def _headers(self) -> dict:
        return {
            "Authorization": self._basic_auth_header(),
            "Content-Type": "application/json",
            "X-Client-Id": self.client_id,
        }

    def _momo_url(self, path: str, **fmt) -> str:
        return f"{self.base_url}/momo/mtn{path.format(**fmt)}"

    def _network_url(self, path: str, **fmt) -> str:
        return f"{self.base_url}{path.format(**fmt)}"

    # -- subscriber / account lookup -------------------------------------

    def account(self, number: str) -> dict | None:
        if number in self._account_cache:
            return self._account_cache[number]
        try:
            resp = self._client.get(
                self._network_url(NETWORK_SUBSCRIBER_PATH, msisdn=number),
                headers=self._headers(),
            )
        except httpx.HTTPError:
            return None
        if resp.status_code != 200:
            return None
        data = resp.json()
        account = {
            "name": data.get("name") or data.get("subscriber_name") or number,
            "balance": self.balance(number),
            "phone_type": data.get("phone_type", "unknown"),
            "raw": data,
        }
        self._account_cache[number] = account
        return account

    def balance(self, number: str) -> float | None:
        try:
            resp = self._client.get(
                self._momo_url(BALANCE_PATH),
                headers={**self._headers(), "X-Target-Environment": number},
            )
        except httpx.HTTPError:
            return None
        if resp.status_code != 200:
            return None
        data = resp.json()
        value = data.get("availableBalance", data.get("balance"))
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    # -- local pair history (see module docstring) -----------------------

    def history(self, number: str | None = None) -> list[dict]:
        if number is None:
            return list(self._history)
        return [t for t in self._history if t["sender"] == number or t["recipient"] == number]

    def pair_max_safe(self, sender: str, recipient: str) -> float:
        amounts = [
            t["amount"] for t in self._history if t["sender"] == sender and t["recipient"] == recipient
        ]
        return max(amounts, default=0.0)

    def has_safe_history(self, sender: str, recipient: str) -> bool:
        return self.pair_max_safe(sender, recipient) > 0

    def distinct_senders(self, recipient: str) -> int:
        return len({t["sender"] for t in self._history if t["recipient"] == recipient})

    # -- money movement ---------------------------------------------------

    def send(self, sender: str, recipient: str, amount: float, unique_key: str) -> dict:
        """Move money sender -> recipient via the sandbox's real MoMo API.

        The sandbox's MoMo API (like the real MTN MoMo Open API) has no
        single "transfer between two subscribers" call -- money only moves
        in or out of *this company's merchant wallet*. A customer-to-customer
        payment is therefore two legs through that wallet:
          1. collection requesttopay: debit `sender` into the merchant wallet
          2. disbursement transfer:   credit `recipient` from the merchant wallet
        If leg 1 fails, nothing is attempted for leg 2 and nothing is ever
        reported as sent (CONTRACT.md: a failed request is never shown as a
        successful payment). Both legs require this company's credentials to
        have a merchant wallet linked in the sandbox back office; without
        one, leg 1 fails with a clear "no merchant wallet" error.
        """
        if unique_key in self._used_keys:
            return {"status": "refused", "reason": "duplicate_key"}
        if amount <= 0:
            return {"status": "refused", "reason": "invalid_amount"}

        reference_id = unique_key or uuid.uuid4().hex
        amount_str = str(amount)

        collect = self._post_momo(
            REQUESTTOPAY_PATH,
            reference_id=f"{reference_id}-in",
            target_environment=sender,
            body={
                "amount": amount_str,
                "currency": "GHS",
                "externalId": reference_id,
                "payer": {"partyIdType": "MSISDN", "partyId": sender},
                "payerMessage": "MoMoGuard transfer",
                "payeeNote": "MoMoGuard transfer",
            },
        )
        if collect["status"] != "ok":
            return {"status": "refused", "reason": f"collection_{collect['reason']}"}

        disburse = self._post_momo(
            TRANSFER_PATH,
            reference_id=f"{reference_id}-out",
            target_environment=recipient,
            body={
                "amount": amount_str,
                "currency": "GHS",
                "externalId": reference_id,
                "payee": {"partyIdType": "MSISDN", "partyId": recipient},
                "payerMessage": "MoMoGuard transfer",
                "payeeNote": "MoMoGuard transfer",
            },
        )
        if disburse["status"] != "ok":
            # Collected from sender but couldn't pay recipient: never report
            # success. A real integration would reverse/refund here; the
            # sandbox has no documented refund call yet.
            return {"status": "refused", "reason": f"disbursement_{disburse['reason']}"}

        self._used_keys.add(unique_key)
        tx = {
            "id": reference_id,
            "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "sender": sender,
            "recipient": recipient,
            "amount": amount,
            "balance_before": None,
        }
        self._history.append(tx)
        return {"status": "ok", "transaction": tx, "source": self.source}

    def _post_momo(self, path: str, reference_id: str, target_environment: str, body: dict) -> dict:
        try:
            resp = self._client.post(
                self._momo_url(path),
                json=body,
                headers={
                    **self._headers(),
                    "X-Reference-Id": reference_id,
                    "X-Target-Environment": target_environment,
                },
            )
        except httpx.HTTPError as exc:
            return {"status": "error", "reason": str(exc)}
        if resp.status_code not in (200, 201, 202):
            return {"status": "error", "reason": f"http_{resp.status_code}"}
        return {"status": "ok"}

    def transfer_status(self, reference_id: str) -> dict | None:
        """Look up a previously submitted transfer by its reference id."""
        try:
            resp = self._client.get(
                self._momo_url(TRANSFER_STATUS_PATH, reference_id=reference_id),
                headers=self._headers(),
            )
        except httpx.HTTPError:
            return None
        if resp.status_code != 200:
            return None
        return resp.json()

    def ping(self) -> dict:
        """Lightweight connectivity check: can we reach the sandbox and auth?

        Used by the smoke test; does not move money.
        """
        try:
            resp = self._client.get(
                self._network_url(NETWORK_SUBSCRIBER_PATH, msisdn="0241234567"),
                headers=self._headers(),
            )
        except httpx.HTTPError as exc:
            return {"ok": False, "error": str(exc)}
        return {
            "ok": resp.status_code < 500,
            "status_code": resp.status_code,
            "url": str(resp.request.url),
        }
