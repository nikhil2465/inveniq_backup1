"""
Import Ebco MRP April 2026 products into InvenIQ Product Catalog via bulk-add API.
Usage: python import_ebco.py
"""
import csv
import json
import sys
import urllib.request
import urllib.error

CSV_PATH  = r'c:\InvenIQ\Ebco_MRP_April_2026_Products.csv'
API_URL   = 'http://localhost:8000/api/catalog/bulk-add'
LOGIN_URL = 'http://localhost:8000/api/auth/login'

def clean_price(s):
    s = s.strip().replace(',', '').replace('?', '').replace('₹', '')
    try:
        v = float(s)
        return v if v > 0 else None
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
    # If item name is very short or looks like a fragment (ends with bracket, has no letters), fall back
    if len(name) < 4 or name.endswith('(') or name.endswith('-'):
        name = f"{category} Hardware"
    # Truncate to 120 chars before appending SKU
    if len(name) > 100:
        name = name[:97] + '...'
    return f"{name} [{item_code}]"

def get_token():
    payload = json.dumps({"username": "admin", "password": "inveniq@2024"}).encode('utf-8')
    req = urllib.request.Request(
        LOGIN_URL,
        data=payload,
        headers={'Content-Type': 'application/json'},
        method='POST'
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read())
        return data['access_token']


def main():
    try:
        with open(CSV_PATH, encoding='latin-1', newline='') as f:
            reader = csv.reader(f)
            headers = next(reader)
            rows    = list(reader)
    except FileNotFoundError:
        print(f"ERROR: CSV not found at {CSV_PATH}")
        sys.exit(1)

    print(f"Read {len(rows)} rows from CSV")

    products = []
    skipped  = []

    for i, row in enumerate(rows):
        # Pad short rows
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
            skipped.append(i + 2)
            continue

        sell_price = clean_price(mrp)
        moq        = clean_moq(spu)

        # Build category tag (slug form)
        cat_tag = category.lower().replace(' & ', '-').replace(' ', '-').replace(',', '')[:25]

        product = {
            "name":         clean_name(item_name, item_code, category),
            "brand":        "Ebco",
            "category":     category,
            "sku_code":     item_code,
            "unit":         unit if unit else "Each",
            "moq":          moq,
            "stock_status": "in_stock",
            "tags":         ["ebco", "hardware", cat_tag],
        }

        if size:
            product["size"] = size
        if finish:
            product["finish"] = finish
        if sell_price is not None:
            product["sell_price"] = sell_price

        products.append(product)

    print(f"Prepared {len(products)} products ({len(skipped)} rows skipped — no SKU code)")

    if not products:
        print("Nothing to import.")
        sys.exit(0)

    print("Authenticating...")
    token = get_token()
    print("  Token obtained.")

    # Batch in chunks of 200 to avoid oversized requests
    BATCH = 200
    total_added = 0

    for start in range(0, len(products), BATCH):
        chunk   = products[start:start + BATCH]
        payload = json.dumps({"products": chunk}).encode('utf-8')
        req = urllib.request.Request(
            API_URL,
            data=payload,
            headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {token}'},
            method='POST'
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                result      = json.loads(resp.read())
                added_count = result.get('added', 0)
                total_added += added_count
                print(f"  Batch {start // BATCH + 1}: added {added_count}")
        except urllib.error.URLError as e:
            print(f"  ERROR on batch {start // BATCH + 1}: {e}")
            sys.exit(1)

    print(f"\nDone -- {total_added} Ebco products added to Product Catalog.")
    print("  Refresh the Product Catalog view in InvenIQ to see them.")

if __name__ == '__main__':
    main()
