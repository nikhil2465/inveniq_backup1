"""Counter POS API — InvenIQ. Walk-in billing, fast POS, cash/UPI receipts."""
import logging
from fastapi import APIRouter

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Counter POS"])


@router.get("/pos/products")
async def get_pos_products():
    return {
        "data_source": "demo",
        "products": [
            {"id": "P001", "name": "18mm BWP (8x4)",  "category": "Plywood",  "price": 1920, "unit": "sheets", "stock": 140},
            {"id": "P002", "name": "12mm BWP (8x4)",  "category": "Plywood",  "price": 1450, "unit": "sheets", "stock": 220},
            {"id": "P003", "name": "12mm MR Plain",   "category": "Plywood",  "price": 880,  "unit": "sheets", "stock": 180},
            {"id": "P004", "name": "6mm Gurjan BWP",  "category": "Plywood",  "price": 960,  "unit": "sheets", "stock": 186},
            {"id": "P005", "name": "Laminates Teak",  "category": "Laminate", "price": 520,  "unit": "sheets", "stock": 90},
            {"id": "P006", "name": "Laminates White", "category": "Laminate", "price": 480,  "unit": "sheets", "stock": 75},
            {"id": "P007", "name": "PVC Louver 100mm","category": "Louvers",  "price": 240,  "unit": "sqft",   "stock": 500},
            {"id": "P008", "name": "Aluminium Louver","category": "Louvers",  "price": 380,  "unit": "sqft",   "stock": 320},
            {"id": "P009", "name": "ACP 4mm Silver",  "category": "ACP",      "price": 1100, "unit": "sheets", "stock": 60},
            {"id": "P010", "name": "Fevicol SH 5kg",  "category": "Adhesive", "price": 320,  "unit": "units",  "stock": 45},
        ],
    }


@router.get("/pos/summary")
async def get_pos_summary():
    return {
        "data_source": "demo",
        "today_bills": 12,
        "today_revenue": 84200,
        "today_cash": 42100,
        "today_upi": 31600,
        "today_credit": 10500,
        "avg_bill_value": 7017,
    }
