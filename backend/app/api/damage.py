"""
Damage Recording API — InvenIQ
Two damage workflow types:
  1. GRN / Inward Damage   — item found damaged AFTER goods are received into stock
  2. Transit Damage on SO  — item damaged in transit WHILE dispatching a sales order

Both types generate full accounting journal entries.
GRN damage triggers inventory write-down; transit damage adjusts SO value and
optionally initiates an insurance claim receivable.
"""
import datetime
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Damage Recording"])

# ── Damage types / subtypes ────────────────────────────────────────────────────
DAMAGE_TYPES = [
    "Physical Damage",
    "Moisture / Water Damage",
    "Manufacturing Defect",
    "Short Supply / Missing Units",
    "Packaging Damage",
    "Handling Error",
]

TRANSIT_DAMAGE_TYPES = [
    "Vehicle Accident",
    "Improper Packaging",
    "Overloading / Pressure Damage",
    "Theft / Pilferage",
    "Weather Exposure",
    "Rough Handling by Carrier",
]

SO_ADJUSTMENT_TYPES = [
    "Reduce Invoice Qty",
    "Raise Credit Note",
    "Re-dispatch Replacement",
    "Cancel SO Line",
]

# ── Session counters + in-memory store (demo) ──────────────────────────────────
_GRN_COUNTER     = [300]
_TRANSIT_COUNTER = [300]
_SESSION_GRN_DAMAGES:     list[dict] = []
_SESSION_TRANSIT_DAMAGES: list[dict] = []


def _next_grn_id() -> str:
    _GRN_COUNTER[0] += 1
    return f"GD-2026-{_GRN_COUNTER[0]:04d}"


def _next_transit_id() -> str:
    _TRANSIT_COUNTER[0] += 1
    return f"TD-2026-{_TRANSIT_COUNTER[0]:04d}"


# ── Static demo data ──────────────────────────────────────────────────────────

