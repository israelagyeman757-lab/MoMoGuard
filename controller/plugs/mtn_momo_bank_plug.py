"""Sandbox-backed bank plug: talks to the InnoFemme hackathon MTN MoMo sandbox.

This is a *real* HTTP client against the organisers' simulated Ghana mobile
money world (NOT the real MTN developer portal, NOT real money):

    docs: https://hackathon.innofemme.org/t/team-08/docs
    base: https://hackathon.innofemme.org/api/w/team-08

Confirmed from the sandbox docs:
  - MoMo API root:        {base}/momo/mtn   (also /momo/telecel, /momo/at)
  - Network API:          {base}/network/mtn/v1/subscribers/<msisdn>
  - Network token:        {base}/network/mtn/token
  - Auth: HTTP Basic (CLIENT_ID:API_KEY), or a bearer token fetched from a
    token endpoint. Credentials come from the MTN back office
    (/t/team-08/telco/mtn -> "Give a company API access" -> "Issue credentials").

The exact MoMo money-movement paths (transfer / request-to-pay / balance) can
vary by sandbox build, so they are env-configurable (MTN_MOMO_*_PATH below)
with MTN-MoMo-Open-API-style defaults. If the live docs show different paths,
set the env vars -- no code change needed.

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
import copy
import os
import uuid
from datetime import datetime, timezone

import httpx

SANDBOX_BASE_URL = os.environ.get(
    "MTN_SANDBOX_BASE_URL", "https://hackathon.innofemme.org/api/w/team-08"
)
MOMO_CLIENT_ID = os.environ.get("MTN_MOMO_CLIENT_ID", "")
MOMO_API_KEY = os.environ.get("MTN_MOMO_API_KEY", "")

# Money-movement paths, relative to {base}/momo/mtn. Override if the live
# sandbox docs differ from these MTN-MoMo-Open-API-style defaults.
TRANSFER_PATH = os.environ.get("MTN_MOMO_TRANSFER_PATH", "/v1_0/transfer")
TRANSFER_STATUS_PATH = os.environ.get(
    "MTN_MOMO_TRANSFER_STATUS_PATH", "/v1_0/transfer/{reference_id}"
)
BALANCE_PATH = os.environ.get("MTN_MOMO_BALANCE_PATH", "/v1_0/account/balance")
TOKEN_PATH = os.environ.get("MTN_MOMO_TOKEN_PATH", "/token")

NETWORK_SUBSCRIBER_PATH = os.environ.get(
    "MTN_NETWORK_SUBSCRIBER_PATH", "/network/mtn/v1/subscribers/{msisdn}"
)
NETWORK_TOKEN_PATH = os.environ.get("MTN_NETWORK_TOKEN_PATH", "/network/mtn/token")

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
        self._bearer_token: str | None = None
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
        if unique_key in self._used_keys:
            return {"status": "refused", "reason": "duplicate_key"}
        if amount <= 0:
            return {"status": "refused", "reason": "invalid_amount"}

        reference_id = unique_key or uuid.uuid4().hex
        body = {
            "amount": str(amount),
            "currency": "GHS",
            "externalId": reference_id,
            "payer": {"partyIdType": "MSISDN", "partyId": sender},
            "payee": {"partyIdType": "MSISDN", "partyId": recipient},
            "payerMessage": "MoMoGuard transfer",
            "payeeNote": "MoMoGuard transfer",
        }
        try:
            resp = self._client.post(
                self._momo_url(TRANSFER_PATH),
                json=body,
                headers={
                    **self._headers(),
                    "X-Reference-Id": reference_id,
                    "X-Target-Environment": sender,
                },
            )
        except httpx.HTTPError as exc:
            return {"status": "error", "reason": str(exc)}

        if resp.status_code not in (200, 201, 202):
            return {"status": "refused", "reason": f"sandbox_http_{resp.status_code}"}

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
