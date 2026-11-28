from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class CommunityStore(ABC):
    """Persistence for community scam reports and moderation metadata."""

    @property
    @abstractmethod
    def backend(self) -> str:
        """Short label for logs: sqlite, supabase, etc."""

    @abstractmethod
    def insert_report(self, row: dict[str, Any]) -> bool:
        """Insert one report. Returns False if dedupe key already exists."""

    @abstractmethod
    def reports_for_number(self, number: str) -> list[dict[str, Any]]:
        """All stored reports for `number`, newest first."""

    @abstractmethod
    def list_reports(self) -> list[dict[str, Any]]:
        """All reports (demo / moderator views)."""

    @abstractmethod
    def reset(self) -> None:
        """Wipe community data (demo reset)."""