"""Ephemeral in-memory state for demo/mock mode.

Stores user-driven mutations (status changes, stock dispatches, transfers, etc.)
within a backend process session so they persist across API calls without a real DB.
All state resets on server restart — expected behaviour for demo mode.
"""

# ── Sales order status overrides ─────────────────────────────────────────────
# order_id (int) → status string (e.g. "CONFIRMED", "DISPATCHED")
_order_status: dict[int, str] = {}


def get_order_status_override(order_id: int):
    """Return the in-session status override for order_id, or None."""
    return _order_status.get(order_id)


def set_order_status(order_id: int, status: str) -> None:
    """Persist a status override for the current server session."""
    _order_status[order_id] = status


def get_all_status_overrides() -> dict[int, str]:
    """Return a snapshot of all current status overrides."""
    return dict(_order_status)


# ── Distributor stock dispatches ──────────────────────────────────────────────
# List of dispatch records: [{distributor_id, distributor_name, sku_code, sku_name,
#   qty, unit, value, dispatch_date, dispatched_by, order_ref, notes}]
_distributor_dispatches: list[dict] = []


def add_distributor_dispatch(record: dict) -> None:
    """Record a new stock dispatch to a distributor."""
    _distributor_dispatches.append(record)


def get_distributor_dispatches() -> list[dict]:
    """Return all distributor dispatch records for this session."""
    return list(_distributor_dispatches)


# ── Internal stock transfers ──────────────────────────────────────────────────
# List of transfer records: [{transfer_id, from_godown_id, from_godown_name,
#   to_godown_id, to_godown_name, sku_code, sku_name, qty, unit, transfer_date,
#   reason, authorized_by, status, accounting_entry}]
_stock_transfers: list[dict] = []
_transfer_seq: int = 1000


def add_stock_transfer(record: dict) -> dict:
    """Record an internal stock transfer; auto-assigns a transfer ID."""
    global _transfer_seq
    _transfer_seq += 1
    record = {**record, "transfer_id": f"TRF-{_transfer_seq}"}
    _stock_transfers.append(record)
    return record


def get_stock_transfers() -> list[dict]:
    """Return all internal transfer records for this session."""
    return list(reversed(_stock_transfers))