def _mock_grn_damages() -> list[dict]:
    today = datetime.date.today()
    def d(n: int) -> str:
        return (today - datetime.timedelta(days=n)).isoformat()

    return [
        {
            "damage_id":           "GD-2026-0018",
            "grn_id":              "GRN-2026-0084",
            "po_number":           "PO-7742",
            "supplier_name":       "Ebco Industries Ltd",
            "damage_date":         d(4),
            "sku_code":            "EBCO-SCH-35",
            "sku_name":            "Ebco Soft-Close Hinge 35mm Pk-10",
            "received_qty":        500,
            "damaged_qty":         12,
            "uom":                 "packs",
            "damage_type":         "Physical Damage",
            "damage_description":  "Outer carton crushed during loading — 12 packs cracked, hinges bent",
            "location":            "Main Godown — Whitefield",
            "reported_by":         "Rajesh Kumar",
            "buy_price":           380.0,
            "damage_value":        4560.0,
            "insurance_claimable": True,
            "insurance_claim_id":  "INS-2026-0041",
            "insurance_amount":    4560.0,
            "photos_pending":      False,
            "status":              "CLAIM_RAISED",
            "accounting": {
                "entries": [
                    {
                        "dr":        "Damage Loss A/c",
                        "cr":        "Inventory A/c",
                        "amount":    4560.0,
                        "narration": "Damage write-down — Ebco Soft-Close Hinge 35mm Pk-10 — 12 packs @ ₹380 — GRN-2026-0084",
                    },
                    {
                        "dr":        "Insurance Claim Receivable A/c",
                        "cr":        "Damage Loss A/c",
                        "amount":    4560.0,
                        "narration": "Insurance claim raised for GRN damage — INS-2026-0041",
                    },
                ],
            },
        },
        {
            "damage_id":           "GD-2026-0015",
            "grn_id":              "GRN-2026-0079",
            "po_number":           "PO-7710",
            "supplier_name":       "Jaquar Group",
            "damage_date":         d(11),
            "sku_code":            "JAQ-LYR-CHR",
            "sku_name":            "Jaquar Lyric Basin Mixer Chrome",
            "received_qty":        20,
            "damaged_qty":         2,
            "uom":                 "pcs",
            "damage_type":         "Manufacturing Defect",
            "damage_description":  "Chrome finish peeling on 2 units — visible at QC inspection, not transit damage",
            "location":            "Main Godown — Whitefield",
            "reported_by":         "Priya Iyer",
            "buy_price":           3200.0,
            "damage_value":        6400.0,
            "insurance_claimable": False,
            "insurance_claim_id":  None,
            "insurance_amount":    0.0,
            "photos_pending":      True,
            "status":              "SUPPLIER_RETURN_INITIATED",
            "accounting": {
                "entries": [
                    {
                        "dr":        "Damage Loss A/c",
                        "cr":        "Inventory A/c",
                        "amount":    6400.0,
                        "narration": "Manufacturing defect — Jaquar Lyric Basin Mixer Chrome — 2 pcs @ ₹3,200 — GRN-2026-0079",
                    },
                    {
                        "dr":        "Supplier Claim Receivable A/c",
                        "cr":        "Damage Loss A/c",
                        "amount":    6400.0,
                        "narration": "Supplier return/replacement claim raised — manufacturing defect",
                    },
                ],
            },
        },
        {
            "damage_id":           "GD-2026-0013",
            "grn_id":              "GRN-2026-0071",
            "po_number":           "PO-7688",
            "supplier_name":       "Hettich India Pvt Ltd",
            "damage_date":         d(18),
            "sku_code":            "HETT-INN-400",
            "sku_name":            "Hettich InnoTech Drawer 400mm",
            "received_qty":        100,
            "damaged_qty":         3,
            "uom":                 "sets",
            "damage_type":         "Packaging Damage",
            "damage_description":  "Packaging torn — 3 sets missing runners, likely fell during truck loading",
            "location":            "Transit Hub — Koramangala",
            "reported_by":         "Suresh Nair",
            "buy_price":           880.0,
            "damage_value":        2640.0,
            "insurance_claimable": True,
            "insurance_claim_id":  "INS-2026-0038",
            "insurance_amount":    2640.0,
            "photos_pending":      False,
            "status":              "INSURANCE_APPROVED",
            "accounting": {
                "entries": [
                    {
                        "dr":        "Damage Loss A/c",
                        "cr":        "Inventory A/c",
                        "amount":    2640.0,
                        "narration": "Packaging damage — Hettich InnoTech Drawer 400mm — 3 sets @ ₹880 — GRN-2026-0071",
                    },
                    {
                        "dr":        "Insurance Claim Receivable A/c",
                        "cr":        "Damage Loss A/c",
                        "amount":    2640.0,
                        "narration": "Insurance claim approved — INS-2026-0038",
                    },
                ],
            },
        },
    ]


