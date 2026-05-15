"""
Role definitions for InvenIQ — maps role names to allowed module lists.
5 roles: admin, sales_manager, cfo, warehouse_manager, finance_manager.
Admin gets full access ("all"); all others get a curated module list.
"""

from __future__ import annotations

# Module IDs must exactly match the activeView strings in App.js
ROLE_MODULES: dict[str, str | list[str]] = {
    "admin": "all",

    "sales_manager": [
        "overview", "analytics", "sales", "customers", "orders",
        "louvers", "claims", "quotes", "discounts", "pos",
        "projects", "demand", "catalog", "freight", "schemes",
        "chatbot", "about", "settings",
    ],

    "cfo": [
        "overview", "analytics", "finance", "sales", "customers",
        "orders", "credit", "claims", "freight", "procurement",
        "pogrn", "demand", "schemes", "chatbot", "about", "settings", "tally",
    ],

    "warehouse_manager": [
        "overview", "inventory", "inward", "warehouse", "pogrn",
        "deadstock", "procurement", "catalog", "freight", "demand",
        "chatbot", "about", "settings",
    ],

    "finance_manager": [
        "overview", "analytics", "finance", "credit", "orders",
        "customers", "procurement", "pogrn", "claims", "tally",
        "schemes", "chatbot", "about", "settings",
    ],
}

# Demo credentials for each non-admin role (password stored in plain — hashed lazily in auth.py)
ROLE_DEMO_ACCOUNTS: list[dict] = [
    {
        "username":     "sales_mgr",
        "password":     "sales@2024",
        "display_name": "Sales Manager",
        "email":        "sales@inveniq.demo",
        "role":         "sales_manager",
    },
    {
        "username":     "cfo_user",
        "password":     "cfo@2024",
        "display_name": "CFO",
        "email":        "cfo@inveniq.demo",
        "role":         "cfo",
    },
    {
        "username":     "warehouse_mgr",
        "password":     "wh@2024",
        "display_name": "Warehouse Manager",
        "email":        "warehouse@inveniq.demo",
        "role":         "warehouse_manager",
    },
    {
        "username":     "finance_mgr",
        "password":     "fin@2024",
        "display_name": "Finance Manager",
        "email":        "finance@inveniq.demo",
        "role":         "finance_manager",
    },
]


def get_modules_for_role(role: str) -> str | list[str]:
    """Return the allowed modules for a role. Returns 'all' for admin or unknown roles."""
    return ROLE_MODULES.get(role, "all")


def modules_to_claim(modules: str | list[str]) -> str:
    """Convert a module list (or 'all') to a comma-separated JWT claim string."""
    if modules == "all" or modules is None:
        return "all"
    return ",".join(modules)
