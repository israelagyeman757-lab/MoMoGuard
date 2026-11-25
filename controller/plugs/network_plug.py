"""SIM / device context. STUB: simulated until the sandbox shows otherwise.

Statuses: detected | not_detected | unavailable | error.
Missing data never means safe or fraud.
"""


class NetworkPlug:
    source = "simulated"

    def __init__(self):
        self.reset()

    def reset(self) -> None:
        # Canned demo patterns: Stranger and Mum had recent SIM changes.
        self._recent_sim_changes = {"0240000005", "0240000007"}

    def sim_recently_changed(self, number: str) -> dict:
        detected = number in self._recent_sim_changes
        return {"status": "detected" if detected else "not_detected",
                "source": self.source, "confidence": "simulated"}

    def phone_type(self, number: str) -> dict:
        return {"status": "unavailable", "source": self.source}