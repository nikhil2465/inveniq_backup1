"""
Product Catalog API — InvenIQ
Comprehensive product database for Louvers, Laminates, PVC & Building Materials.
Covers HPL, Compact Laminate, Acrylic, PVC Laminates, Aluminium Louvers, PVC Louvers,
Operable Louvre Systems — with full specs, applications, certifications, and pricing.
"""
from typing import Optional
from fastapi import APIRouter

router = APIRouter(tags=["Product Catalog"])

# ── Full product catalog ───────────────────────────────────────────────────────

CATALOG = [
    # ── HIGH PRESSURE LAMINATES ────────────────────────────────────────────────
    {
        "product_id": 101, "sku_code": "HPL-1MM-MATTE",
        "name": "HPL 1mm Matte / Suede",
        "brand": "Greenlam / Merino / Century",
        "category": "High Pressure Laminate", "sub_category": "Standard HPL",
        "unit": "sheet", "size": "8×4 ft (2440×1220 mm)", "thickness": "1.0 mm",
        "finish": "Matte, Suede, Smooth", "weight_kg": 3.2,
        "colors": "200+ shades — solid colours, wood grain, stone, metallic",
        "buy_price": 950, "sell_price": 1300, "margin_pct": 26.9,
        "gst_rate": 18.0, "hsn_code": "4814",
        "applications": [
            "Kitchen cabinet shutters", "Wardrobe panels & sliding doors",
            "Office furniture & workstations", "Wall cladding (interior)",
            "Reception counters", "Retail display fixtures",
        ],
        "certifications": ["IS 2046:2019", "E1 Formaldehyde emission", "Fire retardant grade (FR) available", "CARB Phase 2 compliant"],
        "features": [
            "Abrasion resistant — EN 438 Grade P", "Moisture & steam resistant",
            "Anti-fingerprint surface option", "25-year product life", "Easy to clean & maintain",
            "Impact & scratch resistant",
        ],
        "installation_tips": "Use white PVC edgeband to match. Recommended adhesive: contact cement or PU adhesive.",
        "lead_time": "5–7 days", "moq": 20, "stock_status": "in_stock",
        "tags": ["popular", "furniture", "interior", "kitchen"],
        "competitors": ["Formica", "Durian", "Stylam", "Action TESA"],
    },
    {
        "product_id": 102, "sku_code": "HPL-1.5MM-MATTE",
        "name": "HPL 1.5mm Matte (Post-form)",
        "brand": "Greenlam / Merino",
        "category": "High Pressure Laminate", "sub_category": "Post-Form HPL",
        "unit": "sheet", "size": "8×4 ft", "thickness": "1.5 mm",
        "finish": "Matte, Gloss", "weight_kg": 4.8,
        "colors": "100+ shades",
        "buy_price": 1250, "sell_price": 1680, "margin_pct": 25.6,
        "gst_rate": 18.0, "hsn_code": "4814",
        "applications": [
            "Post-formed countertops", "Round-edge furniture", "Curved doors",
            "Lab furniture", "Hospital trolleys",
        ],
        "certifications": ["IS 2046:2019", "Post-formable grade certified"],
        "features": [
            "Can be heat-bent to radius ≥ 40mm", "Higher bending strength",
            "Moisture resistant", "Hygienic surface",
        ],
        "installation_tips": "Heat to 160°C, bend over jig while warm. Cool under clamps.",
        "lead_time": "7–10 days", "moq": 15, "stock_status": "in_stock",
        "tags": ["post-form", "countertop", "curved"],
        "competitors": ["Formica", "Wilsonart"],
    },
    {
        "product_id": 103, "sku_code": "HPL-COMPACT-6MM",
        "name": "HPL Compact Laminate 6mm",
        "brand": "Greenlam / Stylam",
        "category": "Compact Laminate", "sub_category": "Compact HPL",
        "unit": "sheet", "size": "8×4 ft (2440×1220 mm)", "thickness": "6 mm",
        "finish": "Matte both sides", "weight_kg": 19.2,
        "colors": "30+ solid shades, wood grain",
        "buy_price": 2980, "sell_price": 3600, "margin_pct": 17.2,
        "gst_rate": 18.0, "hsn_code": "4814",
        "applications": [
            "Toilet cubicle partitions & doors", "Exterior cladding & facades",
            "Wet area wall panels", "Swimming pool surrounds",
            "Laboratory benchtops", "Hospital & cleanroom panels",
            "Locker room dividers",
        ],
        "certifications": [
            "IS 2046:2019", "Moisture & fungal resistant", "Fire retardant (EN 13501-1 Class B)",
            "UV resistant", "Anti-graffiti surface available",
        ],
        "features": [
            "Phenolic core — no substrate needed", "Both faces finished",
            "Waterproof & humid area suitable", "Impact & vandal resistant",
            "No swelling, no delamination", "10-year warranty",
        ],
        "installation_tips": "Use stainless steel or aluminium fittings. 3mm expansion gap on all edges. Silicone seal perimeter.",
        "lead_time": "7–10 days", "moq": 10, "stock_status": "in_stock",
        "tags": ["compact", "toilet-cubicle", "exterior", "wet-area"],
        "competitors": ["Pfleiderer", "Kronospan", "ABET Laminati"],
    },
    {
        "product_id": 104, "sku_code": "HPL-COMPACT-12MM",
        "name": "HPL Compact Laminate 12mm",
        "brand": "Greenlam / Stylam",
        "category": "Compact Laminate", "sub_category": "Compact HPL",
        "unit": "sheet", "size": "8×4 ft", "thickness": "12 mm",
        "finish": "Matte both sides", "weight_kg": 38.4,
        "colors": "20+ solid shades",
        "buy_price": 5800, "sell_price": 7200, "margin_pct": 19.4,
        "gst_rate": 18.0, "hsn_code": "4814",
        "applications": [
            "Full-height toilet cubicle doors (standalone, no frame)",
            "Structural exterior panels", "Benchtop slabs",
            "Interior wall systems", "High-traffic partitions",
        ],
        "certifications": ["IS 2046:2019", "Structural grade", "Fire Class B-s1-d0"],
        "features": [
            "Self-supporting structural panels", "Both faces finished HPL",
            "Maximum impact resistance", "Hygienic — bacteria inhibiting surface",
        ],
        "installation_tips": "Bottom gap 20mm. Use stainless M6 bolts. No silicone on top.",
        "lead_time": "10–14 days", "moq": 5, "stock_status": "in_stock",
        "tags": ["compact", "structural", "toilet-cubicle"],
        "competitors": ["Pfleiderer", "ABET Laminati"],
    },
    {
        "product_id": 105, "sku_code": "ACRYLIC-LAM-84",
        "name": "Acrylic Laminate High-Gloss",
        "brand": "Durian / Generic",
        "category": "Acrylic Laminate", "sub_category": "High-Gloss",
        "unit": "sheet", "size": "8×4 ft (2440×1220 mm)", "thickness": "1.0 mm",
        "finish": "High-Gloss, Super-Gloss, Pearl, Metallic", "weight_kg": 2.8,
        "colors": "80+ shades — solid, metallic, pearlescent",
        "buy_price": 1720, "sell_price": 2100, "margin_pct": 18.1,
        "gst_rate": 18.0, "hsn_code": "3921",
        "applications": [
            "Modular kitchen shutter fronts", "Wardrobe mirror-finish shutters",
            "Retail display counters", "Luxury furniture", "Show flat interiors",
            "Hospitality & hotel furniture",
        ],
        "certifications": ["Anti-scratch coating", "UV resistant", "Food-safe surface"],
        "features": [
            "Piano-gloss mirror finish", "Anti-fingerprint coating available",
            "Scratch & impact resistant acrylic layer", "No fading under UV",
            "Easy wipe-clean maintenance",
        ],
        "installation_tips": "Apply with PU glue only. Avoid contact cement. Use edge profile to finish. Handle with cotton gloves.",
        "lead_time": "5–7 days", "moq": 20, "stock_status": "in_stock",
        "tags": ["acrylic", "high-gloss", "kitchen", "luxury"],
        "competitors": ["Merino Acrylic", "Action TESA", "Greenlam Acrylic"],
    },
    {
        "product_id": 106, "sku_code": "PVC-LAM-GLOSS",
        "name": "PVC Laminate (Solid Colour)",
        "brand": "Various",
        "category": "PVC Laminate", "sub_category": "Solid PVC",
        "unit": "sheet", "size": "8×4 ft", "thickness": "0.8 mm",
        "finish": "Gloss, Matte, Texture", "weight_kg": 1.9,
        "colors": "150+ colours",
        "buy_price": 380, "sell_price": 580, "margin_pct": 34.5,
        "gst_rate": 18.0, "hsn_code": "3921",
        "applications": [
            "Budget furniture overlays", "Modular kitchen (economy range)",
            "Office partitions", "Retail shelving",
        ],
        "certifications": ["Moisture resistant", "IS 12823 compliant"],
        "features": [
            "Economy alternative to HPL", "Easy to cut & apply",
            "Wide colour range", "Gloss or matte variants",
        ],
        "installation_tips": "Use contact cement (fevicol or equivalent). Press with roller. Trim with router.",
        "lead_time": "2–3 days", "moq": 50, "stock_status": "in_stock",
        "tags": ["pvc", "economy", "laminate", "furniture"],
        "competitors": ["Nilkamal", "Supreme"],
    },
    {
        "product_id": 107, "sku_code": "PVC-WOOD-GRAIN",
        "name": "PVC Wood-Grain Laminate",
        "brand": "Various",
        "category": "PVC Laminate", "sub_category": "Wood-Grain PVC",
        "unit": "sheet", "size": "8×4 ft", "thickness": "0.8 mm",
        "finish": "Wood grain texture", "weight_kg": 1.9,
        "colors": "50+ wood species — teak, wenge, walnut, oak, maple",
        "buy_price": 420, "sell_price": 640, "margin_pct": 34.4,
        "gst_rate": 18.0, "hsn_code": "3921",
        "applications": ["Furniture overlays", "Door skins", "Cabinet interiors"],
        "certifications": ["Moisture resistant"],
        "features": ["Embossed wood texture", "Realistic wood grain", "Cost-effective wood look"],
        "installation_tips": "Same as solid PVC. Apply uniform pressure with J-roller.",
        "lead_time": "2–3 days", "moq": 50, "stock_status": "in_stock",
        "tags": ["pvc", "wood-grain", "furniture"],
        "competitors": ["Nilkamal"],
    },
    # ── ALUMINIUM LOUVERS ──────────────────────────────────────────────────────
    {
        "product_id": 108, "sku_code": "LOUV-ALU-Z100-ANOD",
        "name": "Aluminium Z-Profile 100mm Anodized",
        "brand": "Supreme Profile / Jindal Aluminium",
        "category": "Aluminium Louvers", "sub_category": "Fixed Blade",
        "unit": "RM", "size": "Width: 100mm | Thickness: 2.0mm",
        "finish": "Anodized — Silver, Bronze, Gold, Black",
        "weight_kg": 1.8,
        "colors": "Anodized: Natural Silver, Bronze, Champagne, Dark Anodized",
        "buy_price": 1720, "sell_price": 2100, "margin_pct": 18.1,
        "gst_rate": 18.0, "hsn_code": "7604",
        "applications": [
            "Building facade sun shading", "Ventilation screens & louvre walls",
            "Car park screening (all levels)", "Plant room enclosures",
            "Industrial screening", "Commercial & residential balcony privacy",
        ],
        "certifications": [
            "AA-25 Anodizing (25 micron) — IS 1868", "QUALICOAT certification",
            "Wind load tested to IS 875 Part 3", "Aluminium Alloy 6063-T5 / 6061-T6",
        ],
        "features": [
            "Maintenance-free for 20+ years", "No painting required",
            "Corrosion resistant — coastal environments",
            "Custom blade angle (0°–90°)", "Concealed fixing system",
            "Structural aluminium — self-supporting",
        ],
        "installation_tips": "Fix to structural sub-frame at 600mm centres. Use stainless M8 bolts. Thermal break required for A/C-rated facades.",
        "lead_time": "8–12 days", "moq": 100, "stock_status": "in_stock",
        "tags": ["aluminium", "louver", "facade", "anodized", "commercial"],
        "competitors": ["Technal", "Alufit", "YKK AP"],
    },
    {
        "product_id": 109, "sku_code": "LOUV-ALU-Z80-PC",
        "name": "Aluminium Z-Profile 80mm Powder Coated",
        "brand": "Aluline / Alufit",
        "category": "Aluminium Louvers", "sub_category": "Fixed Blade",
        "unit": "RM", "size": "Width: 80mm | Thickness: 1.8mm",
        "finish": "Powder Coated — any RAL colour",
        "weight_kg": 1.4,
        "colors": "Full RAL range (3000+ colours) — custom colour on request",
        "buy_price": 1350, "sell_price": 1680, "margin_pct": 19.6,
        "gst_rate": 18.0, "hsn_code": "7604",
        "applications": [
            "Office building facades", "Interior partitions & screens",
            "Staircase balustrades", "Hotel balcony privacy screens",
            "Retail facade feature elements", "Residential gate screens",
        ],
        "certifications": [
            "PVDF coating — EN 13523", "RAL colour certified",
            "Aluminium Alloy 6063-T5", "IS 875 wind load compliance",
        ],
        "features": [
            "PVDF powder coat — 15-year colour guarantee", "Any RAL colour",
            "Lightweight — easier installation", "Powder coat over anodized base",
            "Fire rated option (15/30 min) available",
        ],
        "installation_tips": "Pre-drill holes at 800mm centres. Use neoprene washers to prevent galvanic corrosion with steel.",
        "lead_time": "10–14 days", "moq": 80, "stock_status": "in_stock",
        "tags": ["aluminium", "louver", "powder-coat", "RAL", "commercial"],
        "competitors": ["Technal", "Alufit"],
    },
    {
        "product_id": 110, "sku_code": "LOUV-ALU-C150-ANOD",
        "name": "Aluminium C-Profile 150mm (Aerofoil Blade)",
        "brand": "Jindal / Supreme Profile",
        "category": "Aluminium Louvers", "sub_category": "Aerofoil Blade",
        "unit": "RM", "size": "Width: 150mm | Chord: 2.5mm",
        "finish": "Anodized or Powder Coated",
        "weight_kg": 2.4,
        "colors": "Anodized or RAL powder coat",
        "buy_price": 2800, "sell_price": 3500, "margin_pct": 20.0,
        "gst_rate": 18.0, "hsn_code": "7604",
        "applications": [
            "Premium facade systems", "High-wind zone buildings",
            "Airports & transportation hubs", "Hospitals & institutions",
            "Luxury residential towers",
        ],
        "certifications": ["CWCT tested", "Wind zone 4 (IS 875)", "Structural aerofoil grade"],
        "features": [
            "Aerofoil cross-section — superior strength", "Wider blade — more privacy + shading",
            "Low wind resistance design", "Suitable for high-rise buildings",
            "Concealed rod-and-bracket system",
        ],
        "installation_tips": "Structural engineer sign-off required for buildings >15m. Stainless M10 fixings.",
        "lead_time": "14–21 days", "moq": 50, "stock_status": "on_order",
        "tags": ["aluminium", "louver", "aerofoil", "premium", "facade"],
        "competitors": ["Technal", "YKK AP"],
    },
    # ── PVC LOUVERS ───────────────────────────────────────────────────────────
    {
        "product_id": 111, "sku_code": "LOUV-PVC-100",
        "name": "PVC Louver Blades 100mm",
        "brand": "Polycab / Supreme / Coltors",
        "category": "PVC Louvers", "sub_category": "Fixed Blade",
        "unit": "RM", "size": "Width: 100mm | Thickness: 3.0mm",
        "finish": "Smooth — White, Ivory, Grey, Black",
        "weight_kg": 0.38,
        "colors": "White, Ivory, Cream, Light Grey, Dark Grey, Black — custom colour available",
        "buy_price": 390, "sell_price": 580, "margin_pct": 32.8,
        "gst_rate": 18.0, "hsn_code": "3925",
        "applications": [
            "Residential window & door screens", "Car park screening (budget)",
            "Building ventilation grilles", "Garden & compound walls",
            "HVAC equipment screening", "Residential privacy screens",
        ],
        "certifications": [
            "UV stabilised — EN 13049", "10-year UV warranty",
            "Self-extinguishing (V-2 rating)", "IS 12823 compliant",
        ],
        "features": [
            "UV stabilised — no yellowing for 10+ years", "Lightweight — easy DIY installation",
            "Termite & rust proof", "Maintenance free", "Low cost solution",
            "Cut on site with standard hacksaw",
        ],
        "installation_tips": "Fix to aluminium or GI channel tracks. Use UV-resistant screws. Expansion gap 3mm per metre.",
        "lead_time": "3–5 days", "moq": 150, "stock_status": "in_stock",
        "tags": ["pvc", "louver", "budget", "residential", "car-park"],
        "competitors": ["Hindustan Profiles", "Sintex"],
    },
    {
        "product_id": 112, "sku_code": "LOUV-PVC-75-WIDE",
        "name": "PVC Louver Blades 75mm (Slim)",
        "brand": "Polycab / Coltors",
        "category": "PVC Louvers", "sub_category": "Slim Blade",
        "unit": "RM", "size": "Width: 75mm | Thickness: 2.5mm",
        "finish": "Smooth — White, Grey", "weight_kg": 0.28,
        "colors": "White, Light Grey",
        "buy_price": 280, "sell_price": 430, "margin_pct": 34.9,
        "gst_rate": 18.0, "hsn_code": "3925",
        "applications": ["Window louvres", "Ventilation panels", "Residential gates"],
        "certifications": ["UV stabilised", "Self-extinguishing"],
        "features": ["Slimmer profile for smaller openings", "Lightweight", "Easy cut & fit"],
        "installation_tips": "Same as 100mm. Use narrower tracks to match 75mm width.",
        "lead_time": "3–5 days", "moq": 200, "stock_status": "in_stock",
        "tags": ["pvc", "louver", "slim", "residential"],
        "competitors": ["Hindustan Profiles"],
    },
    # ── OPERABLE LOUVRE SYSTEMS ────────────────────────────────────────────────
    {
        "product_id": 113, "sku_code": "LOUV-OPS-MTR",
        "name": "Operable Louvre System — Motorised",
        "brand": "Technal / Somfy / YKK AP",
        "category": "Operable Louvre System", "sub_category": "Motorised",
        "unit": "SQM", "size": "Custom — up to 8m span",
        "finish": "Powder coated — any RAL colour",
        "weight_kg": 28,
        "colors": "Full RAL range",
        "buy_price": 9200, "sell_price": 12000, "margin_pct": 23.3,
        "gst_rate": 18.0, "hsn_code": "8302",
        "applications": [
            "Rooftop pergolas & terrace covers", "Commercial atrium roofs",
            "Restaurant alfresco dining roofs", "Hotel poolside covers",
            "Residential roof gardens", "Event venue retractable roofs",
        ],
        "certifications": [
            "Somfy motor — CE certified, IP54", "Wind speed rated to 120 km/h",
            "Rain sensor auto-close option", "5-year system warranty",
            "IS 875 Part 3 wind compliance",
        ],
        "features": [
            "Remote control / smartphone app (SOMFY TaHoma)",
            "Auto-close on rain / wind sensor",
            "0°–90° blade rotation", "Concealed rainwater drainage",
            "LED strip lighting integration option",
            "Full open = 80% ventilation; full close = watertight",
        ],
        "installation_tips": "Structural engineer assessment required. Minimum beam depth 200mm. Allow 3 weeks for fabrication + 3 days install.",
        "lead_time": "21–30 days", "moq": 8, "stock_status": "on_order",
        "tags": ["operable", "motorised", "pergola", "premium", "somfy"],
        "competitors": ["Vergola", "Louvretec", "Eco Awnings"],
    },
    {
        "product_id": 114, "sku_code": "LOUV-OPS-MAN",
        "name": "Operable Louvre System — Manual Crank",
        "brand": "Generic / Alufit",
        "category": "Operable Louvre System", "sub_category": "Manual",
        "unit": "SQM", "size": "Custom — up to 5m span",
        "finish": "Powder coated",
        "weight_kg": 22,
        "colors": "RAL colour on request",
        "buy_price": 5800, "sell_price": 8000, "margin_pct": 27.5,
        "gst_rate": 18.0, "hsn_code": "8302",
        "applications": [
            "Residential pergolas & gazebos", "Small commercial covered areas",
            "Budget hospitality projects",
        ],
        "certifications": ["Wind rated to 80 km/h", "3-year system warranty"],
        "features": [
            "Manual hand-crank operation", "0°–90° blade rotation",
            "Rainwater drainage channels", "No electricity required",
        ],
        "installation_tips": "Suitable for spans up to 5m. Upgrade to motorised for larger projects.",
        "lead_time": "14–18 days", "moq": 10, "stock_status": "in_stock",
        "tags": ["operable", "manual", "pergola", "residential"],
        "competitors": ["Vergola"],
    },
    # ── EXTERIOR CLADDING ──────────────────────────────────────────────────────
    {
        "product_id": 115, "sku_code": "HPL-EXT-CLADDING-6MM",
        "name": "HPL Exterior Cladding 6mm (Facade)",
        "brand": "Greenlam Clad / Trespa",
        "category": "Exterior Cladding", "sub_category": "HPL Facade",
        "unit": "sheet", "size": "8×4 ft or custom", "thickness": "6 mm",
        "finish": "Weather-proof matte / wood grain",
        "weight_kg": 19.2,
        "colors": "50+ exterior-grade colours, wood grains, stone",
        "buy_price": 3800, "sell_price": 4800, "margin_pct": 20.8,
        "gst_rate": 18.0, "hsn_code": "4814",
        "applications": [
            "Building exterior facade cladding", "Balcony & terrace panels",
            "Column cladding", "Signage backing panels",
            "Wet area exterior walls",
        ],
        "certifications": [
            "Weather resistant — EN 438-6", "UV & rain tested",
            "Fire Class A2 option available", "15-year exterior warranty",
        ],
        "features": [
            "100% waterproof phenolic core", "Zero maintenance",
            "Will not rot, rust or corrode", "Fade-resistant pigments",
            "Custom cut sizes available",
        ],
        "installation_tips": "Ventilated facade system — 25mm cavity minimum. Stainless T-shaped clips. Expansion gap 5mm per sheet.",
        "lead_time": "10–14 days", "moq": 10, "stock_status": "in_stock",
        "tags": ["exterior", "cladding", "facade", "waterproof"],
        "competitors": ["Trespa", "Panolam", "Vivalda"],
    },
    {
        "product_id": 116, "sku_code": "ACP-3MM-PE",
        "name": "Aluminium Composite Panel 3mm (PE Core)",
        "brand": "Alucobond / Alumax / Alucoil",
        "category": "Aluminium Composite Panel", "sub_category": "Standard ACP",
        "unit": "sheet", "size": "8×4 ft (2440×1220 mm)", "thickness": "3 mm",
        "finish": "PVDF / PE coated — smooth",
        "weight_kg": 6.8,
        "colors": "Full RAL + special metallic & mirror finishes",
        "buy_price": 1200, "sell_price": 1600, "margin_pct": 25.0,
        "gst_rate": 18.0, "hsn_code": "7606",
        "applications": [
            "Shop front signage & fascias", "Interior wall cladding",
            "Partition panels", "Lift interiors",
            "Furniture & display stands",
        ],
        "certifications": ["IS 2553", "PE/PVDF coating standard"],
        "features": [
            "Lightweight — easy handling & cutting", "Flatness — no warping",
            "Wide colour range", "Easy to fabricate (CNC routing, bending)",
        ],
        "installation_tips": "Use router to groove and fold. Rivets or screws for mounting. Use compatible sealant.",
        "lead_time": "5–7 days", "moq": 20, "stock_status": "in_stock",
        "tags": ["acp", "aluminium-composite", "signage", "cladding"],
        "competitors": ["Alucobond", "Alucoil", "Viva"],
    },
    {
        "product_id": 117, "sku_code": "ACP-4MM-FR",
        "name": "Aluminium Composite Panel 4mm (FR Core)",
        "brand": "Alucobond / Alumax",
        "category": "Aluminium Composite Panel", "sub_category": "Fire Rated ACP",
        "unit": "sheet", "size": "8×4 ft", "thickness": "4 mm",
        "finish": "PVDF coated", "weight_kg": 8.2,
        "colors": "Full RAL range",
        "buy_price": 1800, "sell_price": 2400, "margin_pct": 25.0,
        "gst_rate": 18.0, "hsn_code": "7606",
        "applications": [
            "Exterior building cladding (mandatory fire rated)", "High-rise facades",
            "Airport & hospital cladding",
        ],
        "certifications": ["EN 13501-1 Class B-s1-d0", "Fire rated core", "BIS approved"],
        "features": [
            "Fire resistant mineral core", "Meets NBC 2016 fire code",
            "PVDF 70% coating — 10-year colour warranty",
        ],
        "installation_tips": "Compulsory for buildings > G+4 as per NBC 2016 clause 4.2.",
        "lead_time": "7–10 days", "moq": 15, "stock_status": "in_stock",
        "tags": ["acp", "fire-rated", "exterior", "high-rise"],
        "competitors": ["Alucobond FR", "Alpolic FR"],
    },
]

