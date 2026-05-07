"""Credit Management API — Credit limits, overdue accounts, PDC tracking."""
from fastapi import APIRouter, Query

router = APIRouter(tags=["Credit Management"])

MOCK_ACCOUNTS = [
    {"id": "C001", "name": "Sharma Constructions",    "limit": 500000, "used": 340000, "overdue": 340000, "days": 78, "risk": "HIGH",   "phone": "+91 98765 43210", "lastOrder": "2026-02-18", "pdcCount": 0},
    {"id": "C002", "name": "Mehta Interiors",          "limit": 300000, "used": 210000, "overdue": 80000,  "days": 45, "risk": "MEDIUM", "phone": "+91 87654 32109", "lastOrder": "2026-04-02", "pdcCount": 1},
    {"id": "C003", "name": "Prestige Developers",      "limit": 800000, "used": 620000, "overdue": 0,      "days": 0,  "risk": "LOW",    "phone": "+91 76543 21098", "lastOrder": "2026-05-01", "pdcCount": 3},
    {"id": "C004", "name": "City Interiors",           "limit": 200000, "used": 80000,  "overdue": 0,      "days": 0,  "risk": "LOW",    "phone": "+91 65432 10987", "lastOrder": "2026-05-03", "pdcCount": 0},
    {"id": "C005", "name": "Bangalore Building Supp.", "limit": 400000, "used": 390000, "overdue": 190000, "days": 62, "risk": "HIGH",   "phone": "+91 54321 09876", "lastOrder": "2026-03-10", "pdcCount": 0},
    {"id": "C006", "name": "Kumar & Sons",             "limit": 250000, "used": 120000, "overdue": 40000,  "days": 35, "risk": "MEDIUM", "phone": "+91 43210 98765", "lastOrder": "2026-04-18", "pdcCount": 2},
    {"id": "C007", "name": "Metro Constructions",      "limit": 600000, "used": 280000, "overdue": 0,      "days": 0,  "risk": "LOW",    "phone": "+91 32109 87654", "lastOrder": "2026-05-05", "pdcCount": 1},
    {"id": "C008", "name": "Patel Hardware",           "limit": 150000, "used": 145000, "overdue": 95000,  "days": 55, "risk": "HIGH",   "phone": "+91 21098 76543", "lastOrder": "2026-03-20", "pdcCount": 0},
]

MOCK_PDC = [
    {"cheque": "CHQ-004521", "customer": "Prestige Developers",  "amount": 150000, "date": "2026-05-10", "bank": "HDFC",  "status": "PENDING"},
    {"cheque": "CHQ-004522", "customer": "Kumar & Sons",         "amount": 40000,  "date": "2026-05-15", "bank": "SBI",   "status": "PENDING"},
    {"cheque": "CHQ-004523", "customer": "Metro Constructions",  "amount": 80000,  "date": "2026-05-20", "bank": "ICICI", "status": "PENDING"},
    {"cheque": "CHQ-004520", "customer": "Mehta Interiors",      "amount": 60000,  "date": "2026-05-05", "bank": "Axis",  "status": "DEPOSITED"},
    {"cheque": "CHQ-004518", "customer": "Kumar & Sons",         "amount": 25000,  "date": "2026-04-28", "bank": "SBI",   "status": "CLEARED"},
]


@router.get("/credit/accounts")
async def get_credit_accounts(period: str = Query("MTD")):
    total_overdue = sum(a["overdue"] for a in MOCK_ACCOUNTS)
    total_limit   = sum(a["limit"]   for a in MOCK_ACCOUNTS)
    total_used    = sum(a["used"]    for a in MOCK_ACCOUNTS)
    high_risk     = [a for a in MOCK_ACCOUNTS if a["risk"] == "HIGH"]
    return {
        "accounts":      MOCK_ACCOUNTS,
        "summary": {
            "total_overdue":    total_overdue,
            "total_limit":      total_limit,
            "total_used":       total_used,
            "high_risk_count":  len(high_risk),
            "utilisation_pct":  round(total_used / total_limit * 100) if total_limit else 0,
        },
        "data_source": "demo",
        "period": period,
    }


@router.get("/credit/pdc")
async def get_pdc():
    pending_amount = sum(p["amount"] for p in MOCK_PDC if p["status"] == "PENDING")
    return {
        "pdcs":           MOCK_PDC,
        "pending_count":  sum(1 for p in MOCK_PDC if p["status"] == "PENDING"),
        "pending_amount": pending_amount,
        "data_source":    "demo",
    }


@router.get("/credit/aging")
async def get_aging_summary():
    buckets = {"current": 0, "d31_60": 0, "d61_90": 0, "d90plus": 0}
    for a in MOCK_ACCOUNTS:
        if a["days"] == 0:
            buckets["current"] += a["used"]
        elif a["days"] <= 60:
            buckets["d31_60"] += a["overdue"]
        elif a["days"] <= 90:
            buckets["d61_90"] += a["overdue"]
        else:
            buckets["d90plus"] += a["overdue"]
    return {"buckets": buckets, "accounts": MOCK_ACCOUNTS, "data_source": "demo"}