def _mock_transit_damages() -> list[dict]:
    today = datetime.date.today()
    def d(n: int) -> str:
        return (today - datetime.timedelta(days=n)).isoformat()

    return [
        {
            "damage_id":           "TD-2026-0022",
            "so_number":           "SO-2026-0138",
            "customer_name":       "Prestige Developers",
            "damage_date":         d(5),
            "sku_code":            "HAFL-ZDH-128",
            "sku_name":            "Hafele Zinc D-Handle 128mm",
            "dispatched_qty":      100,
            "damaged_qty":         8,
            "uom":                 "pcs",
            "damage_type":         "Rough Handling by Carrier",
            "damage_description":  "8 handles scratched/dented in transit — carrier truck loaded manually, boxes dropped",
            "carrier_name":        "City Express Logistics",
            "sell_price":          320.0,
            "buy_price":           240.0,
            "damage_sell_value":   2560.0,
            "damage_cost_value":   1920.0,
            "insurance_claimable": True,
            "insurance_claim_id":  "INS-2026-0044",
            "insurance_amount":    1920.0,
            "so_adjustment_type":  "Reduce Invoice Qty",
            "so_adjustment_note":  "Invoice revised from 100 pcs to 92 pcs — credit note CN-2026-0015 issued for 8 pcs",
            "credit_note_id":      "CN-2026-0015",
            "customer_notified":   True,
            "replacement_status":  "Scheduled — 8 pcs dispatched via Ebco stock tomorrow",
            "status":              "CLAIM_RAISED",
            "accounting": {
                "entries": [
                    {
                        "dr":        "Transit Loss A/c",
                        "cr":        "Inventory A/c (Stock)",
                        "amount":    1920.0,
                        "narration": "Inventory write-off — 8 pcs Hafele D-Handle @ ₹240 (cost) — transit damage SO-2026-0138",
                    },
                    {
                        "dr":        "Insurance Claim Receivable A/c",
                        "cr":        "Transit Loss A/c",
                        "amount":    1920.0,
                        "narration": "Insurance claim raised — transit damage — INS-2026-0044",
                    },
                    {
                        "dr":        "Sales Return A/c",
                        "cr":        "Customer A/c (Prestige Developers)",
                        "amount":    2560.0,
                        "narration": "Credit note CN-2026-0015 — 8 pcs damaged in transit — SO-2026-0138",
                    },
                ],
            },
        },
        {
            "damage_id":           "TD-2026-0019",
            "so_number":           "SO-2026-0129",
            "customer_name":       "Sharma Constructions",
            "damage_date":         d(13),
            "sku_code":            "JAQ-LYR-CHR",
            "sku_name":            "Jaquar Lyric Basin Mixer Chrome",
            "dispatched_qty":      6,
            "damaged_qty":         1,
            "uom":                 "pcs",
            "damage_type":         "Vehicle Accident",
            "damage_description":  "Minor accident — transit vehicle grazed by another truck at highway. 1 unit mixer shattered.",
            "carrier_name":        "Own Vehicle (Mahindra Bolero DL-7C)",
            "sell_price":          4850.0,
            "buy_price":           3200.0,
            "damage_sell_value":   4850.0,
            "damage_cost_value":   3200.0,
            "insurance_claimable": True,
            "insurance_claim_id":  "INS-2026-0041",
            "insurance_amount":    3200.0,
            "so_adjustment_type":  "Re-dispatch Replacement",
            "so_adjustment_note":  "Customer informed. Replacement unit dispatched next day — own vehicle.",
            "credit_note_id":      None,
            "customer_notified":   True,
            "replacement_status":  "Delivered",
            "status":              "RESOLVED",
            "accounting": {
                "entries": [
                    {
                        "dr":        "Transit Loss A/c",
                        "cr":        "Inventory A/c (Stock)",
                        "amount":    3200.0,
                        "narration": "Inventory write-off — 1 pc Jaquar Lyric Basin Mixer @ ₹3,200 (cost) — vehicle accident — SO-2026-0129",
                    },
                    {
                        "dr":        "Insurance Claim Receivable A/c",
                        "cr":        "Transit Loss A/c",
                        "amount":    3200.0,
                        "narration": "Transit insurance claim — vehicle accident — INS-2026-0041",
                    },
                ],
            },
        },
    ]


# ── KPI aggregation ────────────────────────────────────────────────────────────

def _build_summary(grn_dmgs: list[dict], transit_dmgs: list[dict]) -> dict:
    total_grn_value     = sum(d["damage_value"]       for d in grn_dmgs)
    total_transit_value = sum(d["damage_sell_value"]  for d in transit_dmgs)
    total_insured       = sum(
        (d.get("insurance_amount") or 0)
        for d in grn_dmgs + transit_dmgs
        if d.get("insurance_claimable")
    )
    open_claims = sum(
        1 for d in grn_dmgs + transit_dmgs
        if d["status"] in ("CLAIM_RAISED", "PENDING")
    )
    return {
        "total_grn_damages":      len(grn_dmgs),
        "total_transit_damages":  len(transit_dmgs),
        "total_damage_value_grn": round(total_grn_value, 2),
        "total_damage_value_transit": round(total_transit_value, 2),
        "total_insured_amount":   round(total_insured, 2),
        "open_insurance_claims":  open_claims,
        "recovery_rate_pct":      round(total_insured / (total_grn_value + total_transit_value) * 100, 1)
            if (total_grn_value + total_transit_value) > 0 else 0,
    }


# ── Pydantic models ────────────────────────────────────────────────────────────

