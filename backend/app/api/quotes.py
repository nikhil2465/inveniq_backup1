"""
Quotation Builder API — InvenIQ
Professional quotation management for louvers, laminates & building materials.
Covers full quote lifecycle: Draft → Sent → Negotiating → Won/Lost.
"""
import base64
import datetime
import json
import logging
import os
import re
from typing import List, Optional

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Quotation Builder"])

VALID_STATUSES = {"DRAFT", "SENT", "NEGOTIATING", "WON", "LOST", "EXPIRED", "REVISED"}


# ── Pydantic models ────────────────────────────────────────────────────────────

class QuoteLineItem(BaseModel):
    product_id:     str = ""
    product_name:   str
    category:       str = ""
    quantity:       float = Field(gt=0)
    unit:           str = "sheet"
    unit_price:     float = Field(ge=0)
    discount_pct:   float = Field(ge=0, le=100, default=0)
    buy_price:      float = Field(ge=0, default=0)
    specifications: str = ""


class CreateQuoteRequest(BaseModel):
    customer_name:    str
    customer_type:    str = "Developer"
    contact_person:   str = ""
    contact_phone:    str = ""
    contact_email:    str = ""
    gst_number:       str = ""
    billing_address:  str = ""
    site_location:    str = ""
    project_name:     str = ""
    payment_terms:    str = "50% Advance + 50% on Delivery"
    delivery_terms:   str = "Door Delivery — Bangalore"
    validity_days:    int = 14
    notes:            str = ""
    gst_rate:         float = 18.0
    include_freight:  bool = False
    freight_amount:   float = 0.0
    line_items:       List[QuoteLineItem] = []


class UpdateQuoteStatus(BaseModel):
    status:   str
    remarks:  Optional[str] = None


class AIPriceRequest(BaseModel):
    customer_type:  str
    total_quantity: float
    category:       str = ""
    current_margin: float = 20.0


class AnalyzeLineItem(BaseModel):
    product_name:  str   = ""
    category:      str   = ""
    quantity:      float = 0
    unit:          str   = "sheet"
    unit_price:    float = 0
    discount_pct:  float = 0
    buy_price:     float = 0


class AnalyzeQuoteRequest(BaseModel):
    customer_name:   str   = ""
    customer_type:   str   = "Developer"
    project_name:    str   = ""
    payment_terms:   str   = ""
    subtotal:        float = 0
    gst_rate:        float = 18
    include_freight: bool  = False
    freight_amount:  float = 0
    notes:           str   = ""
    line_items:      List[AnalyzeLineItem] = []


# ── Mock data ──────────────────────────────────────────────────────────────────

