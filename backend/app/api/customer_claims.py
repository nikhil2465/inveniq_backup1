"""Customer Claims & Rebate Management API — InvenIQ."""
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(tags=["Customer Claims"])

# ─── Demo Data ────────────────────────────────────────────────────────────────
_DEMO_CLAIMS: List[Dict[str, Any]] = [
    {"id": "CC-2601", "customer": "Rajesh Construction Pvt Ltd",   "type": "PRICE_DIFF",     "amount": 45000,  "status": "APPROVED",      "date": "15 Apr 2025", "region": "Mumbai",     "ref": "SO-1021"},
    {"id": "CC-2602", "customer": "Modern Interiors & Designs",    "type": "DAMAGE",         "amount": 12500,  "status": "SUBMITTED",     "date": "22 Apr 2025", "region": "Pune",       "ref": "SO-1034"},
    {"id": "CC-2603", "customer": "BuildRight Infrastructure Ltd", "type": "PROMO_SUPPORT",  "amount": 75000,  "status": "UNDER_REVIEW",  "date": "28 Apr 2025", "region": "Nashik",     "ref": "SO-1042"},
    {"id": "CC-2604", "customer": "Skyline Contractors",           "type": "FREIGHT_EXCESS", "amount": 8200,   "status": "DRAFT",         "date": "02 May 2025", "region": "Thane",      "ref": "SO-1055"},
    {"id": "CC-2605", "customer": "Premium Architects Studio",     "type": "SHORTAGE",       "amount": 18900,  "status": "APPROVED",      "date": "05 May 2025", "region": "Mumbai",     "ref": "SO-1063"},
    {"id": "CC-2606", "customer": "Metro Builders & Associates",   "type": "PRICE_DIFF",     "amount": 62000,  "status": "PARTIAL",       "date": "10 May 2025", "region": "Pune",       "ref": "SO-1071"},
    {"id": "CC-2607", "customer": "Sunshine Interiors LLP",        "type": "DAMAGE",         "amount": 9800,   "status": "REJECTED",      "date": "12 May 2025", "region": "Nagpur",     "ref": "SO-1078"},
    {"id": "CC-2608", "customer": "Grand Construction Corp",       "type": "PROMO_SUPPORT",  "amount": 120000, "status": "APPROVED",      "date": "15 May 2025", "region": "Mumbai",     "ref": "SO-1085"},
    {"id": "CC-2609", "customer": "Horizon Developers",            "type": "FREIGHT_EXCESS", "amount": 14600,  "status": "SUBMITTED",     "date": "18 May 2025", "region": "Nasik",      "ref": "SO-1091"},
    {"id": "CC-2610", "customer": "Lakshmi Timber & Hardware",     "type": "PRICE_DIFF",     "amount": 33500,  "status": "UNDER_REVIEW",  "date": "20 May 2025", "region": "Aurangabad", "ref": "SO-1097"},
]

_DEMO_PROGRAMS: List[Dict[str, Any]] = [
    {"id": "RP-101", "customer": "Rajesh Construction Pvt Ltd",   "type": "VOLUME",        "period": "Q1 FY26", "target": 1000000,  "achieved": 720000,  "accrualRate": 3.5,  "status": "ACTIVE"},
    {"id": "RP-102", "customer": "Modern Interiors & Designs",    "type": "ANNUAL_TARGET", "period": "FY26",    "target": 2500000,  "achieved": 850000,  "accrualRate": None, "status": "ACTIVE"},
    {"id": "RP-103", "customer": "BuildRight Infrastructure Ltd", "type": "LOYALTY",       "period": "FY26",    "target": None,     "achieved": 3000000, "accrualRate": 1.5,  "status": "ACTIVE"},
    {"id": "RP-104", "customer": "Skyline Contractors",           "type": "VOLUME",        "period": "Q1 FY26", "target": 500000,   "achieved": 520000,  "accrualRate": 4.0,  "status": "ACHIEVED"},
    {"id": "RP-105", "customer": "Premium Architects Studio",     "type": "PROJECT",       "period": "FY26",    "target": 1500000,  "achieved": 1120000, "accrualRate": 2.0,  "status": "ACTIVE"},
    {"id": "RP-106", "customer": "Metro Builders & Associates",   "type": "ACCRUAL",       "period": "Q1 FY26", "target": 800000,   "achieved": 560000,  "accrualRate": 2.5,  "status": "ACTIVE"},
]

