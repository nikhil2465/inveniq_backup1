"""
Project Pipeline Tracker API — InvenIQ
Track projects from Inquiry → Quote → Order → Production → Delivery → Invoice.
Critical for louvers & laminates businesses (project-based sales cycle).
"""
import datetime
import logging
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Project Tracker"])

VALID_STAGES = {
    "INQUIRY", "QUOTE_SENT", "NEGOTIATING", "WON", "LOST",
    "IN_PRODUCTION", "DISPATCHED", "DELIVERED", "INVOICED",
}
VALID_PRIORITIES = {"LOW", "MEDIUM", "HIGH", "CRITICAL"}

class CreateProjectRequest(BaseModel):
    project_name:   str
    client_name:    str
    client_type:    str
    architect_name: Optional[str] = None
    site_location:  str
    category:       str
    estimated_value: float = Field(gt=0)
    stage:          str = "INQUIRY"
    priority:       str = "MEDIUM"
    expected_close: Optional[str] = None
    notes:          Optional[str] = None

class UpdateProjectStage(BaseModel):
    stage:    str
    remarks:  Optional[str] = None

def _mock_projects():
    today = datetime.date.today()
    return [
        {
            "project_id": 1,
            "project_number": "PRJ-2026-0042",
            "project_name": "Prestige Skyrise — Tower A & B Facade",
            "client_name": "Prestige Developers",
            "client_type": "Developer",
            "architect_name": "Sikka & Associates",
            "site_location": "Whitefield, Bangalore",
            "category": "Aluminium Louvers + Operable System",
            "estimated_value": 4800000,
            "confirmed_value": 4200000,
            "stage": "IN_PRODUCTION",
            "priority": "HIGH",
            "expected_close": (today + datetime.timedelta(days=18)).isoformat(),
            "quote_number": "QT-2026-0089",
            "order_number": "LO-20260408-001",
            "margin_pct": 20.1,
            "completion_pct": 65,
            "milestones": [
                {"name": "Inquiry received",       "date": "2026-03-10", "done": True},
                {"name": "Site measurement",       "date": "2026-03-18", "done": True},
                {"name": "Quote QT-2026-0089 sent","date": "2026-03-25", "done": True},
                {"name": "PO received from client","date": "2026-04-05", "done": True},
                {"name": "Production started",     "date": "2026-04-10", "done": True},
                {"name": "Delivery to site",       "date": (today + datetime.timedelta(days=4)).isoformat(), "done": False},
                {"name": "Installation complete",  "date": (today + datetime.timedelta(days=18)).isoformat(), "done": False},
                {"name": "Invoice & payment",      "date": (today + datetime.timedelta(days=25)).isoformat(), "done": False},
            ],
            "notes": "Anodized silver Z-profile + motorised operable system for rooftop pergola. Structural drawings approved.",
            "created_at": "2026-03-10",
            "data_source": "mock",
        },
        {
            "project_id": 2,
            "project_number": "PRJ-2026-0041",
            "project_name": "Brigade Exotica — Apartment Fitout (3BHK)",
            "client_name": "Urban Living Interiors",
            "client_type": "Interior Firm",
            "architect_name": "Urban Living Design Studio",
            "site_location": "Indiranagar, Bangalore",
            "category": "HPL + Acrylic Laminates",
            "estimated_value": 400000,
            "confirmed_value": 365934,
            "stage": "INVOICED",
            "priority": "MEDIUM",
            "expected_close": (today - datetime.timedelta(days=3)).isoformat(),
            "quote_number": "QT-2026-0088",
            "order_number": "LO-20260412-001",
            "margin_pct": 14.2,
            "completion_pct": 100,
            "milestones": [
                {"name": "Inquiry received",        "date": "2026-03-28", "done": True},
                {"name": "Quote QT-2026-0088 sent", "date": "2026-04-02", "done": True},
                {"name": "PO received",             "date": "2026-04-05", "done": True},
                {"name": "Materials dispatched",    "date": "2026-04-14", "done": True},
                {"name": "Delivery confirmed",      "date": "2026-04-18", "done": True},
                {"name": "Invoice raised",          "date": "2026-04-20", "done": True},
                {"name": "Payment received",        "date": (today - datetime.timedelta(days=3)).isoformat(), "done": True},
            ],
            "notes": "Fully delivered and invoiced. Payment cleared. Good relationship — follow up for next project.",
            "created_at": "2026-03-28",
            "data_source": "mock",
        },
        {
            "project_id": 3,
            "project_number": "PRJ-2026-0040",
            "project_name": "Commercial Complex — Koramangala Toilet Cubicles",
            "client_name": "Metro Constructions",
            "client_type": "Contractor",
            "architect_name": None,
            "site_location": "Koramangala, Bangalore",
            "category": "Compact Laminate + PVC Louvers",
            "estimated_value": 950000,
            "confirmed_value": None,
            "stage": "NEGOTIATING",
            "priority": "HIGH",
            "expected_close": (today + datetime.timedelta(days=6)).isoformat(),
            "quote_number": "QT-2026-0087",
            "order_number": None,
            "margin_pct": 21.8,
            "completion_pct": 30,
            "milestones": [
                {"name": "Inquiry received",        "date": "2026-04-08", "done": True},
                {"name": "Site visit completed",    "date": "2026-04-12", "done": True},
                {"name": "Quote QT-2026-0087 sent", "date": "2026-04-15", "done": True},
                {"name": "Counter-offer received",  "date": "2026-04-22", "done": True},
                {"name": "Revised quote",           "date": (today + datetime.timedelta(days=2)).isoformat(), "done": False},
                {"name": "PO from client",          "date": (today + datetime.timedelta(days=6)).isoformat(), "done": False},
                {"name": "Delivery",                "date": (today + datetime.timedelta(days=20)).isoformat(), "done": False},
            ],
            "notes": "Client wants 3.5% additional discount. Our floor is 1.5% more. Discuss with owner before revising.",
            "created_at": "2026-04-08",
            "data_source": "mock",
        },
        {
            "project_id": 4,
            "project_number": "PRJ-2026-0039",
            "project_name": "IT Park Phase 3 — Car Park Facade Screening",
            "client_name": "TechPark Infra",
            "client_type": "Developer",
            "architect_name": "ABC Architects",
            "site_location": "Electronic City, Bangalore",
            "category": "Aluminium Louvers",
            "estimated_value": 2400000,
            "confirmed_value": None,
            "stage": "LOST",
            "priority": "HIGH",
            "expected_close": (today - datetime.timedelta(days=10)).isoformat(),
            "quote_number": "QT-2026-0085",
            "order_number": None,
            "margin_pct": 15.4,
            "completion_pct": 0,
            "milestones": [
                {"name": "Inquiry received",    "date": "2026-03-20", "done": True},
                {"name": "Quote submitted",     "date": "2026-04-01", "done": True},
                {"name": "Lost — competitor win","date": "2026-04-22", "done": True},
            ],
            "notes": "Lost to competitor at ₹80/RM lower price. Need to review sourcing for 80mm profile to be competitive.",
            "created_at": "2026-03-20",
            "data_source": "mock",
        },
        {
            "project_id": 5,
            "project_number": "PRJ-2026-0038",
            "project_name": "Luxury Villa — JP Nagar High-Gloss Kitchen",
            "client_name": "Gloss Studio",
            "client_type": "Interior Firm",
            "architect_name": "Gloss Studio Design",
            "site_location": "JP Nagar, Bangalore",
            "category": "Acrylic Laminate",
            "estimated_value": 160000,
            "confirmed_value": None,
            "stage": "QUOTE_SENT",
            "priority": "MEDIUM",
            "expected_close": (today + datetime.timedelta(days=10)).isoformat(),
            "quote_number": "QT-2026-0086",
            "order_number": None,
            "margin_pct": 18.1,
            "completion_pct": 20,
            "milestones": [
                {"name": "Inquiry received",    "date": (today - datetime.timedelta(days=3)).isoformat(), "done": True},
                {"name": "Quote sent",          "date": today.isoformat(), "done": True},
                {"name": "Follow-up call",      "date": (today + datetime.timedelta(days=3)).isoformat(), "done": False},
                {"name": "PO expected",         "date": (today + datetime.timedelta(days=10)).isoformat(), "done": False},
            ],
            "notes": "High-gloss pearl white for kitchen. Client is very quality-conscious. Send samples.",
            "created_at": today.isoformat(),
            "data_source": "mock",
        },
        {
            "project_id": 6,
            "project_number": "PRJ-2026-0037",
            "project_name": "Horizon Hotels — Washroom Cubicles",
            "client_name": "Horizon Hotels",
            "client_type": "Developer",
            "architect_name": "Prism Design Associates",
            "site_location": "Marathahalli, Bangalore",
            "category": "Compact Laminate",
            "estimated_value": 350000,
            "confirmed_value": None,
            "stage": "INQUIRY",
            "priority": "MEDIUM",
            "expected_close": (today + datetime.timedelta(days=21)).isoformat(),
            "quote_number": None,
            "order_number": None,
            "margin_pct": None,
            "completion_pct": 5,
            "milestones": [
                {"name": "Inquiry received",  "date": today.isoformat(), "done": True},
                {"name": "Site visit",        "date": (today + datetime.timedelta(days=3)).isoformat(), "done": False},
                {"name": "Quote to be sent",  "date": (today + datetime.timedelta(days=7)).isoformat(), "done": False},
            ],
            "notes": "New hotel project — 40 washroom cubicles. Compact 6mm. Need site measurements before quoting.",
            "created_at": today.isoformat(),
            "data_source": "mock",
        },
        {
            "project_id": 7,
            "project_number": "PRJ-2026-0036",
            "project_name": "Deccan Residences — Tower Facade Cladding",
            "client_name": "Decor Workspace",
            "client_type": "Interior Firm",
            "architect_name": "Studio Archcraft",
            "site_location": "MG Road, Bangalore",
            "category": "HPL Exterior Cladding + ACP",
            "estimated_value": 1800000,
            "confirmed_value": None,
            "stage": "INQUIRY",
            "priority": "CRITICAL",
            "expected_close": (today + datetime.timedelta(days=30)).isoformat(),
            "quote_number": None,
            "order_number": None,
            "margin_pct": None,
            "completion_pct": 5,
            "milestones": [
                {"name": "Enquiry via email",   "date": today.isoformat(), "done": True},
                {"name": "Initial meeting",     "date": (today + datetime.timedelta(days=2)).isoformat(), "done": False},
                {"name": "Specification review","date": (today + datetime.timedelta(days=7)).isoformat(), "done": False},
                {"name": "Quote submission",    "date": (today + datetime.timedelta(days=15)).isoformat(), "done": False},
            ],
            "notes": "Large facade project. Architect specified Trespa equivalent. We can supply Greenlam Clad. URGENT — call architect today.",
            "created_at": today.isoformat(),
            "data_source": "mock",
        },
    ]