def _mock_quotes():
    today = datetime.date.today()
    return [
        {
            "quote_id": 1,
            "quote_number": "QT-2026-0089",
            "created_at": (today - datetime.timedelta(days=3)).isoformat(),
            "valid_till": (today + datetime.timedelta(days=11)).isoformat(),
            "status": "NEGOTIATING",
            "customer_name": "Prestige Developers",
            "customer_type": "Developer",
            "contact_person": "Mr. Rajesh Shetty",
            "contact_phone": "+91 98450 11223",
            "contact_email": "rajesh.shetty@prestige.co.in",
            "gst_number": "29AABCP1234A1ZK",
            "billing_address": "Prestige Tower, MG Road, Bangalore 560001",
            "site_location": "Whitefield, Bangalore",
            "project_name": "Prestige Skyrise — Tower A & B Facade",
            "payment_terms": "50% Advance + 50% on Delivery",
            "delivery_terms": "Door Delivery — Bangalore",
            "validity_days": 14,
            "notes": "Client is comparing with Hyperion Systems. Price sensitivity is high.",
            "gst_rate": 18.0,
            "include_freight": True,
            "freight_amount": 18000,
            "subtotal": 480000,
            "gst_amount": 86400,
            "grand_total": 584400,
            "margin_pct": 20.1,
            "line_items": [
                {
                    "sl": 1, "product_id": "AL-Z100-ANOD", "product_name": "Aluminium Z-100 Anodized Louver",
                    "category": "Aluminium Louver", "quantity": 1200, "unit": "Rmt",
                    "unit_price": 320, "discount_pct": 5.0, "buy_price": 245, "net_price": 304,
                    "line_total": 364800, "specifications": "100mm blade, Silver Anodized",
                },
                {
                    "sl": 2, "product_id": "AL-C150-AERO", "product_name": "Aluminium C-150 Aerofoil Louver",
                    "category": "Aluminium Louver", "quantity": 180, "unit": "Rmt",
                    "unit_price": 640, "discount_pct": 4.0, "buy_price": 490, "net_price": 614,
                    "line_total": 110592, "specifications": "150mm aerofoil blade, powder coated RAL 9006",
                },
            ],
        },
        {
            "quote_id": 2,
            "quote_number": "QT-2026-0088",
            "created_at": (today - datetime.timedelta(days=7)).isoformat(),
            "valid_till": (today + datetime.timedelta(days=7)).isoformat(),
            "status": "WON",
            "customer_name": "Sobha Builders",
            "customer_type": "Developer",
            "contact_person": "Mrs. Anitha Krishnan",
            "contact_phone": "+91 80002 44556",
            "contact_email": "anitha@sobha.com",
            "gst_number": "29AASCS4567B1ZJ",
            "billing_address": "Sobha City, Thanisandra, Bangalore 560077",
            "site_location": "Hebbal, Bangalore",
            "project_name": "Sobha Dream Series — Phase 2",
            "payment_terms": "100% Advance",
            "delivery_terms": "Door Delivery — Bangalore",
            "validity_days": 14,
            "notes": "Repeat client — offer 2% extra loyalty discount on next order.",
            "gst_rate": 18.0,
            "include_freight": False,
            "freight_amount": 0,
            "subtotal": 320000,
            "gst_amount": 57600,
            "grand_total": 377600,
            "margin_pct": 23.5,
            "line_items": [
                {
                    "sl": 1, "product_id": "HPL-1.5MM-COMP", "product_name": "Compact Laminate 6mm",
                    "category": "Compact Laminate", "quantity": 320, "unit": "sheet",
                    "unit_price": 1800, "discount_pct": 0, "buy_price": 1380, "net_price": 1800,
                    "line_total": 576000, "specifications": "Exterior grade, Trespa-style woodgrain",
                },
            ],
        },
        {
            "quote_id": 3,
            "quote_number": "QT-2026-0087",
            "created_at": (today - datetime.timedelta(days=12)).isoformat(),
            "valid_till": (today - datetime.timedelta(days=2)).isoformat(),
            "status": "SENT",
            "customer_name": "Brigade Group",
            "customer_type": "Developer",
            "contact_person": "Mr. Venkat Rao",
            "contact_phone": "+91 99000 88776",
            "contact_email": "venkat.rao@brigade.com",
            "gst_number": "29AACBR8890C1ZF",
            "billing_address": "Brigade Towers, Palace Road, Bangalore 560001",
            "site_location": "Devanahalli, Bangalore",
            "project_name": "Brigade Tech Park — Amenity Block",
            "payment_terms": "Net 30 Days",
            "delivery_terms": "FOR Destination",
            "validity_days": 14,
            "notes": "Expiry chased — client on vacation, follow up Monday.",
            "gst_rate": 18.0,
            "include_freight": True,
            "freight_amount": 12000,
            "subtotal": 195000,
            "gst_amount": 35100,
            "grand_total": 242100,
            "margin_pct": 18.2,
            "line_items": [
                {
                    "sl": 1, "product_id": "PVC-LOUVER-100", "product_name": "PVC Louver 100mm",
                    "category": "PVC Louver", "quantity": 850, "unit": "Rmt",
                    "unit_price": 195, "discount_pct": 3.0, "buy_price": 152, "net_price": 189.15,
                    "line_total": 160778, "specifications": "White, 100mm, UV stabilised",
                },
                {
                    "sl": 2, "product_id": "PVC-LOUVER-75", "product_name": "PVC Louver 75mm",
                    "category": "PVC Louver", "quantity": 180, "unit": "Rmt",
                    "unit_price": 165, "discount_pct": 3.0, "buy_price": 128, "net_price": 160.05,
                    "line_total": 28809, "specifications": "White, 75mm, UV stabilised",
                },
            ],
        },
        {
            "quote_id": 4,
            "quote_number": "QT-2026-0086",
            "created_at": (today - datetime.timedelta(days=18)).isoformat(),
            "valid_till": (today - datetime.timedelta(days=4)).isoformat(),
            "status": "DRAFT",
            "customer_name": "Nambiar Builders",
            "customer_type": "Developer",
            "contact_person": "Ms. Priya Nambiar",
            "contact_phone": "+91 77007 22334",
            "contact_email": "priya@nambiarbuilders.com",
            "gst_number": "",
            "billing_address": "Nambiar House, Koramangala, Bangalore",
            "site_location": "Electronic City, Bangalore",
            "project_name": "Nambiar Millenia — Clubhouse",
            "payment_terms": "50% Advance + 50% on Delivery",
            "delivery_terms": "Ex-Works",
            "validity_days": 21,
            "notes": "Draft pending — waiting for final dimensions from architect.",
            "gst_rate": 18.0,
            "include_freight": False,
            "freight_amount": 0,
            "subtotal": 88000,
            "gst_amount": 15840,
            "grand_total": 103840,
            "margin_pct": 21.4,
            "line_items": [
                {
                    "sl": 1, "product_id": "OP-LOUVER-MOTOR", "product_name": "Operable Motorised Louver System",
                    "category": "Operable System", "quantity": 60, "unit": "Rmt",
                    "unit_price": 1800, "discount_pct": 2.0, "buy_price": 1400, "net_price": 1764,
                    "line_total": 105840, "specifications": "Motorised 120mm blade, Somfy motor, powder coat",
                },
            ],
        },
        {
            "quote_id": 5,
            "quote_number": "QT-2026-0082",
            "created_at": (today - datetime.timedelta(days=30)).isoformat(),
            "valid_till": (today - datetime.timedelta(days=16)).isoformat(),
            "status": "LOST",
            "customer_name": "Godrej Properties",
            "customer_type": "Developer",
            "contact_person": "Mr. Sanjay Malhotra",
            "contact_phone": "+91 98100 45678",
            "contact_email": "sanjay.m@godrej.com",
            "gst_number": "07AABCG1234D1ZQ",
            "billing_address": "Godrej One, LBS Marg, Mumbai 400079",
            "site_location": "Punawale, Pune",
            "project_name": "Godrej Horizon — External Cladding",
            "payment_terms": "Net 45 Days",
            "delivery_terms": "FOR Destination",
            "validity_days": 14,
            "notes": "Lost to competitor offering 8% lower price. Revisit in 6 months for Phase 2.",
            "gst_rate": 18.0,
            "include_freight": True,
            "freight_amount": 35000,
            "subtotal": 740000,
            "gst_amount": 133200,
            "grand_total": 908200,
            "margin_pct": 15.8,
            "line_items": [
                {
                    "sl": 1, "product_id": "HPL-EXT-CLAD", "product_name": "HPL Exterior Cladding Panel",
                    "category": "HPL Cladding", "quantity": 680, "unit": "sheet",
                    "unit_price": 1280, "discount_pct": 6.0, "buy_price": 1050, "net_price": 1203.2,
                    "line_total": 818176, "specifications": "8mm Trespa Meteon FR, Sto-grey finish",
                },
            ],
        },
    ]