# In-memory store for new claims created at runtime
_runtime_claims: List[Dict[str, Any]] = []


# ─── Request / Response Models ────────────────────────────────────────────────
class VolumeTier(BaseModel):
    from_: float
    to: Optional[float] = None
    rate: float

    class Config:
        populate_by_name = True

    @classmethod
    def from_dict(cls, d: dict):
        return cls(from_=d.get("from", 0), to=d.get("to"), rate=d.get("rate", 0))


class VolumeCalcRequest(BaseModel):
    customer:   Optional[str] = None
    category:   Optional[str] = None
    period:     Optional[str] = None
    units:      float
    unit_price: float
    tiers:      List[dict]


class AccrualMonth(BaseModel):
    month: str
    value: float


class AccrualCalcRequest(BaseModel):
    customer:        Optional[str] = None
    scheme:          Optional[str] = None
    period:          Optional[str] = None
    rate:            float
    monthly_purchases: List[AccrualMonth]
    settled:         float = 0.0


class LumpsumSlab(BaseModel):
    label: str
    from_: float
    to:    Optional[float] = None
    payout: float


class LumpsumCalcRequest(BaseModel):
    customer:    Optional[str] = None
    period:      Optional[str] = None
    target:      float
    achievement: float
    slabs:       List[dict]


class CreateClaimRequest(BaseModel):
    customer: str
    type:     str
    amount:   float
    ref:      Optional[str] = None
    region:   Optional[str] = None
    notes:    Optional[str] = None


class UpdateStatusRequest(BaseModel):
    status: str
    note:   Optional[str] = None


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/customer-claims")
async def list_claims():
    all_claims = _DEMO_CLAIMS + _runtime_claims
    summary = {
        "total":         len(all_claims),
        "approved_amt":  sum(c["amount"] for c in all_claims if c["status"] == "APPROVED"),
        "pending_amt":   sum(c["amount"] for c in all_claims if c["status"] in ("SUBMITTED", "UNDER_REVIEW")),
        "pending_count": sum(1 for c in all_claims if c["status"] not in ("APPROVED", "REJECTED")),
    }
    return {"claims": all_claims, "summary": summary, "source": "demo"}


@router.get("/rebate-programs")
async def list_programs():
    summary = {
        "active":           sum(1 for p in _DEMO_PROGRAMS if p["status"] == "ACTIVE"),
        "total_accrual_est":sum(
            (p["achieved"] * (p["accrualRate"] / 100))
            for p in _DEMO_PROGRAMS if p.get("accrualRate")
        ),
    }
    return {"programs": _DEMO_PROGRAMS, "summary": summary, "source": "demo"}


@router.post("/customer-claims")
async def create_claim(body: CreateClaimRequest):
    import random, string
    claim_id = "CC-" + "".join(random.choices(string.digits, k=4))
    claim = {
        "id":       claim_id,
        "customer": body.customer,
        "type":     body.type,
        "amount":   body.amount,
        "status":   "DRAFT",
        "date":     "27 Apr 2026",
        "region":   body.region or "—",
        "ref":      body.ref or "—",
    }
    _runtime_claims.append(claim)
    return {"claim": claim, "message": f"Claim {claim_id} created successfully."}