def _pipeline_kpis(projects: list) -> dict:
    total_pipeline = sum(p["estimated_value"] for p in projects if p["stage"] not in ("LOST", "INVOICED"))
    won_ytd        = sum(p.get("confirmed_value") or p["estimated_value"] for p in projects if p["stage"] in ("WON","IN_PRODUCTION","DISPATCHED","DELIVERED","INVOICED"))
    lost_ytd       = sum(p["estimated_value"] for p in projects if p["stage"] == "LOST")
    win_rate       = round(len([p for p in projects if p["stage"] in ("WON","IN_PRODUCTION","DISPATCHED","DELIVERED","INVOICED")]) /
                           max(len([p for p in projects if p["stage"] not in ("INQUIRY","QUOTE_SENT","NEGOTIATING")]), 1) * 100, 1)
    return {
        "total_projects":   len(projects),
        "pipeline_value":   total_pipeline,
        "won_ytd":          won_ytd,
        "lost_ytd":         lost_ytd,
        "win_rate_pct":     win_rate,
        "critical_count":   sum(1 for p in projects if p.get("priority") == "CRITICAL"),
        "overdue_count":    sum(1 for p in projects if p.get("expected_close") and
                                p["stage"] not in ("INVOICED","LOST") and
                                datetime.date.fromisoformat(p["expected_close"]) < datetime.date.today()),
    }