class RecordGRNDamage(BaseModel):
    grn_id:              str
    po_number:           str   = ""
    supplier_name:       str
    sku_code:            str
    sku_name:            str
    received_qty:        float = Field(gt=0)
    damaged_qty:         float = Field(gt=0)
    uom:                 str
    damage_type:         str
    damage_description:  str   = ""
    location:            str   = ""
    reported_by:         str   = ""
    buy_price:           float = Field(ge=0, description="Buy/cost price per unit for inventory valuation")
    insurance_claimable: bool  = False
    photos_pending:      bool  = True


class RecordTransitDamage(BaseModel):
    so_number:           str
    customer_name:       str
    sku_code:            str
    sku_name:            str
    dispatched_qty:      float = Field(gt=0)
    damaged_qty:         float = Field(gt=0)
    uom:                 str
    damage_type:         str
    damage_description:  str  = ""
    carrier_name:        str  = ""
    sell_price:          float = Field(ge=0)
    buy_price:           float = Field(ge=0, description="Cost price per unit")
    insurance_claimable: bool  = False
    so_adjustment_type:  str  = "Reduce Invoice Qty"
    so_adjustment_note:  str  = ""
    customer_notified:   bool  = False


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/damage/summary")
async def damage_summary():
    """KPI summary across all damage types."""
    grn_dmgs     = _mock_grn_damages()     + _SESSION_GRN_DAMAGES
    transit_dmgs = _mock_transit_damages() + _SESSION_TRANSIT_DAMAGES
    return {
        "summary":      _build_summary(grn_dmgs, transit_dmgs),
        "data_source":  "demo",
    }


@router.get("/damage/types")
async def get_damage_types():
    """Return supported damage types for both GRN and transit workflows."""
    return {
        "grn_damage_types":     DAMAGE_TYPES,
        "transit_damage_types": TRANSIT_DAMAGE_TYPES,
        "so_adjustment_types":  SO_ADJUSTMENT_TYPES,
    }


@router.get("/damage/grn-damages")
async def list_grn_damages(
    period:    str = Query(default="MTD"),
    status:    str = Query(default=""),
    supplier:  str = Query(default=""),
):
    damages = _mock_grn_damages() + _SESSION_GRN_DAMAGES
    if status:
        damages = [d for d in damages if d["status"] == status.upper()]
    if supplier:
        damages = [d for d in damages if supplier.lower() in d["supplier_name"].lower()]
    total_value = sum(d["damage_value"] for d in damages)
    return {
        "damages":       damages,
        "total_records": len(damages),
        "total_value":   round(total_value, 2),
        "period":        period,
        "data_source":   "demo",
    }


@router.get("/damage/grn-damages/{damage_id}")
async def get_grn_damage(damage_id: str):
    all_dmgs = _mock_grn_damages() + _SESSION_GRN_DAMAGES
    rec = next((d for d in all_dmgs if d["damage_id"] == damage_id), None)
    if not rec:
        raise HTTPException(status_code=404, detail=f"GRN damage record {damage_id} not found")
    return {"damage": rec, "data_source": "demo"}


