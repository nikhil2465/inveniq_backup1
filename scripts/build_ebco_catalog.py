"""
Build backend/app/api/ebco_catalog.py from the Ebco CSV.
Run once: python build_ebco_catalog.py
"""
import csv
import json

CSV_PATH  = r'c:\InvenIQ\Ebco_MRP_April_2026_Products.csv'
OUT_PATH  = r'c:\InvenIQ\backend\app\api\ebco_catalog.py'


def clean_price(s):
    s = s.strip().replace(',', '').replace('?', '').replace('₹', '').replace('Rs', '').replace('rs', '')
    try:
        v = float(s)
        return round(v, 2) if v > 0 else None
    except (ValueError, TypeError):
        return None


def clean_moq(s):
    s = s.strip()
    try:
        v = int(s)
        return v if v > 0 else 1
    except (ValueError, TypeError):
        return 1


def clean_name(item_name, item_code, category):
    name = item_name.strip()
    if len(name) < 4 or name.endswith('(') or name.endswith('-'):
        name = f"{category} Hardware"
    if len(name) > 100:
        name = name[:97] + '...'
    return f"{name} [{item_code}]"


def main():
    with open(CSV_PATH, encoding='latin-1', newline='') as f:
        reader = csv.reader(f)
        headers = next(reader)
        rows = list(reader)

    print(f"Read {len(rows)} rows")
    products = []
    start_id = 1000  # Ebco products start at ID 1000 to avoid collision with demo catalog

    seen_skus = set()
    for i, row in enumerate(rows):
        while len(row) < 9:
            row.append('')

        category  = row[0].strip()
        item_name = row[1].strip()
        item_code = row[2].strip()
        size      = row[3].strip()
        finish    = row[4].strip()
        unit      = row[5].strip()
        spu       = row[6].strip()
        mrp       = row[7].strip()

        if not item_code:
            continue

        # Deduplicate by SKU
        if item_code in seen_skus:
            continue
        seen_skus.add(item_code)

        sell_price = clean_price(mrp)
        moq        = clean_moq(spu)

        cat_tag = category.lower().replace(' & ', '-').replace(' ', '-').replace(',', '')[:25]

        p = {
            "product_id":   start_id + len(products),
            "sku_code":     item_code,
            "name":         clean_name(item_name, item_code, category),
            "brand":        "Ebco",
            "category":     category,
            "sub_category": finish or size or "",
            "unit":         unit if unit else "Each",
            "moq":          moq,
            "stock_status": "in_stock",
            "gst_rate":     18.0,
            "tags":         ["ebco", "hardware", cat_tag],
            "certifications": [],
            "features":      [],
            "applications":  [],
            "competitors":   [],
        }

        if size:
            p["size"] = size
        if finish:
            p["finish"] = finish
        if sell_price is not None:
            p["sell_price"] = sell_price
            p["mrp"]        = sell_price

        products.append(p)

    print(f"Unique SKUs: {len(products)}")

    # Write Python module
    lines = [
        '"""',
        'Ebco MRP April 2026 product catalog — auto-generated from CSV.',
        'Do not edit by hand; regenerate with build_ebco_catalog.py.',
        '"""',
        'from typing import List',
        '',
        f'EBCO_CATALOG: List[dict] = {json.dumps(products, indent=4, ensure_ascii=False)}',
        '',
    ]

    with open(OUT_PATH, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))

    print(f"Written {len(products)} products to {OUT_PATH}")


if __name__ == '__main__':
    main()
