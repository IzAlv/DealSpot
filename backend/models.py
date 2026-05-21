from typing import Optional, List
from pydantic import BaseModel


class LoginRequest(BaseModel):
    username: str
    password: str


class TradeCreate(BaseModel):
    sellerId: Optional[str] = None
    buyerId: Optional[str] = None
    brokerId: Optional[str] = None
    coBrokerId: Optional[str] = None
    commodityId: Optional[str] = None
    originId: Optional[str] = None
    quantity: Optional[float] = 0
    tolerance: Optional[str] = None
    deliveryTerm: Optional[str] = None
    pricePerMT: Optional[float] = 0
    currency: Optional[str] = "USD"
    paymentTerms: Optional[str] = None
    incoterms: Optional[str] = None
    loadingPortId: Optional[str] = None
    dischargePortId: Optional[str] = None
    basePortId: Optional[str] = None
    portVariations: Optional[list] = []
    excludedDisports: Optional[list] = []
    excludedSurveyors: Optional[list] = []
    shipmentWindowStart: Optional[str] = None
    shipmentWindowEnd: Optional[str] = None
    vesselName: Optional[str] = None
    surveyorId: Optional[str] = None
    brokeragePerMT: Optional[float] = 0
    brokerageAccount: Optional[str] = "seller"
    contractDate: Optional[str] = None
    contractNumber: Optional[str] = None
    pirContractNumber: Optional[str] = None
    sellerContractNumber: Optional[str] = "N/A"
    specialConditions: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = "confirmation"
    sellerTradeContact: Optional[dict] = None
    sellerExecutionContact: Optional[dict] = None
    buyerTradeContact: Optional[dict] = None
    buyerExecutionContact: Optional[dict] = None
    brokerTradeContact: Optional[dict] = None
    brokerExecutionContact: Optional[dict] = None
    coBrokerTradeContact: Optional[dict] = None
    coBrokerExecutionContact: Optional[dict] = None


class TradeUpdate(TradeCreate):
    pass


class TradeStatusUpdate(BaseModel):
    status: str


class PartnerCreate(BaseModel):
    companyName: str
    companyCode: Optional[str] = None
    contactPerson: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    whatsapp: Optional[str] = None
    type: Optional[list] = ["buyer"]
    origins: Optional[list] = []
    tradeContacts: Optional[list] = []
    executionContacts: Optional[list] = []
    departments: Optional[list] = []
    notes: Optional[str] = None
    taxIdNo: Optional[str] = None
    taxOffice: Optional[str] = None


class VesselCreate(BaseModel):
    name: str
    imoNumber: Optional[str] = None
    flag: Optional[str] = None
    builtYear: Optional[int] = None
    vesselType: Optional[str] = "Bulk Carrier"


class SurveyorCreate(BaseModel):
    name: str
    contact: Optional[str] = None
    countriesServed: Optional[list] = []


class DisportAgentCreate(BaseModel):
    name: str
    port: Optional[str] = None
    contact: Optional[str] = None
    email: Optional[str] = None
    tel: Optional[str] = None
    whatsapp: Optional[str] = None
    address: Optional[str] = None


class CommodityCreate(BaseModel):
    name: str
    code: Optional[str] = None
    group: Optional[str] = None
    hsCode: Optional[str] = None
    description: Optional[str] = None
    specs: Optional[str] = None
    documents: Optional[List[str]] = None


class OriginCreate(BaseModel):
    name: str
    adjective: Optional[str] = None
    code: Optional[str] = None


class PortCreate(BaseModel):
    name: str
    type: Optional[str] = "loading"
    country: Optional[str] = None
    countryCode: Optional[str] = None


class EventCreate(BaseModel):
    title: str
    date: str
    dateTo: Optional[str] = None
    type: Optional[str] = "other"
    description: Optional[str] = None
    tradeId: Optional[str] = None
    partnerId: Optional[str] = None
    paymentDueDate: Optional[str] = None


class InvoiceCreate(BaseModel):
    invoiceNumber: str
    vendorName: str
    amount: float
    currency: Optional[str] = "USD"
    invoiceDate: Optional[str] = ""
    dueDate: Optional[str] = ""
    category: Optional[str] = "other"
    description: Optional[str] = None
    status: Optional[str] = "pending"
    direction: Optional[str] = "outgoing"


class BankStatementCreate(BaseModel):
    month: int
    year: int
    description: Optional[str] = None
    fileName: Optional[str] = None
    fileData: Optional[str] = None


class UserCreate(BaseModel):
    name: str
    username: str
    email: Optional[str] = None
    whatsapp: Optional[str] = None
    mobile: Optional[str] = None
    password: str
    role: Optional[str] = "user"
