import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../lib/api';
import { STATUS_OPTIONS } from '../lib/constants';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Calendar } from '../components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { ArrowLeft, Save, Loader2, Briefcase, User, CalendarDays, Plus, X, FileText, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { format, parse } from 'date-fns';
import { cn } from '../lib/utils';

function DatePicker({ value, onChange, ...props }) {
  const dateObj = value ? (() => { try { return new Date(value + 'T00:00:00'); } catch { return undefined; } })() : undefined;
  const displayText = dateObj && !isNaN(dateObj) ? format(dateObj, 'dd/MM/yyyy') : '';
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !value && 'text-muted-foreground')} {...props}>
          <CalendarDays className="mr-2 h-4 w-4" />
          {displayText || 'dd/mm/yyyy'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={dateObj} onSelect={(d) => { if (d) onChange(format(d, 'yyyy-MM-dd')); }} initialFocus />
      </PopoverContent>
    </Popover>
  );
}

const DELIVERY_TERMS = ['FOB', 'CFR', 'CIF'];
const CURRENCIES = ['USD', 'EUR'];
const PAYMENT_TERMS = [
  '24 hours after Kerch Passage',
  '48 hours after Kerch Passage',
  '24 hours before Kerch Passage',
  '48 hours before Kerch Passage',
  '24 hours after Bosphorus Passage',
  '48 hours after Bosphorus Passage',
  '24 hours before Bosphorus Passage',
  '48 hours before Bosphorus Passage',
  '24 hours after entering Turkish Waters',
  '48 hours after entering Turkish Waters',
  'Vessel Arrives Bosphorus Strait',
  '24 hours after presentation of documents',
];

