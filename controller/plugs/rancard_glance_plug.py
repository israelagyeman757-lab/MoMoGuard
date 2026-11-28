"""Rancard Glance integration: reverse number lookup / fraud-intelligence check.

Central backend for Innovate Reps and SIM Toolkit reverse lookup (PRD §9).
See docs/rancard-glance-integration.md for what Rancard must supply before
a non-stub live client is possible.
"""

import json
import os
import urllib.error
import urllib.parse
import urllib.request

# Demo dataset — same numbers as CONTRACT.md and GlancePlug canned reputation.
_CANNED_LOOKUP = {
    "0240000009": {
        "status": "flagged", "risk": "high",
        "history": ["reported for an advance-fee scam pattern (demo data)"],
        "message": "Glance has flagged this number. That may be a warning "
                    "sign, not proof it is unsafe.",
    },
    "0240000005": {
        "status": "flagged", "risk": "high",
        "history": ["reported for a fake-reversal scam pattern (demo data)"],
        "message": "Glance has flagged this number. That may be a warning "
                    "sign, not proof it is unsafe.",
    },
    "0240000001": {
        "status": "clear", "risk": "low", "history": [],
        "message": "No threat history found for this number. That is not "
                    "proof it is safe.",
    },
    "0000000000": {
        "status": "error", "risk": "unavailable", "history": [],
        "message": "Glance could not be reached. That is not proof it is "
                    "safe or unsafe.",
    },
}

_LIVE_NOTE = (
    "Live Glance requires RANCARD_GLANCE_BASE_URL and RANCARD_GLANCE_LOOKUP_PATH "
    "from Rancard's official API documentation (see docs/rancard-glance-integration.md). "
    "This response is stub data, not a real Glance call."
)


class RancardGlancePlug:
    source = "rancard_stub"

    def __init__(self):
        self.reset()

    def reset(self) -> None:
        pass

    @property
    def mode(self) -> str:
        return os.environ.get("RANCARD_GLANCE_MODE", "stub")

    def reverse_lookup(self, number: str) -> dict:
        if self.mode == "live":
            return self._live_lookup(number)
        return self._stub_lookup(number)

    def _stub_lookup(self, number: str) -> dict:
        canned = _CANNED_LOOKUP.get(number)
        if canned:
            return {"number": number, **canned, "source": self.source}
        return {
            "number": number, "status": "no_results", "risk": "unknown",
            "history": [],
            "message": "No Glance record found for this number. "
                        "That is not proof it is safe.",
            "source": self.source,
        }

    def _live_lookup(self, number: str) -> dict:
        base = (os.environ.get("RANCARD_GLANCE_BASE_URL") or "").rstrip("/")
        path = (os.environ.get("RANCARD_GLANCE_LOOKUP_PATH") or "").strip()
        api_key = os.environ.get("RANCARD_GLANCE_API_KEY") or ""
        if not base or not path or not path.startswith("/"):
            stub = self._stub_lookup(number)
            return {**stub, "live_attempted": False, "live_note": _LIVE_NOTE}

        url = base + path
        if "{number}" in url:
            url = url.replace("{number}", urllib.parse.quote(number, safe=""))
        elif "?" in url:
            url = f"{url}&number={urllib.parse.quote(number, safe='')}"
        else:
            url = f"{url}?number={urllib.parse.quote(number, safe='')}"

        headers = {"Accept": "application/json"}
        if api_key:
            auth_style = os.environ.get("RANCARD_GLANCE_AUTH_STYLE", "bearer").lower()
            if auth_style == "x-api-key":
                headers["X-Api-Key"] = api_key
            else:
                headers["Authorization"] = f"Bearer {api_key}"

        timeout_s = float(os.environ.get("RANCARD_GLANCE_TIMEOUT_S", "8"))
        req = urllib.request.Request(url, headers=headers, method="GET")
        try:
            with urllib.request.urlopen(req, timeout=timeout_s) as resp:
                raw = json.loads(resp.read().decode("utf-8"))
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError, ValueError):
            stub = self._stub_lookup(number)
            stub["status"] = "error"
            stub["risk"] = "unavailable"
            stub["message"] = (
                "Glance could not be reached. That is not proof it is safe or unsafe."
            )
            return {**stub, "live_attempted": True, "live_note": _LIVE_NOTE}

        # Until Rancard documents the schema, pass through only if caller configured
        # RANCARD_GLANCE_NORMALIZE=json mapping env — otherwise stub fallback.
        normalize = os.environ.get("RANCARD_GLANCE_NORMALIZE", "").strip().lower()
        if normalize not in ("passthrough", "1", "true", "yes"):
            stub = self._stub_lookup(number)
            return {
                **stub,
                "live_attempted": True,
                "live_note": (
                    "A live HTTP call succeeded but response normalization is not "
                    "configured. Set RANCARD_GLANCE_NORMALIZE=passthrough only after "
                    "Rancard confirms field mapping — until then stub data is shown."
                ),
            }

        return {
            "number": number,
            "status": raw.get("status", "no_results"),
            "risk": raw.get("risk", "unknown"),
            "history": raw.get("history") or [],
            "message": raw.get("message") or "Lookup completed.",
            "source": "rancard_live",
            "live_attempted": True,
            "raw_fields_present": sorted(raw.keys()),
        }