def _compute_kpis(quotes):
    pipeline = sum(q["grand_total"] for q in quotes if q["status"] in ("SENT", "NEGOTIATING", "DRAFT"))
    won = sum(q["grand_total"] for q in quotes if q["status"] == "WON")
    lost = sum(q["grand_total"] for q in quotes if q["status"] == "LOST")
    active = [q for q in quotes if q["status"] in ("SENT", "NEGOTIATING")]
    won_count = sum(1 for q in quotes if q["status"] == "WON")
    closed = won_count + sum(1 for q in quotes if q["status"] == "LOST")
    win_rate = round(won_count / closed * 100, 1) if closed else 0.0
    margins = [q["margin_pct"] for q in quotes if q.get("margin_pct")]
    avg_margin = round(sum(margins) / len(margins), 1) if margins else 0.0
    today = datetime.date.today()
    expiring = sum(
        1 for q in quotes
        if q.get("valid_till") and q["status"] in ("SENT", "NEGOTIATING")
        and 0 <= (datetime.date.fromisoformat(q["valid_till"]) - today).days <= 7
    )
    return {
        "pipeline_value": pipeline,
        "won_value": won,
        "lost_value": lost,
        "win_rate_pct": win_rate,
        "avg_margin_pct": avg_margin,
        "expiring_count": expiring,
        "active_count": len(active),
    }


# ── WhatsApp Scanner helpers ───────────────────────────────────────────────────

_EXTRACTION_SYSTEM = """You are an expert at extracting building material product requirements from WhatsApp messages, BOQ documents, architect requirement sheets and construction requirement screenshots.

Extract ALL information present and return a JSON object with EXACTLY this structure:
{
  "customer_name": "company or person name, or empty string if not found",
  "customer_type": "one of: Developer, Architect, Contractor, Interior Firm, Retailer",
  "contact_person": "person's name if mentioned, else empty string",
  "contact_phone": "phone number if present, else empty string",
  "contact_email": "email if present, else empty string",
  "project_name": "project or site name, else empty string",
  "site_location": "delivery or site location, else empty string",
  "required_products": [
    {
      "description": "exact product description as mentioned",
      "quantity": 100,
      "unit": "sheet, RM, SQM, nos, etc.",
      "specifications": "thickness, color, finish, grade, size etc.",
      "notes": "any special requirements for this item"
    }
  ],
  "special_requirements": "overall special notes or conditions",
  "delivery_notes": "any delivery or timeline requirements",
  "budget_indication": "any budget or price range mentioned"
}

If a field is not found use empty string. If quantity is not mentioned use 0. Return ONLY valid JSON — no markdown fences."""


def _get_catalog_for_matching():
    from app.api.catalog import CATALOG
    return CATALOG


def _score_match(desc: str, specs: str, product: dict) -> int:
    combined = f"{desc} {specs}".lower()
    score = 0

    for word in product["name"].lower().split():
        if len(word) > 2 and word in combined:
            score += 8

    for word in product["category"].lower().split():
        if len(word) > 2 and word in combined:
            score += 6

    sub = product.get("sub_category", "").lower()
    if sub and any(w in combined for w in sub.split() if len(w) > 2):
        score += 5

    for tag in product.get("tags", []):
        norm = tag.replace("-", " ")
        if norm in combined or tag in combined:
            score += 4

    thickness = product.get("thickness", "")
    if thickness:
        m = re.search(r"(\d+(?:\.\d+)?)\s*mm", thickness)
        if m and m.group(0).replace(" ", "") in combined.replace(" ", ""):
            score += 10

    for app in product.get("applications", []):
        words = [w for w in app.lower().split() if len(w) > 3]
        if sum(1 for w in words if w in combined) >= 2:
            score += 3

    keyword_map = {
        "laminate":  ["laminate", "hpl", "compact", "laminates"],
        "louver":    ["louver", "louvre", "louvers", "louvres", "jalousie"],
        "pvc":       ["pvc", "plastic"],
        "aluminium": ["aluminium", "aluminum", "alum", "alu"],
        "acrylic":   ["acrylic", "glossy", "high gloss"],
        "cladding":  ["cladding", "facade", "exterior", "external"],
        "acp":       ["acp", "composite", "aluminium composite"],
        "toilet":    ["toilet", "cubicle", "partition", "washroom", "wc"],
        "kitchen":   ["kitchen", "modular", "cabinet"],
        "operable":  ["operable", "motorised", "motorized", "pergola", "automated"],
    }
    for p_word, synonyms in keyword_map.items():
        if p_word in product["name"].lower() or p_word in product["category"].lower():
            if any(s in combined for s in synonyms):
                score += 8

    return score