function ContactPicker({ label, icon: Icon, contacts, value, onChange, testId }) {
  if (!contacts || contacts.length === 0) return null;
  const selectedIdx = value !== null && value !== undefined ? String(value) : '';
  return (
    <div className="space-y-1">
      <Label className="text-xs flex items-center gap-1 text-muted-foreground"><Icon className="h-3 w-3" />{label}</Label>
      <Select value={selectedIdx} onValueChange={(v) => onChange(v === 'none' ? null : contacts[parseInt(v)])}>
        <SelectTrigger className="h-8 text-sm" data-testid={testId}><SelectValue placeholder="Select contact" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">-- None --</SelectItem>
          {contacts.map((c, i) => (
            <SelectItem key={i} value={String(i)}>{c.name}{c.email ? ` (${c.email})` : ''}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function PartyContactPickers({ partyLabel, partner, tradeContact, execContact, onTradeChange, onExecChange, testPrefix }) {
  if (!partner) return null;
  const tc = partner.tradeContacts || [];
  const ec = partner.executionContacts || [];
  if (tc.length === 0 && ec.length === 0) return null;

  const tcIdx = tradeContact ? tc.findIndex(c => c.name === tradeContact.name && c.email === tradeContact.email) : -1;
  const ecIdx = execContact ? ec.findIndex(c => c.name === execContact.name && c.email === execContact.email) : -1;

  return (
    <div className="col-span-4 bg-muted/30 rounded-lg p-3 space-y-2 border border-dashed">
      <div className="text-xs font-medium text-muted-foreground">{partyLabel} Contacts — {partner.companyName}</div>
      <div className="grid grid-cols-2 gap-3">
        {tc.length > 0 && (
          <ContactPicker
            label="Trade Contact" icon={Briefcase} contacts={tc}
            value={tcIdx >= 0 ? tcIdx : null} onChange={onTradeChange}
            testId={`${testPrefix}-trade-contact`}
          />
        )}
        {ec.length > 0 && (
          <ContactPicker
            label="Execution Contact" icon={User} contacts={ec}
            value={ecIdx >= 0 ? ecIdx : null} onChange={onExecChange}
            testId={`${testPrefix}-exec-contact`}
          />
        )}
      </div>
    </div>
  );
}

export default function NewTradePage() {
  const navigate = useNavigate();
  const { tradeId } = useParams();
  const isEdit = Boolean(tradeId);
  const [saving, setSaving] = useState(false);
  const [generatingBC, setGeneratingBC] = useState(false);
  const [loadingTrade, setLoadingTrade] = useState(false);
  const [partners, setPartners] = useState([]);
  const [commodities, setCommodities] = useState([]);
  const [origins, setOrigins] = useState([]);
  const [ports, setPorts] = useState([]);
  const [surveyors, setSurveyors] = useState([]);
  const [vessels, setVessels] = useState([]);
  const [allUsers, setAllUsers] = useState([]);

  const [form, setForm] = useState({
    sellerId: '', buyerId: '', brokerId: '', coBrokerId: 'na',
    commodityId: '', originId: '', quantity: '5000', tolerance: '10', cropYear: new Date().getFullYear().toString(),
    deliveryTerm: 'CIF', pricePerMT: '', currency: 'USD',
    paymentTerms: '48 hours after Kerch Passage', incoterms: '', basePortId: '', loadingPortId: '', dischargePortId: '',
    shipmentWindowStart: '', shipmentWindowEnd: '', vesselName: '',
    surveyorId: '', brokeragePerMT: '1', brokerageAccount: 'seller', brokerageCurrency: 'USD', contractDate: '', contractNumber: '',
    specialConditions: '', notes: '', status: 'confirmation', commoditySpecs: '',
    thirdPartyLab: 'allowed',
    dischargeRate: '1500', demurrageRate: '',
    pirContractNumber: '', sellerContractNumber: 'N/A',
    gaftaTerm: 'GAFTA No. 48, Arbitration Clause 125, London',
    gaftaExtension: 'allowed',
    excludedDisports: [], excludedSurveyors: [],
    portVariations: [],
    sellerTradeContact: null, sellerExecutionContact: null,
    buyerTradeContact: null, buyerExecutionContact: null,
    brokerTradeContact: null, brokerExecutionContact: null,
    coBrokerTradeContact: null, coBrokerExecutionContact: null,
    executionHandledBy: 'Izzet Alev',
    brokerPersonName: 'Izzet Alev',
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [pa, co, or, po, su, ve, us] = await Promise.all([
          api.get('/api/partners'), api.get('/api/commodities'), api.get('/api/origins'),
          api.get('/api/ports'), api.get('/api/surveyors'), api.get('/api/vessels'),
          api.get('/api/users'),
        ]);
        setPartners(pa.data); setCommodities(co.data); setOrigins(or.data);
        setPorts(po.data); setSurveyors(su.data); setVessels(ve.data);
        setAllUsers(us.data);

        // Default origin to Russia for new contracts
        if (!isEdit) {
          const russia = or.data.find(o => o.name?.toLowerCase() === 'russia');
          const samsun = po.data.find(p => p.name?.toLowerCase().includes('samsun'));
          const izmir = po.data.find(p => p.name?.toLowerCase().includes('izmir'));
          const defaultPortVariations = [];
          if (samsun) defaultPortVariations.push({ portId: samsun.id, portName: samsun.name, portCountry: samsun.country || '', difference: '-2' });
          if (izmir) defaultPortVariations.push({ portId: izmir.id, portName: izmir.name, portCountry: izmir.country || '', difference: '+3' });
          setForm(prev => ({
            ...prev,
            originId: russia ? russia.id : prev.originId,
            portVariations: defaultPortVariations,
          }));
        }

        if (isEdit) {
          setLoadingTrade(true);
          const res = await api.get(`/api/trades/${tradeId}`);
          const t = res.data;
          // Convert dd/MM/yyyy date to yyyy-MM-dd for DatePicker
          const convertDate = (d) => {
            if (!d) return '';
            if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
            const m = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
            if (m) return `${m[3]}-${m[2]}-${m[1]}`;
            return d;
          };
          setForm({
            sellerId: t.sellerId || '',
            buyerId: t.buyerId || '',
            brokerId: t.brokerId || 'na',
            coBrokerId: t.coBrokerId || 'na',
            commodityId: t.commodityId || '',
            originId: t.originId || '',
            cropYear: t.cropYear || new Date().getFullYear().toString(),
            quantity: t.quantity != null ? String(t.quantity) : '',
            tolerance: t.tolerance || '',
            deliveryTerm: t.deliveryTerm || '',
            pricePerMT: t.pricePerMT != null ? String(t.pricePerMT) : '',
            currency: t.currency || 'USD',
            paymentTerms: t.paymentTerms || '',
            incoterms: t.incoterms || '',
            basePortId: t.basePortId || '',
            loadingPortId: t.loadingPortId || '',
            dischargePortId: t.dischargePortId || '',
            shipmentWindowStart: convertDate(t.shipmentWindowStart),
            shipmentWindowEnd: convertDate(t.shipmentWindowEnd),
            vesselName: t.vesselName || '',
            surveyorId: t.surveyorId || '',
            brokeragePerMT: t.brokeragePerMT != null ? String(t.brokeragePerMT) : '',
            brokerageAccount: t.brokerageAccount || 'seller',
            brokerageCurrency: t.brokerageCurrency || 'USD',
            contractDate: convertDate(t.contractDate),
            contractNumber: t.contractNumber || '',
            specialConditions: t.specialConditions || '',
            notes: t.notes || '',
            status: t.status || 'confirmation',
            commoditySpecs: t.commoditySpecs || (() => { const comm = co.data.find(c => c.id === t.commodityId); return comm?.specs || ''; })(),
            pirContractNumber: t.pirContractNumber || '',
            sellerContractNumber: t.sellerContractNumber || 'N/A',
            gaftaTerm: t.gaftaTerm || 'GAFTA No. 48, Arbitration Clause 125, London',
            gaftaExtension: t.gaftaExtension || 'allowed',
            thirdPartyLab: t.thirdPartyLab || 'not_allowed',
            excludedDisports: t.excludedDisports || [],
            excludedSurveyors: t.excludedSurveyors || [],
            dischargeRate: t.dischargeRate != null ? String(t.dischargeRate) : '',
            demurrageRate: t.demurrageRate != null ? String(t.demurrageRate) : '',
            portVariations: t.portVariations || [],
            sellerTradeContact: t.sellerTradeContact || null,
            sellerExecutionContact: t.sellerExecutionContact || null,
            buyerTradeContact: t.buyerTradeContact || null,
            buyerExecutionContact: t.buyerExecutionContact || null,
            brokerTradeContact: t.brokerTradeContact || null,
            brokerExecutionContact: t.brokerExecutionContact || null,
            coBrokerTradeContact: t.coBrokerTradeContact || null,
            coBrokerExecutionContact: t.coBrokerExecutionContact || null,
            executionHandledBy: t.executionHandledBy || '',
            brokerPersonName: t.brokerPersonName || 'Izzet Alev',
          });
          setLoadingTrade(false);
        } else {
          // Auto-select BA Ticaret as default Broker
          const baTicaret = pa.data.find(p => {
            const t = Array.isArray(p.type) ? p.type : [p.type];
            return t.includes('broker') && p.companyName.toLowerCase().includes('ba');
          });
          if (baTicaret) {
            setForm(prev => ({ ...prev, brokerId: baTicaret.id }));
          }
          // Auto-select CIF Marmara Ports as default Base Port
          const marmaraPorts = po.data.find(p => p.name === 'CIF Marmara Ports');
          if (marmaraPorts) {
            setForm(prev => ({ ...prev, basePortId: marmaraPorts.id }));
          }
        }
      } catch (err) { console.error(err); }
    };
    fetchData();
  }, [isEdit, tradeId]);

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleOriginChange = (originId) => {
    const origin = origins.find(o => o.id === originId);
    const name = (origin?.name || '').toLowerCase();
    const updates = { originId };
    if (name === 'russia') updates.paymentTerms = '48 hours after Kerch Passage';
    else if (name === 'ukraine') updates.paymentTerms = '24 hours after entering Turkish Waters';
    setForm(prev => ({ ...prev, ...updates }));
  };

  const sellers = useMemo(() => partners.filter(p => { const t = Array.isArray(p.type) ? p.type : [p.type]; return t.includes('seller'); }), [partners]);
  const buyers = useMemo(() => partners.filter(p => { const t = Array.isArray(p.type) ? p.type : [p.type]; return t.includes('buyer'); }), [partners]);
  const coBrokers = useMemo(() => partners.filter(p => { const t = Array.isArray(p.type) ? p.type : [p.type]; return t.includes('co-broker'); }), [partners]);
  const dischPorts = useMemo(() => ports.filter(p => p.type === 'discharge'), [ports]);
  const loadPorts = useMemo(() => ports.filter(p => p.type === 'loading'), [ports]);

  const selectedCommodity = useMemo(() => commodities.find(c => c.id === form.commodityId), [commodities, form.commodityId]);
  const sellerPartner = useMemo(() => partners.find(p => p.id === form.sellerId), [partners, form.sellerId]);
  const buyerPartner = useMemo(() => partners.find(p => p.id === form.buyerId), [partners, form.buyerId]);
  const brokerPartner = useMemo(() => form.brokerId && form.brokerId !== 'na' ? partners.find(p => p.id === form.brokerId) : null, [partners, form.brokerId]);
  const coBrokerPartner = useMemo(() => form.coBrokerId && form.coBrokerId !== 'na' ? partners.find(p => p.id === form.coBrokerId) : null, [partners, form.coBrokerId]);

  const handleSellerChange = (v) => {
    setForm(prev => ({ ...prev, sellerId: v, sellerTradeContact: null, sellerExecutionContact: null }));
  };
  const handleBuyerChange = (v) => {
    setForm(prev => ({ ...prev, buyerId: v, buyerTradeContact: null, buyerExecutionContact: null }));
  };
  const handleBrokerChange = (v) => {
    setForm(prev => ({ ...prev, brokerId: v, brokerTradeContact: null, brokerExecutionContact: null }));
  };
  const handleCoBrokerChange = (v) => {
    setForm(prev => ({ ...prev, coBrokerId: v, coBrokerTradeContact: null, coBrokerExecutionContact: null }));
  };

  const handleSave = async () => {
    if (!form.sellerId || !form.buyerId || !form.commodityId) {
      toast.error('Seller, Buyer, and Commodity are required');
      return;
    }
    setSaving(true);
    try {
      const data = {
        ...form,
        contractNumber: form.pirContractNumber || '',
        sellerContractNumber: form.sellerContractNumber || 'N/A',
        brokerId: form.brokerId === 'na' ? '' : form.brokerId,
        coBrokerId: form.coBrokerId === 'na' ? '' : form.coBrokerId,
        loadingPortId: form.loadingPortId || '',
        quantity: form.quantity ? parseFloat(form.quantity) : 0,
        pricePerMT: form.pricePerMT ? parseFloat(form.pricePerMT) : 0,
        brokeragePerMT: form.brokeragePerMT ? parseFloat(form.brokeragePerMT) : 0,
        dischargeRate: form.dischargeRate ? parseFloat(form.dischargeRate) : 0,
        demurrageRate: form.demurrageRate ? parseFloat(form.demurrageRate) : 0,
        portVariations: form.portVariations.filter(pv => pv.portId).map(pv => ({
          portId: pv.portId,
          portName: pv.portName || '',
          portCountry: pv.portCountry || '',
          difference: pv.difference ? parseFloat(pv.difference) : 0,
        })),
      };
      if (isEdit) {
        await api.put(`/api/trades/${tradeId}`, data);
        toast.success('Trade updated');
      } else {
        await api.post('/api/trades', data);
        toast.success('Trade created');
      }
      navigate(isEdit ? `/trades/${tradeId}` : '/trades');
    } catch (err) {
      toast.error(isEdit ? 'Failed to update trade' : 'Failed to create trade');
    } finally {
      setSaving(false);
    }
  };

  if (loadingTrade) return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate('/trades')}><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>
        <div>
          <p className="text-muted-foreground">{isEdit ? 'Update contract details' : 'Create a new commodity contract'}</p>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Contract Details</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label>Contract Date</Label>
            <DatePicker value={form.contractDate} onChange={(v) => set('contractDate', v)} />
          </div>
          <div className="space-y-2">
            <Label>BA Ticaret Ref. No</Label>
            <Input value={form.pirContractNumber} onChange={(e) => set('pirContractNumber', e.target.value)} placeholder="Auto-generated if empty" />
          </div>
          <div className="space-y-2">
            <Label>Seller Contract Number</Label>
            <Input value={form.sellerContractNumber} onChange={(e) => set('sellerContractNumber', e.target.value)} placeholder="N/A" />
          </div>
          <div className="space-y-2">
            <Label>Execution Handled By</Label>
            <Select value={form.executionHandledBy} onValueChange={(v) => set('executionHandledBy', v)}>
              <SelectTrigger data-testid="execution-handled-by-select"><SelectValue placeholder="Select person" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Izzet Alev">Izzet Alev</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Contract Parties</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label>Seller *</Label>
            <Select value={form.sellerId} onValueChange={handleSellerChange}>
              <SelectTrigger data-testid="trade-seller-select"><SelectValue placeholder="Select seller" /></SelectTrigger>
              <SelectContent>{sellers.map(s => <SelectItem key={s.id} value={s.id}>{s.companyName}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Buyer *</Label>
            <Select value={form.buyerId} onValueChange={handleBuyerChange}>
              <SelectTrigger data-testid="trade-buyer-select"><SelectValue placeholder="Select buyer" /></SelectTrigger>
              <SelectContent>{buyers.map(b => <SelectItem key={b.id} value={b.id}>{b.companyName}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          {/* Seller Contacts */}
          <PartyContactPickers
            partyLabel="Seller" partner={sellerPartner}
            tradeContact={form.sellerTradeContact} execContact={form.sellerExecutionContact}
            onTradeChange={(c) => set('sellerTradeContact', c)} onExecChange={(c) => set('sellerExecutionContact', c)}
            testPrefix="seller"
          />

          {/* Buyer Contacts */}
          <PartyContactPickers
            partyLabel="Buyer" partner={buyerPartner}
            tradeContact={form.buyerTradeContact} execContact={form.buyerExecutionContact}
            onTradeChange={(c) => set('buyerTradeContact', c)} onExecChange={(c) => set('buyerExecutionContact', c)}
            testPrefix="buyer"
          />

          <div className="space-y-2">
            <Label>Broker</Label>
            <Select value={form.brokerId} onValueChange={handleBrokerChange}>
              <SelectTrigger><SelectValue placeholder="Select broker" /></SelectTrigger>
              <SelectContent>
                {partners.filter(p => { const t = Array.isArray(p.type) ? p.type : [p.type]; return t.includes('broker'); }).map(b => <SelectItem key={b.id} value={b.id}>{b.companyName}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Broker Name</Label>
            <Select value={form.brokerPersonName || 'Izzet Alev'} onValueChange={(v) => set('brokerPersonName', v)}>
              <SelectTrigger data-testid="broker-name-select"><SelectValue placeholder="Select broker name" /></SelectTrigger>
              <SelectContent>
                {allUsers.filter(u => u.username !== 'pir.accounts').map(u => <SelectItem key={u.username} value={u.name}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Co-Broker</Label>
            <Select value={form.coBrokerId} onValueChange={handleCoBrokerChange}>
              <SelectTrigger><SelectValue placeholder="Select co-broker" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="na">N/A</SelectItem>
                {coBrokers.map(b => <SelectItem key={b.id} value={b.id}>{b.companyName}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Broker Contacts */}
          <PartyContactPickers
            partyLabel="Broker" partner={brokerPartner}
            tradeContact={form.brokerTradeContact} execContact={form.brokerExecutionContact}
            onTradeChange={(c) => set('brokerTradeContact', c)} onExecChange={(c) => set('brokerExecutionContact', c)}
            testPrefix="broker"
          />

          {/* Co-Broker Contacts */}
          <PartyContactPickers
            partyLabel="Co-Broker" partner={coBrokerPartner}
            tradeContact={form.coBrokerTradeContact} execContact={form.coBrokerExecutionContact}
            onTradeChange={(c) => set('coBrokerTradeContact', c)} onExecChange={(c) => set('coBrokerExecutionContact', c)}
            testPrefix="co-broker"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Commodity Details</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Commodity *</Label>
              <Select value={form.commodityId} onValueChange={(v) => {
                set('commodityId', v);
                const comm = commodities.find(c => c.id === v);
                set('commoditySpecs', comm?.specs || '');
              }}>
                <SelectTrigger><SelectValue placeholder="Select commodity" /></SelectTrigger>
                <SelectContent>{commodities.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Crop Year</Label>
              <Select value={form.cropYear} onValueChange={(v) => set('cropYear', v)}>
                <SelectTrigger data-testid="crop-year-select"><SelectValue placeholder="Select crop year" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={String(new Date().getFullYear())}>{new Date().getFullYear()}</SelectItem>
                  <SelectItem value={String(new Date().getFullYear() - 1)}>{new Date().getFullYear() - 1}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Origin</Label>
              <Select value={form.originId} onValueChange={handleOriginChange}>
                <SelectTrigger><SelectValue placeholder="Select origin" /></SelectTrigger>
                <SelectContent>{origins.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Quantity (MT)</Label>
              <Input type="text" value={form.quantity ? Number(form.quantity).toLocaleString('en-US') : ''} onChange={(e) => { const qty = e.target.value.replace(/,/g, ''); set('quantity', qty); const n = parseInt(qty); if (n === 3000) set('dischargeRate', '1000'); else if (n === 5000) set('dischargeRate', '1500'); }} placeholder="0" />
            </div>
            <div className="space-y-2">
              <Label>Tolerance (%)</Label>
              <Input value={form.tolerance} onChange={(e) => set('tolerance', e.target.value)} placeholder="e.g. 5" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Commodity Specs.</Label>
            <Textarea value={form.commoditySpecs} onChange={(e) => set('commoditySpecs', e.target.value)} rows={5} className="font-mono text-sm" placeholder="Enter commodity specifications" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Contract Terms</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label>Price per MT</Label>
            <Input type="number" value={form.pricePerMT} onChange={(e) => set('pricePerMT', e.target.value)} placeholder="0.00" />
          </div>
          <div className="space-y-2">
            <Label>Currency</Label>
            <Select value={form.currency} onValueChange={(v) => set('currency', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Delivery Term</Label>
            <Select value={form.deliveryTerm} onValueChange={(v) => set('deliveryTerm', v)}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{DELIVERY_TERMS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Payment Terms</Label>
            <Select value={form.paymentTerms} onValueChange={(v) => set('paymentTerms', v)}>
              <SelectTrigger data-testid="payment-terms-select"><SelectValue placeholder="Select payment term" /></SelectTrigger>
              <SelectContent>{PAYMENT_TERMS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Brokerage (per MT)</Label>
            <Input type="number" value={form.brokeragePerMT} onChange={(e) => set('brokeragePerMT', e.target.value)} placeholder="0.00" />
          </div>
          <div className="space-y-2">
            <Label>Brokerage Currency</Label>
            <Select value={form.brokerageCurrency} onValueChange={(v) => set('brokerageCurrency', v)}>
              <SelectTrigger data-testid="brokerage-currency-select"><SelectValue placeholder="Currency" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="EUR">EUR</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Brokerage Payment</Label>
            <Select value={form.brokerageAccount} onValueChange={(v) => set('brokerageAccount', v)}>
              <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="seller">Seller Account</SelectItem>
                <SelectItem value="buyer">Buyer Account</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Shipping Terms</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Base Port</Label>
              <Select value={form.basePortId} onValueChange={(v) => set('basePortId', v)}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{dischPorts.map(p => <SelectItem key={p.id} value={p.id}>{p.name}{p.country ? `, ${p.country}` : ''}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Shipment Period From</Label>
              <DatePicker value={form.shipmentWindowStart} onChange={(v) => set('shipmentWindowStart', v)} />
            </div>
            <div className="space-y-2">
              <Label>Shipment Period To</Label>
              <DatePicker value={form.shipmentWindowEnd} onChange={(v) => set('shipmentWindowEnd', v)} />
            </div>
            <div className="space-y-2">
              <Label>GAFTA Extension</Label>
              <Select value={form.gaftaExtension} onValueChange={(v) => set('gaftaExtension', v)}>
                <SelectTrigger data-testid="gafta-extension-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="allowed">Allowed</SelectItem>
                  <SelectItem value="not_allowed">Not Allowed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Discharge Rate (Mts/Day)</Label>
              <Input type="number" value={form.dischargeRate || ''} onChange={(e) => set('dischargeRate', e.target.value)} placeholder="e.g. 5000" />
            </div>
            <div className="space-y-2">
              <Label>Demurrage Rate (USD/Day)</Label>
              <Input type="number" value={form.demurrageRate || ''} onChange={(e) => set('demurrageRate', e.target.value)} placeholder="e.g. 15000" />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Port Options (price difference per MT)</Label>
              <Button type="button" variant="outline" size="sm" onClick={() => set('portVariations', [...form.portVariations, { portId: '', difference: '' }])}>
                <Plus className="h-3.5 w-3.5 mr-1" />Add Port
              </Button>
            </div>
            {form.portVariations.length === 0 && (
              <p className="text-sm text-muted-foreground">No port options added. Click "Add Port" to specify price differences for other discharge ports.</p>
            )}
            {form.portVariations.map((pv, idx) => (
              <div key={idx} className="flex items-end gap-3">
                <div className="flex-1 space-y-1">
                  {idx === 0 && <Label className="text-xs text-muted-foreground">Discharge Port</Label>}
                  <Select value={pv.portId} onValueChange={(v) => {
                    const updated = [...form.portVariations];
                    const port = dischPorts.find(p => p.id === v);
                    updated[idx] = { ...updated[idx], portId: v, portName: port?.name || '', portCountry: port?.country || '' };
                    set('portVariations', updated);
                  }}>
                    <SelectTrigger><SelectValue placeholder="Select port" /></SelectTrigger>
                    <SelectContent>{dischPorts.filter(p => p.id !== form.basePortId).map(p => <SelectItem key={p.id} value={p.id}>{p.name}{p.country ? `, ${p.country}` : ''}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="w-[130px] space-y-1">
                  {idx === 0 && <Label className="text-xs text-muted-foreground">+/- per MT ({form.currency || 'USD'})</Label>}
                  <Input type="text" value={pv.difference} placeholder="e.g. +5 or -3" onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9.+-]/g, '');
                    const updated = [...form.portVariations];
                    updated[idx] = { ...updated[idx], difference: val };
                    set('portVariations', updated);
                  }} />
                </div>
                <div className="w-[100px] space-y-1 text-center">
                  {idx === 0 && <Label className="text-xs text-muted-foreground">Price</Label>}
                  <div className="h-9 flex items-center justify-center text-sm font-mono font-medium">
                    {form.pricePerMT && pv.difference !== '' ? `${(parseFloat(form.pricePerMT) + parseFloat(pv.difference || 0)).toLocaleString()} ${form.currency || 'USD'}` : <span className="text-muted-foreground">-</span>}
                  </div>
                </div>
                <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-destructive shrink-0" onClick={() => {
                  const updated = form.portVariations.filter((_, i) => i !== idx);
                  set('portVariations', updated);
                }}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Excluded Disports</Label>
              <div className="border rounded-lg p-3 max-h-[200px] overflow-y-auto space-y-1">
                {dischPorts.filter(p => p.id !== form.basePortId).map(p => (
                  <label key={p.id} className="flex items-center gap-2 py-1 px-1 rounded hover:bg-muted/50 cursor-pointer text-sm">
                    <input type="checkbox" className="rounded border-input" checked={form.excludedDisports.includes(p.id)} onChange={(e) => {
                      if (e.target.checked) set('excludedDisports', [...form.excludedDisports, p.id]);
                      else set('excludedDisports', form.excludedDisports.filter(id => id !== p.id));
                    }} />
                    {p.name}{p.country ? `, ${p.country}` : ''}
                  </label>
                ))}
              </div>
              {form.excludedDisports.length > 0 && (
                <p className="text-xs text-muted-foreground">{form.excludedDisports.length} port(s) excluded</p>
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Excluded Surveyors</Label>
              <div className="border rounded-lg p-3 max-h-[200px] overflow-y-auto space-y-1">
                {surveyors.map(s => (
                  <label key={s.id} className="flex items-center gap-2 py-1 px-1 rounded hover:bg-muted/50 cursor-pointer text-sm">
                    <input type="checkbox" className="rounded border-input" checked={form.excludedSurveyors.includes(s.id)} onChange={(e) => {
                      if (e.target.checked) set('excludedSurveyors', [...form.excludedSurveyors, s.id]);
                      else set('excludedSurveyors', form.excludedSurveyors.filter(id => id !== s.id));
                    }} />
                    {s.name}
                  </label>
                ))}
              </div>
              {form.excludedSurveyors.length > 0 && (
                <p className="text-xs text-muted-foreground">{form.excludedSurveyors.length} surveyor(s) excluded</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Additional Info</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>GAFTA Term</Label>
            <Input value={form.gaftaTerm} onChange={(e) => set('gaftaTerm', e.target.value)} placeholder="GAFTA No. 48, Arbitration Clause 125, London" data-testid="gafta-term-input" />
          </div>
          <div className="space-y-2">
            <Label>3rd Party Laboratory</Label>
            <Select value={form.thirdPartyLab} onValueChange={(v) => set('thirdPartyLab', v)}>
              <SelectTrigger data-testid="third-party-lab-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="allowed">Allowed</SelectItem>
                <SelectItem value="not_allowed">Not Allowed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Additional notes..." rows={3} />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3 pb-6">
        {isEdit && (
          <Button variant="destructive" data-testid="delete-trade-edit-btn" onClick={async () => { if (window.confirm('Are you sure you want to delete this contract? This action cannot be undone.')) { try { await api.delete(`/api/trades/${tradeId}`); toast.success('Contract deleted'); navigate('/trades'); } catch { toast.error('Failed to delete contract'); } } }}>
            <Trash2 className="h-4 w-4 mr-2" />Delete Contract
          </Button>
        )}
        <Button variant="outline" onClick={() => navigate('/trades')}>Cancel</Button>
        <Button onClick={handleSave} disabled={saving} data-testid="save-trade-button">
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          {isEdit ? 'Update Contract' : 'Create Contract'}
        </Button>
        <Button variant="outline" onClick={async () => {
          setGeneratingBC(true);
          try {
            let tid = tradeId;
            if (!tid) {
              // Save first for new contracts
              const data = { ...form, contractNumber: form.pirContractNumber || '', portVariations: form.portVariations || [] };
              const res = await api.post('/api/trades', data);
              tid = res.data.id;
              toast.success('Contract saved');
            }
            const res = await api.get(`/api/business-confirmation/${tid}/pdf`, { responseType: 'blob' });
            window.open(window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' })), '_blank');
            toast.success('Business Confirmation generated');
            if (!tradeId) navigate(`/trades/${tid}/edit`);
          } catch { toast.error('Failed to generate Business Confirmation'); }
          finally { setGeneratingBC(false); }
        }} disabled={generatingBC} data-testid="bc-button">
          {generatingBC ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileText className="h-4 w-4 mr-2" />}
          Business Confirmation
        </Button>
      </div>
    </div>
  );
}
