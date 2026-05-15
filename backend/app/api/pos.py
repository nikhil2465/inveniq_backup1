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
            {"id": "P001", "name": "Ebco Soft-Close Hinge 35mm Pk-10",     "category": "Hardware Fittings",    "price": 485,  "unit": "pack",  "stock": 48},
            {"id": "P002", "name": "Hettich InnoTech Drawer System 400mm", "category": "Hardware Fittings",    "price": 1280, "unit": "set",   "stock": 21},
            {"id": "P003", "name": "Hafele Zinc D-Handle 128mm (pair)",    "category": "Hardware Fittings",    "price": 320,  "unit": "pair",  "stock": 186},
            {"id": "P004", "name": "Ebco Cam Lock 25mm (pk-50)",           "category": "Hardware Fittings",    "price": 420,  "unit": "pack",  "stock": 94},
            {"id": "P005", "name": "Jaquar Lyric Basin Mixer Chrome",      "category": "Sanitary CP Fittings", "price": 4850, "unit": "unit",  "stock": 12},
            {"id": "P006", "name": "Jaquar Allied Overhead Shower 200mm",  "category": "Sanitary CP Fittings", "price": 2400, "unit": "unit",  "stock": 68},
            {"id": "P007", "name": "Hindware Aura Stop Cock DN15",         "category": "Sanitary CP Fittings", "price": 750,  "unit": "unit",  "stock": 148},
            {"id": "P008", "name": "Dorset Euro Cylinder Lock 60mm",       "category": "Door Hardware & Locks","price": 580,  "unit": "unit",  "stock": 62},
            {"id": "P009", "name": "Godrej Ultra Locks 60mm",              "category": "Door Hardware & Locks","price": 940,  "unit": "unit",  "stock": 38},
            {"id": "P010", "name": "Blum Tandem Drawer Runner 500mm",      "category": "Hardware Fittings",    "price": 1640, "unit": "pair",  "stock": 24},
        ],
    }


@router.get("/pos/summary")
async def get_pos_summary():
    return {
        "data_source": "demo",
        "today_bills": 18,
        "today_revenue": 124000,
        "today_cash": 68200,
        "today_upi": 43800,
        "today_credit": 12000,
        "avg_bill_value": 6889,
    }