@router.post("/damage/grn-damages")
async def record_grn_damage(req: RecordGRNDamage):
    """
    Record damage found after GRN/inward receipt.
    Generates:
      - Damage Loss A/c Dr / Inventory A/c Cr  (inventory write-down)
      - Insurance Claim Receivable A/c Dr / Damage Loss A/c Cr  (if insured)
      - OR Supplier Claim Receivable A/c Dr / Damage Loss A/c Cr  (if manufacturing defect)
    """
    if req.damaged_qty > req.received_qty + 1e-9:
        raise HTTPException(
            status_code=422,
            detail=f"Damaged qty ({req.damaged_qty}) cannot exceed received qty ({req.received_qty})",
        )

    damage_value = round(req.buy_price * req.damaged_qty, 2)
    damage_id    = _next_grn_id()
    today        = datetime.date.today().isoformat()

    # Accounting entries
    entries = [
        {
            "dr":        "Damage Loss A/c",
            "cr":        "Inventory A/c",
            "amount":    damage_value,
            "narration": (
                f"Damage write-down — {req.sku_name} — "
                f"{req.damaged_qty} {req.uom} @ ₹{req.buy_price:.2f} — {req.grn_id}"
            ),
        },
    ]

    insurance_claim_id = None
    is_manufacturing   = "defect" in req.damage_type.lower()

    if req.insurance_claimable and not is_manufacturing:
        insurance_claim_id = f"INS-2026-{_GRN_COUNTER[0]:04d}"
        entries.append({
            "dr":        "Insurance Claim Receivable A/c",
            "cr":        "Damage Loss A/c",
            "amount":    damage_value,
            "narration": f"Insurance claim raised for GRN damage — {insurance_claim_id}",
        })
    elif is_manufacturing:
        entries.append({
            "dr":        "Supplier Claim Receivable A/c",
            "cr":        "Damage Loss A/c",
            "amount":    damage_value,
            "narration": f"Supplier return/replacement claim — manufacturing defect — {req.grn_id}",
        })

    status = "CLAIM_RAISED" if (req.insurance_claimable or is_manufacturing) else "PENDING"

    rec = {
        "damage_id":           damage_id,
        "grn_id":              req.grn_id,
        "po_number":           req.po_number,
        "supplier_name":       req.supplier_name,
        "damage_date":         today,
        "sku_code":            req.sku_code,
        "sku_name":            req.sku_name,
        "received_qty":        req.received_qty,
        "damaged_qty":         req.damaged_qty,
        "uom":                 req.uom,
        "damage_type":         req.damage_type,
        "damage_description":  req.damage_description,
        "location":            req.location,
        "reported_by":         req.reported_by,
        "buy_price":           req.buy_price,
        "damage_value":        damage_value,
        "insurance_claimable": req.insurance_claimable,
        "insurance_claim_id":  insurance_claim_id,
        "insurance_amount":    damage_value if (req.insurance_claimable and not is_manufacturing) else 0.0,
        "photos_pending":      req.photos_pending,
        "status":              status,
        "accounting":          {"entries": entries},
    }

    _SESSION_GRN_DAMAGES.append(rec)
    logger.info("GRN damage %s recorded — ₹%.2f write-down for %s", damage_id, damage_value, req.sku_name)

    return {
        "success":     True,
        "damage":      rec,
        "message":     (
            f"GRN damage {damage_id} recorded. "
            f"Inventory write-down ₹{damage_value:,.2f}. "
            + (f"Insurance claim {insurance_claim_id} initiated." if insurance_claim_id else
               "Supplier return claim initiated." if is_manufacturing else
               "No claim raised.")
        ),
    }


@router.get("/damage/transit-damages")
async def list_transit_damages(
    period:   str = Query(default="MTD"),
    status:   str = Query(default=""),
    customer: str = Query(default=""),
):
    damages = _mock_transit_damages() + _SESSION_TRANSIT_DAMAGES
    if status:
        damages = [d for d in damages if d["status"] == status.upper()]
    if customer:
        damages = [d for d in damages if customer.lower() in d["customer_name"].lower()]
    total_sell  = sum(d["damage_sell_value"]  for d in damages)
    total_cost  = sum(d["damage_cost_value"]  for d in damages)
    return {
        "damages":            damages,
        "total_records":      len(damages),
        "total_sell_value":   round(total_sell, 2),
        "total_cost_value":   round(total_cost, 2),
        "period":             period,
        "data_source":        "demo",
    }


@router.get("/damage/transit-damages/{damage_id}")
async def get_transit_damage(damage_id: str):
    all_dmgs = _mock_transit_damages() + _SESSION_TRANSIT_DAMAGES
    rec = next((d for d in all_dmgs if d["damage_id"] == damage_id), None)
    if not rec:
        raise HTTPException(status_code=404, detail=f"Transit damage record {damage_id} not found")
    return {"damage": rec, "data_source": "demo"}


