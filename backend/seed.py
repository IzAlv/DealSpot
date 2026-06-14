"""Seed default data into an EMPTY PostgreSQL database (idempotent — only seeds empty tables).

Schema itself (backend/schema.sql) is applied as a deploy step, not here. This module only
populates default rows so a fresh DB is usable. On a migrated DB every table is already
populated, so each block is a no-op.
"""
from database import q_one, insert_document
from auth import pwd_context


def _count(table):
    try:
        return q_one(f'SELECT count(*) c FROM "{table}"')["c"]
    except Exception:
        return None  # table missing -> schema not applied yet


def seed_data():
    try:
        _run_seed()
    except Exception as e:
        print(f"WARNING: seed_data skipped ({e})", flush=True)


def _run_seed():
    if _count("users") == 0:
        insert_document("users", {
            "username": "izzet.alev", "password": pwd_context.hash("izzet123"),
            "role": "admin", "name": "Izzet Alev", "email": "izzet.alev@gmail.com", "status": "active",
        })
        insert_document("users", {
            "username": "piraccount", "password": pwd_context.hash("piraccount123"),
            "role": "accountant", "name": "PIR Accountant", "email": "izzet@baticaret.com", "status": "active",
        })

    if _count("commodities") == 0:
        for c in [
            {"name": "10.5 % Pro. Wheat", "code": "WH", "group": "Grains", "hsCode": "1001.99.00.00.11"},
            {"name": "11.5 % Pro. Wheat", "code": "WH", "group": "Grains", "hsCode": "1001.99.00.00.11"},
            {"name": "12.5 % Pro. Wheat", "code": "WH", "group": "Grains", "hsCode": "1001.99.00.00.11"},
            {"name": "13.5 % Pro. Wheat", "code": "WH", "group": "Grains", "hsCode": "1001.99.00.00.11"},
            {"name": "14.5 % Pro. Wheat", "code": "WH", "group": "Grains", "hsCode": "1001.99.00.00.11"},
            {"name": "15.3 % Pro. Wheat", "code": "WH", "group": "Grains", "hsCode": "1001.99.00.00.11"},
            {"name": "Barley", "code": "BAR", "group": "Grains", "hsCode": "1003.90.00.00.19"},
            {"name": "Yellow Corn", "code": "CORN", "group": "Grains", "hsCode": "1005.90.00.00.19"},
            {"name": "34,5 % Pro. Sunflower Meal Pellets", "code": "SFMP", "group": "Feedstuffs", "hsCode": "2306.30.00.00.00"},
            {"name": "35 % Pro. Sunflower Meal Pellets", "code": "SFMP", "group": "Feedstuffs", "hsCode": "2306.30.00.00.00"},
            {"name": "Sugar Beet Pulp Pellets", "code": "SBPP", "group": "Feedstuffs", "hsCode": "2303.20.10.00.00"},
            {"name": "Sunflower Husk Pellets", "code": "HUSK", "group": "Feedstuffs", "hsCode": "2308.00.90.00.00"},
            {"name": "Wheat Bran Pellets", "code": "WBP", "group": "Feedstuffs", "hsCode": "2302.30.10.00.11"},
            {"name": "Soybeans", "code": "SBS", "group": "Oilseeds", "hsCode": "1201.90.00.00.00"},
            {"name": "Sunflower Seeds", "code": "SFS", "group": "Oilseeds", "hsCode": "1206.00.99.00.19"},
            {"name": "Green Lentils", "code": "WGL", "group": "Pulses & Rice", "hsCode": "0713.40.00.00.12"},
            {"name": "Kabuli Chickpeas", "code": "KCP", "group": "Pulses & Rice", "hsCode": "0713.20.00.00.19"},
            {"name": "Red Lentils", "code": "WRL", "group": "Pulses & Rice", "hsCode": "0713.40.00.00.13"},
            {"name": "White Rice", "code": "RICE", "group": "Pulses & Rice", "hsCode": "1006.30.27.00.00"},
            {"name": "Yellow Peas", "code": "PEAS", "group": "Pulses & Rice", "hsCode": "0713.10.10.00.00"},
        ]:
            insert_document("commodities", c)

    if _count("origins") == 0:
        for o in [
            {"name": "Russia", "adjective": "Russian", "code": "RUS"},
            {"name": "Ukraine", "adjective": "Ukrainian", "code": "UKR"},
            {"name": "Moldova", "adjective": "Moldovian", "code": "MOL"},
            {"name": "Romania", "adjective": "Romanian", "code": "ROM"},
            {"name": "Italy", "adjective": "Italian", "code": "ITA"},
            {"name": "Bulgaria", "adjective": "Bulgarian", "code": "BUL"},
            {"name": "Any", "adjective": "Any", "code": "ANY"},
        ]:
            insert_document("origins", o)

    if _count("ports") == 0:
        for p in [
            {"name": "Azov", "type": "loading", "country": "Russia", "countryCode": "RU"},
            {"name": "Bagaevskaya", "type": "loading", "country": "Russia", "countryCode": "RU"},
            {"name": "Chornomorsk", "type": "loading", "country": "Ukraine", "countryCode": "UA"},
            {"name": "Giurgiulești", "type": "loading", "country": "Moldova", "countryCode": "MOL"},
            {"name": "Izmail", "type": "loading", "country": "Ukraine", "countryCode": "UA"},
            {"name": "Manfredonia", "type": "loading", "country": "Italy", "countryCode": "IT"},
            {"name": "Molfetta", "type": "loading", "country": "Italy", "countryCode": "IT"},
            {"name": "Odessa", "type": "loading", "country": "Ukraine", "countryCode": "UA"},
            {"name": "Pivdennyi", "type": "loading", "country": "Ukraine", "countryCode": "UA"},
            {"name": "Ravenna", "type": "loading", "country": "Italy", "countryCode": "IT"},
            {"name": "Reni", "type": "loading", "country": "Ukraine", "countryCode": "UA"},
            {"name": "Rostov", "type": "loading", "country": "Russia", "countryCode": "RU"},
            {"name": "Taganrog", "type": "loading", "country": "Russia", "countryCode": "RU"},
            {"name": "Trieste", "type": "loading", "country": "Italy", "countryCode": "IT"},
            {"name": "Yeisk", "type": "loading", "country": "Russia", "countryCode": "RU"},
            {"name": "Adana Sanko", "type": "discharge", "country": "Turkiye", "countryCode": "TR"},
            {"name": "Alexandria", "type": "discharge", "country": "Egypt", "countryCode": "EG"},
            {"name": "Bandirma", "type": "discharge", "country": "Turkiye", "countryCode": "TR"},
            {"name": "Bizerte", "type": "discharge", "country": "Tunisia", "countryCode": "TN"},
            {"name": "Catania", "type": "discharge", "country": "Italy", "countryCode": "IT"},
            {"name": "Ceyhan Toros", "type": "discharge", "country": "Turkiye", "countryCode": "TR"},
            {"name": "Famagusta", "type": "discharge", "country": "Cyprus", "countryCode": "CY"},
            {"name": "Gemlik", "type": "discharge", "country": "Turkiye", "countryCode": "TR"},
            {"name": "Giresun", "type": "discharge", "country": "Turkiye", "countryCode": "TR"},
            {"name": "Iskenderun", "type": "discharge", "country": "Turkiye", "countryCode": "TR"},
            {"name": "Izmir", "type": "discharge", "country": "Turkiye", "countryCode": "TR"},
            {"name": "Izmit", "type": "discharge", "country": "Turkiye", "countryCode": "TR"},
            {"name": "Karasu", "type": "discharge", "country": "Turkiye", "countryCode": "TR"},
            {"name": "Mersin", "type": "discharge", "country": "Turkiye", "countryCode": "TR"},
            {"name": "Pozzallo", "type": "discharge", "country": "Italy", "countryCode": "IT"},
            {"name": "Samsun", "type": "discharge", "country": "Turkiye", "countryCode": "TR"},
            {"name": "Sfax", "type": "discharge", "country": "Tunisia", "countryCode": "TN"},
            {"name": "Tekirdag", "type": "discharge", "country": "Turkiye", "countryCode": "TR"},
            {"name": "Trabzon", "type": "discharge", "country": "Turkiye", "countryCode": "TR"},
        ]:
            insert_document("ports", p)

    if _count("surveyors") == 0:
        for s in [
            {"name": "Baltic Control", "countriesServed": ["Russia"]},
            {"name": "Bureau Veritas", "countriesServed": ["Russia", "Turkey"]},
            {"name": "Control Union", "countriesServed": ["Turkey", "Ukraine", "Russia", "Romania", "Bulgaria"]},
            {"name": "Cotecna", "countriesServed": ["Turkey", "Ukraine", "Russia", "Italy"]},
            {"name": "General Survey", "countriesServed": ["Kazakhstan", "Turkey", "Ukraine", "Russia"]},
            {"name": "GSP Worldwide", "countriesServed": ["Italy"]},
            {"name": "Inspectorate", "countriesServed": ["Italy"]},
            {"name": "Intertek", "countriesServed": ["Turkey", "Russia", "Ukraine"]},
            {"name": "Navi Mar", "countriesServed": ["Ukraine"]},
            {"name": "Russian Register", "countriesServed": ["Russia"]},
            {"name": "SGS", "countriesServed": ["Ukraine", "Turkey", "Russia", "Italy", "Bulgaria", "Romania", "Kazakhstan"]},
            {"name": "Top Logistic", "countriesServed": ["Russia"]},
            {"name": "TopFrame", "countriesServed": ["Russia"]},
            {"name": "Viglienzone", "countriesServed": ["Italy"]},
        ]:
            insert_document("surveyors", s)

    if _count("vessels") == 0:
        from vessel_data import VESSELS
        for v in VESSELS:
            insert_document("vessels", v)