def _match_to_catalog(required_products: list) -> list:
    catalog = _get_catalog_for_matching()
    results = []
    for req in required_products:
        desc  = req.get("description", "")
        specs = req.get("specifications", "")
        scored = []
        for p in catalog:
            s = _score_match(desc, specs, p)
            if s > 0:
                scored.append({"product": p, "score": s})
        scored.sort(key=lambda x: x["score"], reverse=True)
        top   = scored[:3]
        score0 = top[0]["score"] if top else 0
        results.append({
            "required":    req,
            "matches":     [x["product"] for x in top],
            "best_match":  top[0]["product"] if top else None,
            "confidence":  "high" if score0 >= 15 else "medium" if score0 >= 8 else "low",
        })
    return results


def _build_suggested_lines(matched: list) -> list:
    lines = []
    for mp in matched:
        if not mp["best_match"]:
            continue
        p   = mp["best_match"]
        req = mp["required"]
        lines.append({
            "product_id":    str(p["product_id"]),
            "product_name":  p["name"],
            "category":      p["category"],
            "quantity":      req.get("quantity") or 1,
            "unit":          p["unit"],
            "unit_price":    p["sell_price"],
            "buy_price":     p["buy_price"],
            "discount_pct":  0,
            "specifications": req.get("specifications", ""),
        })
    return lines


def _demo_scan_result(note: str = "") -> dict:
    extracted = {
        "customer_name":      "Prestige Grand Heights",
        "customer_type":      "Developer",
        "contact_person":     "Ramesh Kumar",
        "contact_phone":      "+91 98450 12345",
        "contact_email":      "",
        "project_name":       "Block C — 3rd Floor Clubhouse",
        "site_location":      "Whitefield, Bangalore",
        "required_products":  [
            {"description": "HPL 1mm laminate sheets for kitchen cabinets", "quantity": 80,  "unit": "sheet", "specifications": "Matte finish, Teak wood grain",   "notes": "Need colour samples first"},
            {"description": "Aluminium Z profile louvers for car park",      "quantity": 500, "unit": "RM",    "specifications": "100mm blade, anodized silver",     "notes": "Delivery in 2 batches"},
            {"description": "Compact laminate 6mm for toilet partitions",    "quantity": 30,  "unit": "sheet", "specifications": "White or light grey",              "notes": ""},
        ],
        "special_requirements": "Urgent — site ready in 3 weeks. All materials IS certified.",
        "delivery_notes":       "Door delivery required, Whitefield",
        "budget_indication":    "",
    }
    matched = _match_to_catalog(extracted["required_products"])
    return {
        "extracted":         extracted,
        "matched_products":  matched,
        "suggested_lines":   _build_suggested_lines(matched),
        "data_source":       "demo",
        "demo_note":         note or "Demo mode — upload a real WhatsApp screenshot to use live AI scanning with your OPENAI_API_KEY.",
    }


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.get("/quotes/ai-price")
async def ai_price_recommendation_get(
    customer_type: str = "Developer",
    quantity: float = 100,
    product_id: Optional[str] = None,
    current_margin: float = 20.0,
):
    """GET version of AI price recommendation — query params for frontend compatibility."""
    base_discount = 0.0
    rationale_parts = []

    if quantity >= 5000:
        base_discount += 5.0
        rationale_parts.append("High volume (5000+ units) → 5% volume discount")
    elif quantity >= 2000:
        base_discount += 3.0
        rationale_parts.append("Medium volume (2000+ units) → 3% volume discount")
    elif quantity >= 500:
        base_discount += 1.5
        rationale_parts.append("Moderate volume (500+ units) → 1.5% volume discount")

    type_discounts = {"Developer": 2.0, "Architect": 1.5, "Contractor": 1.0, "Interior Firm": 1.5, "Retailer": 0.5}
    ct_disc = type_discounts.get(customer_type, 0.0)
    if ct_disc:
        base_discount += ct_disc
        rationale_parts.append(f"{customer_type} relationship pricing → {ct_disc}% extra")

    projected_margin = current_margin - base_discount
    if projected_margin < 15.0:
        old = base_discount
        base_discount = max(0, current_margin - 15.0)
        rationale_parts.append(f"Margin floor 15% applied — capped discount from {old:.1f}% to {base_discount:.1f}%")
        projected_margin = current_margin - base_discount

    return {
        "recommended_discount_pct": round(base_discount, 1),
        "max_safe_discount_pct": round(max(0, current_margin - 15.0), 1),
        "floor_margin_pct": 15.0,
        "projected_margin_pct": round(projected_margin, 1),
        "rationale": " · ".join(rationale_parts) if rationale_parts else "Standard pricing — no additional discount recommended",
        "competitive_note": "Market range for this segment: 12–22% margin. Recommended discount keeps you competitive.",
    }