@router.get("/projects")
async def list_projects(stage: Optional[str] = None, priority: Optional[str] = None):
    projects = _mock_projects()
    if stage:
        projects = [p for p in projects if p["stage"] == stage.upper()]
    if priority:
        projects = [p for p in projects if p.get("priority") == priority.upper()]
    return {
        "projects":    projects,
        "kpis":        _pipeline_kpis(projects),
        "stages":      list(VALID_STAGES),
        "data_source": "mock",
    }


@router.get("/projects/{project_id}")
async def get_project(project_id: int):
    p = next((p for p in _mock_projects() if p["project_id"] == project_id), None)
    if not p:
        raise HTTPException(404, f"Project {project_id} not found")
    return p


@router.post("/projects")
async def create_project(req: CreateProjectRequest):
    if req.stage not in VALID_STAGES:
        raise HTTPException(422, f"Stage must be one of {VALID_STAGES}")
    if req.priority not in VALID_PRIORITIES:
        raise HTTPException(422, f"Priority must be one of {VALID_PRIORITIES}")
    today = datetime.date.today()
    num   = f"PRJ-{today.year}-{datetime.datetime.now().strftime('%m%d%H%M')}"
    return {"success": True, "project_number": num, "stage": req.stage, "demo_mode": True}


@router.put("/projects/{project_id}/stage")
async def update_project_stage(project_id: int, req: UpdateProjectStage):
    if req.stage not in VALID_STAGES:
        raise HTTPException(422, f"Stage must be one of {VALID_STAGES}")
    return {"success": True, "project_id": project_id, "stage": req.stage, "demo_mode": True}