@router.post("/damage/transit-damages")
async def record_transit_damage(req: RecordTransitDamage):
    """
    Record damage that occurred while dispatching a sales order.

    Accounting generated:
      1. Transit Loss A/c Dr / Inventory A/c Cr           — inventory write-off at cost
      2. Insurance Claim Receivable A/c Dr / Transit Loss Cr — if insured
      3. Sales Return A/c Dr / Customer A/c Cr             — if credit note to customer
    """
    if req.damaged_qty > req.dispatched_qty + 1e-9:
        raise HTTPException(
            status_code=422,
            detail=f"Damaged qty ({req.damaged_qty}) cannot exceed dispatched qty ({req.dispatched_qty})",
        )

    damage_cost_value = round(req.buy_price  * req.damaged_qty, 2)
    damage_sell_value = round(req.sell_price * req.damaged_qty, 2)
    damage_id         = _next_transit_id()
    today             = datetime.date.today().isoformat()

    entries = [
        {
            "dr":        "Transit Loss A/c",
            "cr":        "Inventory A/c (Stock)",
            "amount":    damage_cost_value,
            "narration": (
                f"Inventory write-off — {req.damaged_qty} {req.uom} {req.sku_name} "
                f"@ ₹{req.buy_price:.2f} (cost) — transit damage — {req.so_number}"
            ),
        },
    ]

    insurance_claim_id = None
    if req.insurance_claimable:
        insurance_claim_id = f"INS-2026-{_TRANSIT_COUNTER[0]:04d}"
        entries.append({
            "dr":        "Insurance Claim Receivable A/c",
            "cr":        "Transit Loss A/c",
            "amount":    damage_cost_value,
            "narration": f"Transit insurance claim — {req.damage_type} — {insurance_claim_id}",
        })

    # Credit note entry if customer is impacted (SO value reduced)
    credit_note_id = None
    if req.so_adjustment_type in ("Reduce Invoice Qty", "Raise Credit Note", "Cancel SO Line") and damage_sell_value > 0:
        credit_note_id = f"CN-2026-TD-{_TRANSIT_COUNTER[0]:04d}"
        entries.append({
            "dr":        "Sales Return A/c",
            "cr":        f"Customer A/c ({req.customer_name})",
            "amount":    damage_sell_value,
            "narration": (
                f"Credit note {credit_note_id} — {req.damaged_qty} {req.uom} {req.sku_name} "
                f"damaged in transit — {req.so_number}"
            ),
        })

    rec = {
        "damage_id":           damage_id,
        "so_number":           req.so_number,
        "customer_name":       req.customer_name,
        "damage_date":         today,
        "sku_code":            req.sku_code,
        "sku_name":            req.sku_name,
        "dispatched_qty":      req.dispatched_qty,
        "damaged_qty":         req.damaged_qty,
        "uom":                 req.uom,
        "damage_type":         req.damage_type,
        "damage_description":  req.damage_description,
        "carrier_name":        req.carrier_name,
        "sell_price":          req.sell_price,
        "buy_price":           req.buy_price,
        "damage_sell_value":   damage_sell_value,
        "damage_cost_value":   damage_cost_value,
        "insurance_claimable": req.insurance_claimable,
        "insurance_claim_id":  insurance_claim_id,
        "insurance_amount":    damage_cost_value if req.insurance_claimable else 0.0,
        "so_adjustment_type":  req.so_adjustment_type,
        "so_adjustment_note":  req.so_adjustment_note,
        "credit_note_id":      credit_note_id,
        "customer_notified":   req.customer_notified,
        "replacement_status":  "Pending",
        "status":              "CLAIM_RAISED" if req.insurance_claimable else "PENDING",
        "accounting":          {"entries": entries},
    }

    _SESSION_TRANSIT_DAMAGES.append(rec)
    logger.info("Transit damage %s recorded — cost ₹%.2f, sell ₹%.2f — %s", damage_id, damage_cost_value, damage_sell_value, req.so_number)

    return {
        "success":     True,
        "damage":      rec,
        "message":     (
            f"Transit damage {damage_id} recorded for {req.so_number}. "
            f"Inventory write-off ₹{damage_cost_value:,.2f}. "
            + (f"Insurance claim {insurance_claim_id} raised. " if insurance_claim_id else "")
            + (f"Credit note {credit_note_id} generated for customer." if credit_note_id else "")
        ),
    }