@router.get("/quotes")
async def list_quotes(status: Optional[str] = None, search: Optional[str] = None):
    try:
        from app.db.connection import get_pool
        from app.db import quote_queries
        pool = await get_pool()
        if pool:
            await quote_queries.ensure_tables(pool)
            quotes = await quote_queries.list_quotes_db(pool, status=status, search=search)
            kpis   = await quote_queries.kpis_db(pool)
            return {"quotes": quotes, "kpis": kpis, "data_source": "mysql"}
    except Exception as exc:
        logger.warning("Quote list DB error: %s", exc)

    quotes = _mock_quotes()
    if status and status.upper() != "ALL":
        quotes = [q for q in quotes if q["status"] == status.upper()]
    if search:
        term = search.lower()
        quotes = [
            q for q in quotes
            if term in q["customer_name"].lower()
            or term in q["quote_number"].lower()
            or term in q.get("project_name", "").lower()
        ]
    return {
        "quotes": quotes,
        "kpis": _compute_kpis(_mock_quotes()),
        "data_source": "demo",
    }


@router.get("/quotes/{quote_id}")
async def get_quote(quote_id: int):
    try:
        from app.db.connection import get_pool
        from app.db import quote_queries
        pool = await get_pool()
        if pool:
            await quote_queries.ensure_tables(pool)
            q = await quote_queries.get_quote_db(pool, quote_id)
            if q:
                return {"quote": q, "data_source": "mysql"}
    except Exception as exc:
        logger.warning("Quote get DB error: %s", exc)

    quotes = _mock_quotes()
    for q in quotes:
        if q["quote_id"] == quote_id:
            return {"quote": q, "data_source": "demo"}
    raise HTTPException(status_code=404, detail=f"Quote {quote_id} not found")


@router.post("/quotes", status_code=201)
async def create_quote(req: CreateQuoteRequest):
    today = datetime.date.today()
    subtotal = sum(
        li.quantity * li.unit_price * (1 - li.discount_pct / 100)
        for li in req.line_items
    )
    gst_amount  = subtotal * req.gst_rate / 100
    freight     = req.freight_amount if req.include_freight else 0
    grand_total = subtotal + gst_amount + freight
    total_buy   = sum(li.quantity * li.buy_price for li in req.line_items if li.buy_price)
    avg_margin  = round((subtotal - total_buy) / subtotal * 100, 1) if subtotal > 0 and total_buy > 0 else 0.0

    def _line_items_expanded(items):
        return [
            {
                "sl": i + 1,
                **li.model_dump(),
                "net_price":  round(li.unit_price * (1 - li.discount_pct / 100), 2),
                "line_total": round(li.quantity * li.unit_price * (1 - li.discount_pct / 100), 2),
            }
            for i, li in enumerate(items)
        ]

    try:
        from app.db.connection import get_pool
        from app.db import quote_queries
        pool = await get_pool()
        if pool:
            await quote_queries.ensure_tables(pool)
            quote_number = await quote_queries.next_quote_number(pool)
            payload = {
                "quote_number":   quote_number,
                "created_at":     today.isoformat(),
                "valid_till":     (today + datetime.timedelta(days=req.validity_days)).isoformat(),
                "status":         "DRAFT",
                **req.model_dump(exclude={"line_items"}),
                "subtotal":       round(subtotal, 2),
                "gst_amount":     round(gst_amount, 2),
                "grand_total":    round(grand_total, 2),
                "avg_margin_pct": avg_margin,
                "line_items":     _line_items_expanded(req.line_items),
            }
            new_id = await quote_queries.insert_quote(pool, payload)
            payload["quote_id"]  = new_id
            payload["margin_pct"] = avg_margin
            logger.info("Saved quote %s (id=%s) for %s to MySQL", quote_number, new_id, req.customer_name)
            return {"quote": payload, "message": "Quote saved to database", "data_source": "mysql"}
    except Exception as exc:
        logger.warning("Quote create DB error: %s", exc)

    new_id = 100
    quote = {
        "quote_id":    new_id,
        "quote_number": f"QT-{today.year}-{new_id:04d}",
        "created_at":  today.isoformat(),
        "valid_till":  (today + datetime.timedelta(days=req.validity_days)).isoformat(),
        "status":      "DRAFT",
        **req.model_dump(exclude={"line_items"}),
        "subtotal":    round(subtotal, 2),
        "gst_amount":  round(gst_amount, 2),
        "grand_total": round(grand_total, 2),
        "margin_pct":  avg_margin,
        "line_items":  _line_items_expanded(req.line_items),
    }
    logger.info("Created demo quote %s for %s", quote["quote_number"], req.customer_name)
    return {"quote": quote, "message": "Quote created (demo mode — not persisted)", "data_source": "demo"}


@router.put("/quotes/{quote_id}/status")
async def update_quote_status(quote_id: int, req: UpdateQuoteStatus):
    if req.status.upper() not in VALID_STATUSES:
        raise HTTPException(status_code=422, detail=f"Invalid status. Use one of: {', '.join(VALID_STATUSES)}")

    try:
        from app.db.connection import get_pool
        from app.db import quote_queries
        pool = await get_pool()
        if pool:
            updated = await quote_queries.update_status_db(pool, quote_id, req.status, req.remarks)
            if updated:
                return {
                    "quote_id":   quote_id,
                    "status":     req.status.upper(),
                    "remarks":    req.remarks,
                    "updated_at": datetime.datetime.utcnow().isoformat(),
                    "message":    "Status updated",
                    "data_source": "mysql",
                }
    except Exception as exc:
        logger.warning("Quote status update DB error: %s", exc)

    return {
        "quote_id":   quote_id,
        "status":     req.status.upper(),
        "remarks":    req.remarks,
        "updated_at": datetime.datetime.utcnow().isoformat(),
        "message":    "Status updated (demo mode)",
        "data_source": "demo",
    }


