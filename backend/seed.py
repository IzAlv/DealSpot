from datetime import datetime, timedelta
import random

from database import (
    users_col, trades_col, partners_col, vessels_col,
    commodities_col, origins_col, ports_col, surveyors_col
)
from auth import pwd_context


def seed_data():
    if users_col.count_documents({}) == 0:
        users_col.insert_many([
            {
                "username": "salihkaragoz",
                "password": pwd_context.hash("salih123"),
                "role": "admin",
                "name": "Salih Karagoz",
                "email": "salih@pirgrains.com",
                "status": "active",
                "createdAt": datetime.utcnow()
            },
            {
                "username": "piraccount",
                "password": pwd_context.hash("piraccount123"),
                "role": "accountant",
                "name": "PIR Accountant",
                "email": "accounting@pirgrains.com",
                "status": "active",
                "createdAt": datetime.utcnow()
            }
        ])

    # Only seed if collections are empty — respect user changes from Settings
    if commodities_col.count_documents({}) == 0:
        comms = [
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
        ]
        for c in comms:
            c["createdAt"] = datetime.utcnow()
            commodities_col.insert_one(c)

    if origins_col.count_documents({}) == 0:
        origins = [
            {"name": "Russia", "adjective": "Russian", "code": "RUS"},
            {"name": "Ukraine", "adjective": "Ukrainian", "code": "UKR"},
            {"name": "Moldova", "adjective": "Moldovian", "code": "MOL"},
            {"name": "Romania", "adjective": "Romanian", "code": "ROM"},
            {"name": "Italy", "adjective": "Italian", "code": "ITA"},
            {"name": "Bulgaria", "adjective": "Bulgarian", "code": "BUL"},
            {"name": "Any", "adjective": "Any", "code": "ANY"},
        ]
        for o in origins:
            o["createdAt"] = datetime.utcnow()
            origins_col.insert_one(o)

    if ports_col.count_documents({}) == 0:
        ports = [
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
        ]
        for p in ports:
            p["createdAt"] = datetime.utcnow()
            ports_col.insert_one(p)

    if partners_col.count_documents({}) == 0:
        partners = [
            {"companyName": "Pir Grain & Pulses Ltd", "companyCode": "PIR", "contactPerson": "Trade Contact", "email": "trading@pirgrains.com", "phone": "+359 32 000 000", "city": "Plovdiv", "country": "Bulgaria", "type": "broker", "address": "Tsarigradsko Shose Blvd. No:73"},
            {"companyName": "Atria Brokers FZCO", "companyCode": "ATRIA", "contactPerson": "Trade Desk", "email": "trading@atriabrokers.ae", "phone": "+971 4 000 0000", "city": "Dubai", "country": "UAE", "type": "broker", "address": "Dubai Silicon Oasis, DDP"},
            {"companyName": "Nord Star LLC", "companyCode": "NORD", "contactPerson": "Trade Manager", "email": "trade@nordstar.ru", "phone": "+7 863 000 0000", "city": "Rostov-on-Don", "country": "Russia", "type": "broker", "address": "Vasnetsova 10A, Azov"},
            {"companyName": "AgroTrade International", "companyCode": "AGRO", "contactPerson": "Ahmed Hassan", "email": "ahmed@agrotrade.com", "phone": "+971 4 000 0000", "city": "Dubai", "country": "UAE", "type": "buyer", "address": "Trade Center, Dubai"},
            {"companyName": "Al Manar Trading", "companyCode": "ALM", "contactPerson": "Khalid Al Rashid", "email": "khalid@almanar.sa", "phone": "+966 1 000 0000", "city": "Jeddah", "country": "Saudi Arabia", "type": "buyer", "address": "King Fahd Rd"},
            {"companyName": "Asia Pulses Corp", "companyCode": "APC", "contactPerson": "Rajesh Kumar", "email": "rajesh@asiapulses.in", "phone": "+91 22 000 0000", "city": "Mumbai", "country": "India", "type": "buyer", "address": "Nariman Point"},
            {"companyName": "Black Sea Exports Ltd", "companyCode": "BSE", "contactPerson": "Ivan Petrov", "email": "ivan@bsexports.com", "phone": "+7 863 000 0000", "city": "Rostov", "country": "Russia", "type": "seller", "address": "Port District"},
            {"companyName": "Balkan Grains OOD", "companyCode": "BG", "contactPerson": "Georgi Dimitrov", "email": "georgi@balkangrains.bg", "phone": "+359 32 000 000", "city": "Plovdiv", "country": "Bulgaria", "type": "seller", "address": "Industrial Zone"},
            {"companyName": "Anatolia Commodities", "companyCode": "ANA", "contactPerson": "Mehmet Yilmaz", "email": "mehmet@anatoliacm.tr", "phone": "+90 312 000 0000", "city": "Ankara", "country": "Turkey", "type": "seller", "address": "Trade Blvd"},
            {"companyName": "Mediterranean Brokers", "companyCode": "MED", "contactPerson": "Marco Rossi", "email": "marco@medbrokers.it", "phone": "+39 02 000 0000", "city": "Milan", "country": "Italy", "type": "co-broker", "address": "Via Roma 12"},
        ]
        for p in partners:
            p["createdAt"] = datetime.utcnow()
            p["updatedAt"] = datetime.utcnow()
            p["tradeContacts"] = [{"name": p["contactPerson"], "email": p["email"], "phone": p["phone"]}]
            p["executionContacts"] = []
            partners_col.insert_one(p)

    if vessels_col.count_documents({}) == 0:
        from vessel_data import VESSELS
        for v in VESSELS:
            v["createdAt"] = datetime.utcnow()
            vessels_col.insert_one(v)

    if surveyors_col.count_documents({}) == 0:
        surveyors = [
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
        ]
        for s in surveyors:
            s["createdAt"] = datetime.utcnow()
            surveyors_col.insert_one(s)
