"""Rancard Glance integration: reverse number lookup / fraud-intelligence check.

STATUS: STUB — no live HTTP call is made by this module.

Rancard's own site confirms Glance is a real product (checked 2026-11-28):
- https://www.rancard.com/products/glance/ — "Real-Time Number Lookup &
  Verification: check the threat status, risk level, and history of any
  mobile number instantly", plus centralised threat reporting and "API
  Integration... through well-structured API documentation".
- https://www.rancard.com/developers/ — directs integrators to "work with
  the Rancard team to receive the product-specific credentials and reference
  documentation you need." No public endpoint paths, request/response JSON
  shapes, or auth header format were published at the above URLs as of this
  build.

Because the actual wire contract isn't public, this module does not attempt
to guess it. It exposes a stable `reverse_lookup(number)` interface the rest
of the app can call today (new Reverse Number Lookup UI, in both the
Innovate Reps console and the feature-phone SIM Toolkit), backed by a small,
clearly-labelled canned dataset — not a real Glance response. `_live_lookup`
is where a real client goes once Rancard's actual reference docs are
available; nothing else in the app should need to change when that happens.

RANCARD_GLANCE_MODE defaults to "stub". Setting it to "live" raises
immediately with a clear message — do not flip it until `_live_lookup` is
actually implemented against confirmed Rancard documentation.
"""

import os

# Demo dataset only — intentionally the same numbers CONTRACT.md's "Demo
# accounts" table and controller/plugs/glance_plug.py already use, so a
# Reverse Number Lookup and the existing community-reports demo tell a
# consistent story without inventing a second cast of numbers.
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


class RancardGlancePlug:
    source = "rancard_stub"

    def __init__(self):
        # Read lazily so .env changes during a dev session still take effect
        # without re-importing the module.
        self.reset()

    def reset(self) -> None:
        pass  # stateless stub; kept for parity with the other plugs'
        # /reset-demo contract, in case a future real client caches anything.

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
        raise NotImplementedError(
            "RANCARD_GLANCE_MODE=live was set, but no real Rancard Glance "
            "API client is implemented yet. Rancard's public pages confirm "
            "Glance's capabilities (number lookup/verification, threat "
            "status, risk level, history) but not its request/response "
            "schema, endpoint paths, or auth header format -- get those "
            "directly from Rancard, then implement this method against them "
            "before using live mode. See the module docstring for sources "
            "checked and what was/was not found."
        )