@router.put("/quotes/{quote_id}")
async def update_quote(quote_id: int, req: CreateQuoteRequest):
    """Full quote update — replaces all fields and line items; status is preserved."""
    today = datetime.date.today()
    subtotal = sum(
        li.quantity * li.unit_price * (1 - li.discount_pct / 100)
        for li in req.line_items
    )
    gst_amount  = subtotal * req.gst_rate / 100
    freight     = req.freight_amount if req.include_freight else 0
    grand_total = subtotal + gst_amount + freight
    total_buy   = sum(li.quantity * li.buy_price for li in req.line_items if li.buy_price)
    avg_margin  = round((subtotal - total_buy) / subtotal * 100, 1) if subtotal > 0 and total_buy > 0 else 0.0

    def _expanded(items):
        return [
            {
                "sl": i + 1,
                **li.model_dump(),
                "net_price":  round(li.unit_price * (1 - li.discount_pct / 100), 2),
                "line_total": round(li.quantity * li.unit_price * (1 - li.discount_pct / 100), 2),
            }
            for i, li in enumerate(items)
        ]

    try:
        from app.db.connection import get_pool
        from app.db import quote_queries
        pool = await get_pool()
        if pool:
            await quote_queries.ensure_tables(pool)
            updated = await quote_queries.update_quote_db(pool, quote_id, {
                **req.model_dump(exclude={"line_items"}),
                "valid_till":     (today + datetime.timedelta(days=req.validity_days)).isoformat(),
                "subtotal":       round(subtotal, 2),
                "gst_amount":     round(gst_amount, 2),
                "grand_total":    round(grand_total, 2),
                "avg_margin_pct": avg_margin,
                "line_items":     _expanded(req.line_items),
            })
            if updated:
                updated.setdefault("margin_pct", avg_margin)
                updated.setdefault("avg_margin_pct", avg_margin)
                logger.info("Updated quote %s in MySQL", quote_id)
                return {"quote": updated, "message": "Quote updated", "data_source": "mysql"}
    except Exception as exc:
        logger.warning("Quote update DB error: %s", exc)

    payload = {
        "quote_id":       quote_id,
        "created_at":     today.isoformat(),
        "valid_till":     (today + datetime.timedelta(days=req.validity_days)).isoformat(),
        "status":         "DRAFT",
        **req.model_dump(exclude={"line_items"}),
        "subtotal":       round(subtotal, 2),
        "gst_amount":     round(gst_amount, 2),
        "grand_total":    round(grand_total, 2),
        "margin_pct":     avg_margin,
        "avg_margin_pct": avg_margin,
        "line_items":     _expanded(req.line_items),
    }
    return {"quote": payload, "message": "Quote updated (demo mode)", "data_source": "demo"}


@router.post("/quotes/ai-price")
async def ai_price_recommendation(req: AIPriceRequest):
    """Return AI-suggested discount/margin based on customer type and quantity."""
    base_discount = 0.0
    rationale_parts = []

    # Volume-based discount
    if req.total_quantity >= 5000:
        base_discount += 5.0
        rationale_parts.append("High volume (5000+ units) → 5% volume discount")
    elif req.total_quantity >= 2000:
        base_discount += 3.0
        rationale_parts.append("Medium volume (2000+ units) → 3% volume discount")
    elif req.total_quantity >= 500:
        base_discount += 1.5
        rationale_parts.append("Moderate volume (500+ units) → 1.5% volume discount")

    # Customer-type discount
    type_discounts = {
        "Developer": 2.0,
        "Architect": 1.5,
        "Contractor": 1.0,
        "Interior Firm": 1.5,
        "Retailer": 0.5,
    }
    ct_disc = type_discounts.get(req.customer_type, 0.0)
    if ct_disc:
        base_discount += ct_disc
        rationale_parts.append(f"{req.customer_type} relationship pricing → {ct_disc}% extra")

    # Floor margin protection
    projected_margin = req.current_margin - base_discount
    if projected_margin < 15.0:
        old = base_discount
        base_discount = max(0, req.current_margin - 15.0)
        rationale_parts.append(f"Margin floor 15% applied — capped discount from {old:.1f}% to {base_discount:.1f}%")
        projected_margin = req.current_margin - base_discount

    return {
        "recommended_discount_pct": round(base_discount, 1),
        "projected_margin_pct": round(projected_margin, 1),
        "margin_floor_pct": 15.0,
        "rationale": " · ".join(rationale_parts) if rationale_parts else "Standard pricing — no additional discount recommended",
        "competitive_note": "Market range for this segment: 12–22% margin. Recommended discount keeps you competitive.",
    }