@router.put("/customer-claims/{claim_id}/status")
async def update_claim_status(claim_id: str, body: UpdateStatusRequest):
    valid = ("DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "PARTIAL", "REJECTED")
    if body.status not in valid:
        raise HTTPException(400, f"Invalid status. Must be one of: {', '.join(valid)}")

    for claim in _runtime_claims:
        if claim["id"] == claim_id:
            claim["status"] = body.status
            return {"claim": claim, "message": f"Status updated to {body.status}"}

    for claim in _DEMO_CLAIMS:
        if claim["id"] == claim_id:
            return {"claim": {**claim, "status": body.status}, "message": f"Status would update to {body.status} (demo data is read-only)"}

    raise HTTPException(404, f"Claim {claim_id} not found")


# ─── Calculation Engine ───────────────────────────────────────────────────────

@router.post("/customer-claims/calculate/volume")
async def calculate_volume(body: VolumeCalcRequest):
    """Volume-Wise: tiered rebate based on purchase quantity."""
    units = body.units
    unit_price = body.unit_price

    if units <= 0 or unit_price <= 0:
        raise HTTPException(400, "units and unit_price must be positive values.")

    # Find applicable tier
    tier = None
    tier_index = -1
    for i, t in enumerate(body.tiers):
        from_val = float(t.get("from", 0))
        to_val   = t.get("to")
        if units >= from_val and (to_val is None or units <= float(to_val)):
            tier = t
            tier_index = i
            break

    if tier is None:
        raise HTTPException(400, "No applicable tier found for the given volume.")

    rate           = float(tier.get("rate", 0))
    purchase_value = units * unit_price
    rebate_amount  = purchase_value * (rate / 100)
    net_amount     = purchase_value - rebate_amount

    return {
        "type":           "volume",
        "customer":       body.customer,
        "category":       body.category,
        "period":         body.period,
        "units":          units,
        "unit_price":     unit_price,
        "applicable_tier":{"index": tier_index, "from": tier.get("from"), "to": tier.get("to"), "rate": rate},
        "purchase_value": purchase_value,
        "rebate_rate_pct":rate,
        "rebate_amount":  rebate_amount,
        "net_amount":     net_amount,
    }


@router.post("/customer-claims/calculate/accrual")
async def calculate_accrual(body: AccrualCalcRequest):
    """Accrual-Wise: period-wise accumulation on purchase value."""
    rate_decimal = body.rate / 100
    rows = []
    cumulative = 0.0

    for m in body.monthly_purchases:
        purchase  = float(m.value)
        accrual   = purchase * rate_decimal
        cumulative += accrual
        rows.append({
            "month":      m.month,
            "purchase":   purchase,
            "accrual":    accrual,
            "cumulative": cumulative,
        })

    total_accrual = sum(r["accrual"] for r in rows)
    outstanding   = total_accrual - body.settled

    return {
        "type":          "accrual",
        "customer":      body.customer,
        "scheme":        body.scheme,
        "period":        body.period,
        "accrual_rate":  body.rate,
        "rows":          rows,
        "total_purchase":sum(r["purchase"] for r in rows),
        "total_accrual": total_accrual,
        "settled":       body.settled,
        "outstanding":   outstanding,
    }


@router.post("/customer-claims/calculate/lumpsum")
async def calculate_lumpsum(body: LumpsumCalcRequest):
    """Lumpsum-Wise: fixed payout based on target achievement slabs."""
    if body.target <= 0:
        raise HTTPException(400, "target must be a positive value.")

    achievement_pct = (body.achievement / body.target) * 100

    # Find applicable slab
    applicable_slab = None
    for s in body.slabs:
        from_val = float(s.get("from", 0))
        to_val   = s.get("to")
        if achievement_pct >= from_val and (to_val is None or achievement_pct < float(to_val)):
            applicable_slab = s
            break

    if applicable_slab is None and body.slabs:
        applicable_slab = body.slabs[-1]

    payout = float(applicable_slab.get("payout", 0)) if applicable_slab else 0.0

    return {
        "type":            "lumpsum",
        "customer":        body.customer,
        "period":          body.period,
        "target":          body.target,
        "achievement":     body.achievement,
        "achievement_pct": achievement_pct,
        "applicable_slab": applicable_slab,
        "payout":          payout,
        "all_slabs":       body.slabs,
    }


@router.get("/customer-claims/summary")
async def claims_summary():
    """High-level summary for dashboard widgets."""
    all_claims = _DEMO_CLAIMS + _runtime_claims
    return {
        "total_claims":    len(all_claims),
        "approved_count":  sum(1 for c in all_claims if c["status"] == "APPROVED"),
        "approved_amount": sum(c["amount"] for c in all_claims if c["status"] == "APPROVED"),
        "pending_count":   sum(1 for c in all_claims if c["status"] in ("SUBMITTED", "UNDER_REVIEW")),
        "pending_amount":  sum(c["amount"] for c in all_claims if c["status"] in ("SUBMITTED", "UNDER_REVIEW")),
        "active_programs": sum(1 for p in _DEMO_PROGRAMS if p["status"] == "ACTIVE"),
        "accrual_outstanding": sum(
            (p["achieved"] * (p["accrualRate"] / 100))
            for p in _DEMO_PROGRAMS if p.get("accrualRate")
        ),
    }