CATEGORIES = sorted(set(p["category"] for p in CATALOG))
BRANDS      = sorted(set(p["brand"].split(" / ")[0] for p in CATALOG))

# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/catalog")
async def get_catalog(
    category: Optional[str] = None,
    search:   Optional[str] = None,
    in_stock: Optional[bool] = None,
):
    products = CATALOG
    if category:
        products = [p for p in products if p["category"].lower() == category.lower()]
    if in_stock is not None:
        products = [p for p in products if (p["stock_status"] == "in_stock") == in_stock]
    if search:
        q = search.lower()
        products = [
            p for p in products
            if q in p["name"].lower() or q in p["category"].lower()
            or q in " ".join(p["tags"]).lower()
            or any(q in app.lower() for app in p.get("applications", []))
        ]
    return {
        "products":    products,
        "total":       len(products),
        "categories":  CATEGORIES,
        "data_source": "catalog",
    }


@router.get("/catalog/categories")
async def get_categories():
    cats = {}
    for p in CATALOG:
        cats.setdefault(p["category"], []).append(p["sub_category"])
    return {"categories": {k: list(set(v)) for k, v in cats.items()}}


@router.get("/catalog/{product_id}")
async def get_product(product_id: int):
    p = next((p for p in CATALOG if p["product_id"] == product_id), None)
    if not p:
        from fastapi import HTTPException
        raise HTTPException(404, f"Product {product_id} not found in catalog")
    return p
