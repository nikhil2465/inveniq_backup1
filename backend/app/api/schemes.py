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
        "active_schemes": 5,
        "total_accrued": 128000,
        "pending_claims": 2,
        "schemes": [
            {"id": "SCH-001", "name": "Ebco Q1 FY26 Volume Bonus",          "brand": "Ebco India",    "type": "Volume",   "target": 1800000, "achieved": 1340000, "reward": "63000",  "deadline": "2026-06-30", "status": "ACTIVE",    "pct": 74},
            {"id": "SCH-002", "name": "Jaquar Premier Partner Annual FY26", "brand": "Jaquar India",  "type": "Annual",   "target": 3000000, "achieved": 2160000, "reward": "75000",  "deadline": "2026-03-31", "status": "ACTIVE",    "pct": 72},
            {"id": "SCH-003", "name": "Hettich Q1 Modular Growth Bonus",    "brand": "Hettich India", "type": "Growth",   "target": 1000000, "achieved": 910000,  "reward": "40000",  "deadline": "2026-06-30", "status": "ACTIVE",    "pct": 91},
            {"id": "SCH-004", "name": "Hindware May Monsoon Push",          "brand": "Hindware",      "type": "Volume",   "target": 60,      "achieved": 27,      "reward": "21000",  "deadline": "2026-05-31", "status": "ACTIVE",    "pct": 45},
            {"id": "SCH-005", "name": "Hafele Annual Premium Loyalty FY26", "brand": "Hafele India",  "type": "Annual",   "target": 2000000, "achieved": 1480000, "reward": "100000", "deadline": "2026-12-31", "status": "ACTIVE",    "pct": 74},
        ],
        "targets": [
            {"salesperson": "Ravi Kumar",   "product": "Ebco Hinges & Hardware",   "mtd_target": 600000, "mtd_actual": 484000,  "ytd_target": 3600000, "ytd_actual": 2980000},
            {"salesperson": "Priya Sharma", "product": "Jaquar CP Fittings",       "mtd_target": 500000, "mtd_actual": 462000,  "ytd_target": 3000000, "ytd_actual": 2640000},
            {"salesperson": "Ajay Nair",    "product": "All Products",             "mtd_target": 700000, "mtd_actual": 612000,  "ytd_target": 4200000, "ytd_actual": 3620000},
            {"salesperson": "Deepa Rao",    "product": "Sanitary & Bathware",      "mtd_target": 400000, "mtd_actual": 318000,  "ytd_target": 2400000, "ytd_actual": 1960000},
        ],
    }