@router.post("/quotes/scan-whatsapp")
async def scan_whatsapp_requirement(file: UploadFile = File(...)):
    """
    Scan a WhatsApp screenshot, exported chat (.txt) or BOQ document.
    Uses GPT-4o Vision for images; text extraction for .txt/.pdf.
    Returns extracted requirements + catalog product matches + pre-filled quote lines.
    """
    api_key = os.getenv("OPENAI_API_KEY", "")
    if not api_key:
        return _demo_scan_result("No OPENAI_API_KEY configured — showing demo extraction.")

    file_bytes = await file.read()
    content_type = file.content_type or ""
    filename     = (file.filename or "").lower()

    is_image = content_type.startswith("image/") or filename.endswith((".jpg", ".jpeg", ".png", ".webp", ".gif"))

    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=api_key)

        if is_image:
            b64 = base64.b64encode(file_bytes).decode()
            ct  = content_type if content_type.startswith("image/") else "image/jpeg"
            response = await client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": _EXTRACTION_SYSTEM},
                    {"role": "user", "content": [
                        {"type": "image_url", "image_url": {"url": f"data:{ct};base64,{b64}", "detail": "high"}},
                        {"type": "text",      "text": "Extract all product requirements from this WhatsApp screenshot or BOQ image. Return ONLY valid JSON as specified."},
                    ]},
                ],
                max_tokens=2000,
                response_format={"type": "json_object"},
            )
        else:
            # Text: WhatsApp .txt export or PDF text layer
            text_content = file_bytes.decode("utf-8", errors="ignore")[:10000]
            response = await client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": _EXTRACTION_SYSTEM},
                    {"role": "user", "content": f"Extract all product requirements from this message/document. Return ONLY valid JSON as specified.\n\n---\n{text_content}\n---"},
                ],
                max_tokens=2000,
                response_format={"type": "json_object"},
            )

        raw = response.choices[0].message.content
        extracted = json.loads(raw)

    except Exception as exc:
        logger.exception("scan-whatsapp OpenAI error: %s", exc)
        return _demo_scan_result(f"AI extraction failed ({type(exc).__name__}) — showing demo result.")

    required_products = extracted.get("required_products", [])
    matched = _match_to_catalog(required_products)

    return {
        "extracted":        extracted,
        "matched_products": matched,
        "suggested_lines":  _build_suggested_lines(matched),
        "data_source":      "openai",
    }


# ── Quote Analyzer helpers ─────────────────────────────────────────────────────

def _analyze_rule_based(req: "AnalyzeQuoteRequest") -> dict:
    items = req.line_items

    item_analysis = []
    for li in items:
        net    = li.unit_price * (1 - li.discount_pct / 100) if li.unit_price > 0 else 0
        margin = (net - li.buy_price) / net * 100 if net > 0 and li.buy_price > 0 else None
        line_t = net * li.quantity
        if margin is None:
            status = "unknown"
        elif margin < 14:
            status = "critical"
        elif margin < 18:
            status = "at_risk"
        else:
            status = "healthy"
        item_analysis.append({
            "product_name": li.product_name,
            "net_price":    round(net, 2),
            "margin_pct":   round(margin, 1) if margin is not None else None,
            "line_total":   round(line_t, 2),
            "status":       status,
        })

    margins     = [a["margin_pct"] for a in item_analysis if a["margin_pct"] is not None]
    avg_margin  = sum(margins) / len(margins) if margins else 0
    below_floor = sum(1 for m in margins if m < 14)
    total_val   = req.subtotal * (1 + req.gst_rate / 100) + (req.freight_amount if req.include_freight else 0)

    deal_size = "large" if total_val >= 1_000_000 else "medium" if total_val >= 200_000 else "small"

    # Win probability (rule engine)
    score = 65
    if avg_margin > 0:
        if avg_margin <= 16:   score += 15
        elif avg_margin <= 20: score += 8
        elif avg_margin > 25:  score -= 10
    score += {"Developer": 5, "Architect": 8, "Interior Firm": 6, "Contractor": 3, "Retailer": 2}.get(req.customer_type, 0)
    if deal_size == "large": score -= 5
    if deal_size == "small": score += 5
    if "advance" in req.payment_terms.lower(): score += 5
    score -= below_floor * 5
    score = max(20, min(95, score))

    insights = []
    actions  = []
    if below_floor:
        insights.append(f"{below_floor} item(s) below 14% margin floor — immediate pricing correction needed")
        actions.append({"action": f"Raise price on {below_floor} critical item(s) to restore minimum 14% margin", "impact": "high"})
    if avg_margin > 24:
        room = round(avg_margin - 20, 1)
        insights.append(f"Avg margin {avg_margin:.1f}% — you have {room}% headroom to sharpen price if needed")
        actions.append({"action": f"Offer up to {min(room, 5):.0f}% strategic discount to improve win probability", "impact": "medium"})
    if 0 < avg_margin < 17:
        insights.append(f"Margin {avg_margin:.1f}% is very competitive — use this as your key selling point")
    if deal_size == "large":
        insights.append("Large deal — propose phased delivery or milestone-based payments to reduce buyer risk")
        actions.append({"action": "Add phased delivery schedule + payment milestones to the Notes section", "impact": "medium"})
    if req.customer_type == "Developer":
        insights.append("Developers compare 3+ suppliers — emphasise IS certification, brand, and on-time delivery SLA")
        actions.append({"action": "Add IS/EN certification numbers and guaranteed delivery window to notes", "impact": "high"})
    elif req.customer_type == "Architect":
        insights.append("Architects drive future projects — offer spec sheet support and a complimentary sample kit")
        actions.append({"action": "Offer complimentary sample kit and technical specification sheets", "impact": "high"})
    if not req.notes:
        insights.append("No special notes — add delivery SLA, certifications, and unique selling points to win")
        actions.append({"action": "Fill in Notes: guaranteed delivery date, IS certification, and your USPs", "impact": "medium"})
    if len(items) == 1:
        insights.append("Single-line quote — consider suggesting a complementary product to grow deal value")

    cats = [li.category for li in items]
    upsell = ""
    if "Aluminium Louvers" in cats and "HPL Exterior Cladding" not in cats:
        upsell = "Add HPL Exterior Cladding 6mm — common pairing with aluminium louvers on facade projects"
    elif "High Pressure Laminate" in cats and "Acrylic Laminate" not in cats:
        upsell = "Suggest Acrylic High-Gloss for premium kitchen zones — 18% higher value, easy upsell with sample"
    elif "PVC Louvers" in cats and "Aluminium Louvers" not in cats:
        upsell = "Upgrade pitch: Aluminium Z-100 for premium areas, PVC for budget zones — two-tier option"
    elif "Compact Laminate" in cats and "Aluminium Composite Panel" not in cats:
        upsell = "Add ACP 4mm FR for exterior areas — required by NBC 2016 for buildings above G+4"

    health = "critical" if below_floor or avg_margin < 14 else "at_risk" if avg_margin < 17 else "good"

    strategy = ""
    if avg_margin < 14:
        strategy = "Critical: Prices are below margin floor. Increase list prices or remove discount before sending."
    elif avg_margin < 17:
        strategy = f"Competitive stance at {avg_margin:.1f}% margin. Hold on further discounts — lead with reliability, certifications, and delivery speed instead."
    elif avg_margin < 23:
        if deal_size == "large":
            strategy = f"Healthy {avg_margin:.1f}% margin on a large deal. Offer up to 2–3% discount as a closing lever if negotiation stalls."
        else:
            strategy = f"Healthy {avg_margin:.1f}% margin. Lead with quality and delivery certainty. Reserve discount as a closing tool."
    else:
        strategy = f"Strong {avg_margin:.1f}% margin gives you negotiation room. You can offer up to {avg_margin - 20:.0f}% discount while staying above 20% floor."

    return {
        "win_probability":          score,
        "deal_health":              health,
        "avg_margin_pct":           round(avg_margin, 1),
        "deal_size":                deal_size,
        "total_value":              round(total_val, 2),
        "item_analysis":            item_analysis,
        "key_insights":             insights[:5],
        "recommended_actions":      actions[:4],
        "upsell_opportunity":       upsell,
        "pricing_strategy":         strategy,
        "win_probability_rationale":"",
        "data_source":              "rule_engine",
    }


