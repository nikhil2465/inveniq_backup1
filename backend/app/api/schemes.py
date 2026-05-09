"""Scheme Management API — InvenIQ. Supplier schemes, promotions, targets, accruals."""
import logging
from fastapi import APIRouter, Query

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Scheme Management"])


@router.get("/schemes")
async def get_schemes(period: str = Query("MTD")):
    return {
        "data_source": "demo",
        "period": period,
        "active_schemes": 4,
        "total_accrued": 72400,
        "pending_claims": 2,
        "schemes": [
            {"id": "SCH-001", "name": "Century BWP Loyalty Q1", "brand": "Century Plyboards", "type": "Volume",   "target": 5000,    "achieved": 3840,   "reward": "38400",  "deadline": "2026-06-30", "status": "ACTIVE",    "pct": 77},
            {"id": "SCH-002", "name": "Greenply Monsoon Promo",  "brand": "Greenply",          "type": "Purchase", "target": 200000,  "achieved": 145000, "reward": "29000",  "deadline": "2026-07-31", "status": "ACTIVE",    "pct": 73},
            {"id": "SCH-003", "name": "Gauri Q4 Growth Scheme",  "brand": "Gauri Laminates",   "type": "Growth",   "target": 120,     "achieved": 120,    "reward": "12000",  "deadline": "2026-03-31", "status": "COMPLETED", "pct": 100},
            {"id": "SCH-004", "name": "HPL Monsoon Offer",       "brand": "Merino",             "type": "Volume",   "target": 800,     "achieved": 210,    "reward": "8000",   "deadline": "2026-08-31", "status": "ACTIVE",    "pct": 26},
            {"id": "SCH-005", "name": "Century Annual Rebate",   "brand": "Century Plyboards",  "type": "Annual",   "target": 2000000, "achieved": 890000, "reward": "267000", "deadline": "2026-12-31", "status": "ACTIVE",    "pct": 45},
        ],
        "targets": [
            {"salesperson": "Ravi Kumar",   "product": "18mm BWP",         "mtd_target": 400, "mtd_actual": 310, "ytd_target": 2200, "ytd_actual": 1820},
            {"salesperson": "Priya Sharma", "product": "Laminates",        "mtd_target": 200, "mtd_actual": 185, "ytd_target": 1200, "ytd_actual": 1050},
            {"salesperson": "Ajay Nair",    "product": "All Products",     "mtd_target": 600000, "mtd_actual": 520000, "ytd_target": 3600000, "ytd_actual": 2980000},
            {"salesperson": "Deepa Rao",    "product": "Aluminium Louvers","mtd_target": 120, "mtd_actual": 95,  "ytd_target": 700,  "ytd_actual": 580},
        ],
    }
