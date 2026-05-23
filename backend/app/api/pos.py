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
            {"id": "P001", "name": "Hindalco Z-Section Louver Blade 150mm 3m",    "category": "Aluminium Louvers",   "price": 1260, "unit": "piece", "stock": 62},
            {"id": "P002", "name": "Aerofoil Louver Blade 200mm Anodised 3m",     "category": "Aluminium Louvers",   "price": 2600, "unit": "piece", "stock": 38},
            {"id": "P003", "name": "Aluminium C-Channel Extrusion 25×25mm 6m",   "category": "Aluminium Profiles",  "price": 560,  "unit": "piece", "stock": 186},
            {"id": "P004", "name": "Aluminium U-Section Trim 30×20mm 6m",        "category": "Aluminium Profiles",  "price": 480,  "unit": "piece", "stock": 124},
            {"id": "P005", "name": "Alucobond ACP 4mm Silver Metallic 8×4ft",    "category": "ACP Cladding",        "price": 3650, "unit": "sheet", "stock": 18},
            {"id": "P006", "name": "Alucobond ACP 4mm Champagne Gold 8×4ft",     "category": "ACP Cladding",        "price": 3450, "unit": "sheet", "stock": 142},
            {"id": "P007", "name": "Viva Composite ACP 4mm Pure White 8×4ft",    "category": "ACP Cladding",        "price": 2480, "unit": "sheet", "stock": 96},
            {"id": "P008", "name": "Greenlam HPL Sheet 1mm Ivory Matt 8×4ft",    "category": "HPL Laminates",       "price": 3150, "unit": "sheet", "stock": 24},
            {"id": "P009", "name": "Merino HPL Sheet 0.8mm Concrete Grey 8×4ft", "category": "HPL Laminates",       "price": 3400, "unit": "sheet", "stock": 88},
            {"id": "P010", "name": "ACP Panel Fixing Rivets Box-500",             "category": "Accessories & Fixings","price": 280, "unit": "box",   "stock": 214},
        ],
    }


@router.get("/pos/summary")
async def get_pos_summary():
    return {
        "data_source": "demo",
        "today_bills": 18,
        "today_revenue": 168400,
        "today_cash": 52600,
        "today_upi": 74800,
        "today_credit": 41000,
        "avg_bill_value": 9356,
    }