@router.post("/quotes/analyze")
async def analyze_quote(req: AnalyzeQuoteRequest):
    """
    Comprehensive AI analysis of a quotation in progress.
    Returns win probability, per-item margin health, pricing strategy, and actionable recommendations.
    Rule-based analysis is always returned instantly; GPT-4o enhances it when an API key is present.
    """
    result = _analyze_rule_based(req)

    api_key = os.getenv("OPENAI_API_KEY", "")
    if not api_key or not req.line_items:
        return result

    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=api_key)

        items_text = "\n".join([
            f"- {li.product_name} ({li.category}): {li.quantity} {li.unit} @ ₹{li.unit_price}, "
            f"disc {li.discount_pct}%, buy ₹{li.buy_price}"
            for li in req.line_items
        ])
        prompt = (
            f"Analyse this building-materials quotation and return JSON with keys: "
            f"key_insights (list of 4 specific insights, max 90 chars each), "
            f"recommended_actions (list of 3 objects with 'action' str and 'impact' high/medium/low), "
            f"pricing_strategy (1 short paragraph), "
            f"upsell_opportunity (one specific suggestion or empty string), "
            f"win_probability_rationale (1 sentence explaining score {result['win_probability']}/100).\n\n"
            f"Customer: {req.customer_name or 'Unknown'} ({req.customer_type})\n"
            f"Project: {req.project_name or 'Not specified'}\n"
            f"Payment: {req.payment_terms}\nTotal: ₹{result['total_value']:,.0f}\n"
            f"Avg margin: {result['avg_margin_pct']}%\nItems:\n{items_text}\nNotes: {req.notes or 'None'}"
        )
        resp = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a building-materials sales strategist in Bangalore. Return only valid JSON."},
                {"role": "user",   "content": prompt},
            ],
            max_tokens=900,
            response_format={"type": "json_object"},
        )
        ai = json.loads(resp.choices[0].message.content)
        result.update({
            "key_insights":             ai.get("key_insights", result["key_insights"]),
            "recommended_actions":      ai.get("recommended_actions", result["recommended_actions"]),
            "pricing_strategy":         ai.get("pricing_strategy", result["pricing_strategy"]),
            "upsell_opportunity":       ai.get("upsell_opportunity", result["upsell_opportunity"]),
            "win_probability_rationale": ai.get("win_probability_rationale", ""),
            "data_source":              "openai",
        })
    except Exception as exc:
        logger.exception("Quote analyze OpenAI error: %s", exc)

    return result
