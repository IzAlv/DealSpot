import { useState, useEffect, useRef } from 'react';
import api from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import html2pdf from 'html2pdf.js';
import { Copy, Printer, FileText, Send, Plus, Pencil, Trash2, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';

const DEFAULT_REQUIRED_DOCS = [
  { name: 'Signed Commercial Invoice', originals: 1, copies: 2 },
  { name: 'Bill of Lading (Clean on Board, Freight Prepaid)', originals: 3, copies: 2 },
  { name: 'Certificate of Origin', originals: 1, copies: 2 },
  { name: 'Phytosanitary Certificate', originals: 1, copies: 2 },
  { name: 'Non-Radiation Certificate (CS134 & CS137 < 370 Bq/Kg)', originals: 1, copies: 2 },
  { name: 'Fumigation Certificate (if any)', originals: 1, copies: 2 },
  { name: 'Quality Certificate (GAFTA Approved Surveyor)', originals: 1, copies: 2 },
  { name: 'Weight Certificate (GAFTA Approved Surveyor)', originals: 1, copies: 2 },
  { name: 'Holds Cleanliness Certificate (GAFTA Approved Surveyor)', originals: 1, copies: 2 },
  { name: 'Holds Sealing Certificate (GAFTA Approved Surveyor)', originals: 1, copies: 2 },
  { name: 'Insurance Certificate (GAFTA - 102% of value)', originals: 1, copies: 2 },
  { name: "Master's Receipt", originals: 1, copies: 2 },
  { name: 'Non-Dioxin Analysis + GAFTA Non-Dioxin Certificate', originals: 1, copies: 2 },
];

const DEFAULT_FORM = {
  tradeId: '', dischargePort: '', agentId: '', agentName: '', agentPhone: '', agentFax: '',
  agentMobile: '', agentEmail: '', agentWeb: '', agentAddress: '', surveyor: '',
  sellerSurveyor: '', originalDocsAddress: '', consigneeOption: 'to_order', consigneeCustom: '',
  consigneeBuyerId: '', notifyOption: 'buyer_details', notifyCustom: '', notifyBuyerId: '',
  shipperText: '', descriptionOfGoods: '', paymentTerm: '',
  requiredDocuments: DEFAULT_REQUIRED_DOCS.map(d => ({ ...d })),
};

export default function DocInstructionsPage({ filterTradeId, embedded } = {}) {
  const [diList, setDiList] = useState([]);
  const [trades, setTrades] = useState([]);
  const [ports, setPorts] = useState([]);
  const [agents, setAgents] = useState([]);
  const [buyers, setBuyers] = useState([]);
  const [surveyors, setSurveyors] = useState([]);
  const [form, setForm] = useState({ ...DEFAULT_FORM });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [sending, setSending] = useState(null);
  const [previewDi, setPreviewDi] = useState(null);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [diEmailDialog, setDiEmailDialog] = useState(false);
  const [diEmailDi, setDiEmailDi] = useState(null);
  const [diEmailTo, setDiEmailTo] = useState('');
  const [diEmailCc, setDiEmailCc] = useState([]);
  const [diEmailExtraCc, setDiEmailExtraCc] = useState('');
  const previewRef = useRef(null);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    try {
      const [diRes, trRes, poRes, agRes, paRes, svRes] = await Promise.all([
        api.get('/api/doc-instructions/'),
        api.get('/api/trades'),
        api.get('/api/ports'),
        api.get('/api/disport-agents'),
        api.get('/api/partners'),
        api.get('/api/surveyors'),
      ]);
      setDiList(diRes.data);
      setTrades(trRes.data);
      setPorts(poRes.data);
      setAgents(agRes.data);
      setSurveyors(svRes.data);
      setBuyers(paRes.data.filter(p => {
        const t = Array.isArray(p.type) ? p.type : [p.type];
        return t.includes('buyer');
      }));
    } catch (err) {
      console.error('Failed to load data');
    }
    setDataLoaded(true);
  };

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleAgentSelect = (agentId) => {
    if (agentId === 'TBA') {
      setForm(prev => ({ ...prev, agentId: 'TBA', agentName: 'TBA', agentPhone: '', agentFax: '', agentMobile: '', agentEmail: '', agentWeb: '', agentAddress: '' }));
      return;
    }
    const agent = agents.find(a => a.id === agentId);
    if (agent) {
      setForm(prev => ({
        ...prev,
        agentId, agentName: agent.name || '',
        agentPhone: agent.tel || '', agentFax: agent.fax || '',
        agentMobile: agent.whatsapp || '', agentEmail: agent.email || '',
        agentWeb: agent.web || '', agentAddress: agent.address || '',
      }));
    }
  };

  const handlePortSelect = (portDisplay) => {
    set('dischargePort', portDisplay);
    if (portDisplay === 'TBA') return;
    // Extract port name for agent matching
    const portName = portDisplay.split(',')[0].trim();
    const matchingAgent = agents.find(a => a.port && a.port.toLowerCase() === portName.toLowerCase());
    if (matchingAgent) {
      handleAgentSelect(matchingAgent.id);
    }
  };

  const handleSave = async () => {
    if (!form.tradeId) { toast.error('Please select a contract'); return; }
    try {
      if (editingId) {
        const { tradeId, ...updateData } = form;
        await api.put(`/api/doc-instructions/${editingId}`, updateData);
        toast.success('Documentary Instruction updated');
      } else {
        await api.post('/api/doc-instructions/', form);
        toast.success('Documentary Instruction created');
      }
      setDialogOpen(false);
      setEditingId(null);
      setForm({ ...DEFAULT_FORM });
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save');
    }
  };

  const handleEdit = (di) => {
    setEditingId(di.id);
    const trade = trades.find(t => t.id === di.tradeId);
    setForm({
      tradeId: di.tradeId || '', dischargePort: di.dischargePort || '',
      agentId: di.agentId || '', agentName: di.agentName || '',
      agentPhone: di.agentPhone || '', agentFax: di.agentFax || '',
      agentMobile: di.agentMobile || '', agentEmail: di.agentEmail || '',
      agentWeb: di.agentWeb || '', agentAddress: di.agentAddress || '',
      surveyor: di.surveyor || '', sellerSurveyor: di.sellerSurveyor || trade?.sellerSurveyor || '',
      originalDocsAddress: di.originalDocsAddress || '',
      consigneeOption: di.consigneeOption || 'to_order', consigneeCustom: di.consigneeCustom || '',
      consigneeBuyerId: di.consigneeBuyerId || '', notifyOption: di.notifyOption || 'buyer_details',
      notifyCustom: di.notifyCustom || '', notifyBuyerId: di.notifyBuyerId || '',
      shipperText: di.shipperText || '', descriptionOfGoods: di.descriptionOfGoods || '',
      paymentTerm: di.paymentTerm || '',
      requiredDocuments: di.requiredDocuments?.length ? di.requiredDocuments.map(d => ({ ...d })) : DEFAULT_REQUIRED_DOCS.map(d => ({ ...d })),
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/api/doc-instructions/${id}`);
      toast.success('Deleted');
      fetchAll();
      if (previewDi?.id === id) setPreviewDi(null);
    } catch (err) {
      toast.error('Failed to delete');
    }
  };

  const openSendDiDialog = async (di) => {
    setDiEmailDi(di);
    setDiEmailExtraCc('');
    try {
      const trade = trades.find(t => t.id === di.tradeId);
      const res = await api.get(`/api/email-prefill/${di.tradeId}`);
      const d = res.data;
      // All seller emails as To
      const sellerEmails = d.sellerEmails || [];
      setDiEmailTo(sellerEmails.join(', '));
      // CC: only BA emails
      setDiEmailCc([...(d.BAemails || [])]);
    } catch {
      setDiEmailTo('');
      setDiEmailCc([]);
    }
    setDiEmailDialog(true);
  };

  const handleSendEmail = async () => {
    if (!diEmailTo || !diEmailDi) { toast.error('Enter a recipient email'); return; }
    const toEmails = diEmailTo.split(',').map(e => e.trim()).filter(Boolean);
    const extraArr = diEmailExtraCc.split(',').map(e => e.trim()).filter(Boolean);
    setSending(diEmailDi.id);
    try {
      const res = await api.post(`/api/doc-instructions/${diEmailDi.id}/send-email`, {
        toEmail: toEmails[0],
        toEmails: toEmails,
        ccEmails: [...diEmailCc, ...extraArr],
      });
      toast.success(res.data.message);
      setDiEmailDialog(false);
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to send email');
    } finally {
      setSending(null);
    }
  };

  const handleExtractFromPdf = async () => {
    if (!filterTradeId) return;
    setExtracting(true);
    try {
      const res = await api.post(`/api/doc-instructions/extract-from-pdf/${filterTradeId}`);
      const d = res.data;
      const trade = trades.find(t => t.id === filterTradeId);

      // Determine consignee option
      let consigneeOption = 'custom';
      let consigneeCustom = d.consigneeText || '';
      if (consigneeCustom.toLowerCase().includes('to order') && !consigneeCustom.toLowerCase().includes('to order of')) {
        consigneeOption = 'to_order';
        consigneeCustom = '';
      }

      // Determine notify option
      let notifyOption = 'custom';
      let notifyCustom = d.notifyPartyText || '';

      // Map required documents
      let requiredDocuments = DEFAULT_REQUIRED_DOCS.map(dd => ({ ...dd }));
      if (d.requiredDocuments?.length) {
        requiredDocuments = d.requiredDocuments.map(rd => ({
          name: rd.name || '',
          originals: rd.originals || 0,
          copies: rd.copies || 0,
        }));
      }

      setForm({
        tradeId: filterTradeId,
        dischargePort: d.dischargePort || '',
        agentId: '', agentName: d.agentName || '',
        agentPhone: d.agentPhone || '', agentFax: d.agentFax || '',
        agentMobile: d.agentMobile || '', agentEmail: d.agentEmail || '',
        agentWeb: d.agentWeb || '', agentAddress: d.agentAddress || '',
        surveyor: d.surveyor || '',
        sellerSurveyor: d.sellerSurveyor || trade?.sellerSurveyor || '',
        originalDocsAddress: d.originalDocsAddress || '',
        consigneeOption, consigneeCustom,
        consigneeBuyerId: trade?.buyerId || '',
        notifyOption, notifyCustom,
        notifyBuyerId: trade?.buyerId || '',
        shipperText: d.shipperText || '',
        requiredDocuments,
      });
      setEditingId(null);
      setDialogOpen(true);
      toast.success('Data extracted from document');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to extract data from PDF');
    } finally {
      setExtracting(false);
    }
  };

  const getTradeDropdownLabel = (trade) => {
    const num = trade.BAContractNumber || trade.contractNumber || '';
    const qty = trade.quantity ? Number(trade.quantity).toLocaleString('en-US') : '';
    const origin = trade.originAdjective || trade.originName || '';
    const commodity = trade.commodityName || '';
    const seller = trade.sellerCode || trade.sellerName || '';
    const buyer = trade.buyerCode || trade.buyerName || '';
    const vessel = trade.vesselName || '';
    const parts = [num];
    if (qty || commodity) parts.push(`${qty} Mts ${origin} ${commodity}`.trim());
    if (seller || buyer) parts.push(`${seller} / ${buyer}`.trim());
    if (vessel) parts.push(vessel);
    return parts.filter(Boolean).join(' - ');
  };

  const getTradeLabel = (tradeId) => {
    const trade = trades.find(t => t.id === tradeId);
    return trade ? (trade.BAContractNumber || trade.contractNumber || tradeId) : tradeId;
  };

  const getBuyerName = (buyerId) => {
    const buyer = buyers.find(b => b.id === buyerId);
    return buyer?.companyName || '';
  };

  const getBuyerDisplay = (buyerId) => {
    const buyer = buyers.find(b => b.id === buyerId);
    if (!buyer) return '';
    let lines = [buyer.companyName || ''];
    if (buyer.address) lines.push(buyer.address);
    if (buyer.city || buyer.country) lines.push([buyer.city, buyer.country].filter(Boolean).join(' / '));
    // Transliterate Turkish chars to English and uppercase
    const trMap = { 'ı': 'I', 'İ': 'I', 'ğ': 'G', 'Ğ': 'G', 'ü': 'U', 'Ü': 'U', 'ş': 'S', 'Ş': 'S', 'ö': 'O', 'Ö': 'O', 'ç': 'C', 'Ç': 'C', 'â': 'A', 'Â': 'A' };
    return lines.join('\n').split('').map(c => trMap[c] || c).join('').toUpperCase();
  };

  const getConsigneeText = (di) => {
    if (di.consigneeOption === 'to_order') return 'TO ORDER';
    if (di.consigneeOption === 'buyer_details') return di.consigneeBuyerText || getBuyerDisplay(di.consigneeBuyerId);
    return di.consigneeCustom || '—';
  };

  const trToEn = (str) => {
    const trMap = { 'ı': 'I', 'İ': 'I', 'ğ': 'G', 'Ğ': 'G', 'ü': 'U', 'Ü': 'U', 'ş': 'S', 'Ş': 'S', 'ö': 'O', 'Ö': 'O', 'ç': 'C', 'Ç': 'C', 'â': 'A', 'Â': 'A' };
    return str.split('').map(c => trMap[c] || c).join('').toUpperCase();
  };

  const getNotifyText = (di) => {
    if (di.notifyOption === 'buyer_details') {
      const buyer = buyers.find(b => b.id === di.notifyBuyerId);
      if (!buyer) return di.notifyBuyerText ? trToEn(di.notifyBuyerText) : '—';
      let lines = [buyer.companyName || ''];
      if (buyer.address) lines.push(buyer.address);
      if (buyer.city || buyer.country) lines.push([buyer.city, buyer.country].filter(Boolean).join(' / '));
      return trToEn(lines.join('\n'));
    }
    return di.notifyCustom ? trToEn(di.notifyCustom) : '—';
  };

  const handleCopy = () => {
    if (previewRef.current) {
      const range = document.createRange();
      range.selectNodeContents(previewRef.current);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand('copy');
      sel.removeAllRanges();
      toast.success('Copied to clipboard');
    }
  };

  const handleGeneratePdf = () => {
    if (!previewRef.current) return;
    const contractLabel = getTradeLabel(previewDi.tradeId);
    html2pdf().set({
      margin: [15, 15, 15, 15],
      filename: `Documentary_Instructions_${contractLabel}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, allowTaint: true, logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    }).from(previewRef.current).save();
  };

  const handlePrint = () => {
    const content = previewRef.current?.innerHTML;
    if (!content) return;
    const win = window.open('', '_blank');
    win.document.write(`<html><head><title>Documentary Instructions</title><style>
      body { font-family: Arial, sans-serif; font-size: 13px; color: #111; padding: 30px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
      th, td { border: 1px solid #ccc; padding: 8px 10px; text-align: left; vertical-align: top; }
      th { background: #f3f4f6; font-weight: 600; width: 200px; }
      h2 { text-align: center; color: #1A5276; }
      h3 { color: #1A5276; border-bottom: 2px solid #1A5276; padding-bottom: 4px; }
    </style></head><body>${content}</body></html>`);
    win.document.close();
    win.print();
  };

  // For live preview from form
  const formConsignee = form.consigneeOption === 'to_order' ? 'TO ORDER' :
    form.consigneeOption === 'buyer_details' ? getBuyerDisplay(form.consigneeBuyerId) :
    form.consigneeCustom || '—';
  const formNotify = form.notifyOption === 'buyer_details' ? getBuyerDisplay(form.notifyBuyerId) :
    form.notifyCustom || '—';

  // Discharge ports with country for display (exclude Marmara ports)
  const dischargePorts = [...new Map(
    ports.filter(p => p.type === 'discharge' && !p.name.toLowerCase().includes('marmara'))
      .map(p => [`${p.name}, ${p.country}`, { name: p.name, country: p.country, display: `${p.name}, ${p.country}` }])
  ).values()].sort((a, b) => a.display.localeCompare(b.display));

  // Handle trade selection - auto-populate seller surveyor and buyer
  const handleTradeSelect = (tradeId) => {
    const trade = trades.find(t => t.id === tradeId);
    setForm(prev => ({
      ...prev,
      tradeId,
      sellerSurveyor: trade?.sellerSurveyor || '',
      notifyBuyerId: trade?.buyerId || prev.notifyBuyerId,
      consigneeBuyerId: trade?.buyerId || prev.consigneeBuyerId,
    }));
  };

  // Filter DIs by trade when embedded
  const filteredDiList = filterTradeId ? diList.filter(di => di.tradeId === filterTradeId) : diList;

  // In embedded mode, auto-select first DI for preview if exists
  useEffect(() => {
    if (!embedded || !filterTradeId || !dataLoaded) return;
    const existing = diList.filter(di => di.tradeId === filterTradeId);
    if (existing.length > 0) {
      setPreviewDi(existing[0]);
    }
  }, [embedded, filterTradeId, dataLoaded, diList.length]);

  return (
    <div className={embedded ? "space-y-4" : "space-y-6"} data-testid="doc-instructions-page">
      {!embedded && (
        <div className="flex items-center justify-between">
          <div></div>
          <Button onClick={() => { setForm({ ...DEFAULT_FORM }); setEditingId(null); setDialogOpen(true); }} data-testid="new-di-btn">
            <Plus className="h-4 w-4 mr-2" />New DI
          </Button>
        </div>
      )}
      {embedded && (
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">Documentary Instructions to Seller</h3>
          <div className="flex gap-2">
            {(() => { const t = trades.find(tr => tr.id === filterTradeId); return t?.diDocumentPath ? (
              <Button size="sm" variant="outline" className="border-[#1A5276] text-[#1A5276] hover:bg-blue-50" onClick={handleExtractFromPdf} disabled={extracting} data-testid="extract-di-from-pdf-btn">
                {extracting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
                {extracting ? 'Extracting...' : 'Create DI from Document'}
              </Button>
            ) : null; })()}
            <Button size="sm" variant="outline" onClick={() => { const trade = trades.find(t => t.id === filterTradeId); setForm({ ...DEFAULT_FORM, tradeId: filterTradeId || '', sellerSurveyor: trade?.sellerSurveyor || '', notifyBuyerId: trade?.buyerId || '', consigneeBuyerId: trade?.buyerId || '', requiredDocuments: DEFAULT_REQUIRED_DOCS.map(d => ({ ...d })) }); setEditingId(null); setDialogOpen(true); }} data-testid="new-di-btn">
              <Plus className="h-4 w-4 mr-2" />New DI
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* DI List */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-[#1A5276]">Saved Instructions</h2>
          {filteredDiList.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">{embedded ? 'No documentary instructions yet.' : 'No documentary instructions yet. Click "New DI" to create one.'}</CardContent></Card>
          ) : (
            filteredDiList.map(di => (
              <Card key={di.id} className={`cursor-pointer transition-colors ${previewDi?.id === di.id ? 'border-[#1A5276] border-2' : 'hover:border-[#1A5276]/50'}`}
                onClick={() => setPreviewDi(di)} data-testid={`di-card-${di.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-semibold">{getTradeLabel(di.tradeId)}</p>
                      <p className="text-sm text-muted-foreground">{di.dischargePort || 'No port'} &bull; {di.agentName || 'No agent'}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Created: {new Date(di.createdAt).toLocaleDateString('en-GB')}
                        {di.sentAt && <span className="text-[#1A5276] ml-2">Sent: {new Date(di.sentAt).toLocaleDateString('en-GB')}</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handleEdit(di)} data-testid={`edit-di-${di.id}`}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-500" onClick={() => handleDelete(di.id)} data-testid={`delete-di-${di.id}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="outline" size="sm" className="h-8" disabled={sending === di.id} onClick={() => openSendDiDialog(di)} data-testid={`send-di-${di.id}`}>
                        {sending === di.id ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Send className="h-3.5 w-3.5 mr-1" />}
                        Send DI
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Preview */}
        <div>
          {previewDi ? (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-[#1A5276]">Preview - {getTradeLabel(previewDi.tradeId)}</CardTitle>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={handleCopy}><Copy className="h-4 w-4 mr-1" />Copy</Button>
                    <Button variant="outline" size="sm" onClick={handleGeneratePdf}><FileText className="h-4 w-4 mr-1" />Generate PDF</Button>
                    <Button variant="outline" size="sm" onClick={handlePrint}><Printer className="h-4 w-4 mr-1" />Print</Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div ref={previewRef} className="text-sm leading-relaxed space-y-4">
                  <div style={{ textAlign: 'center', marginTop: '-16px', marginBottom: '-12px' }}>
                    <img src="/dealspot-logo.png" alt="DealSpot" crossOrigin="anonymous" style={{ height: '240px', margin: '0 auto' }} onError={(e) => { e.target.style.display = 'none'; }} />
                  </div>
                  {(() => {
                    const t = trades.find(tr => tr.id === previewDi.tradeId);
                    const qty = t?.quantity ? Number(t.quantity).toLocaleString('en-US') : '';
                    const commodity = (t?.commodityName || '').toUpperCase();
                    const vessel = (t?.vesselName || '').toUpperCase();
                    const titleParts = ['DOCUMENTARY INSTRUCTIONS FOR'];
                    if (qty) titleParts.push(`${qty} MTS`);
                    if (commodity) titleParts.push(commodity);
                    if (vessel) titleParts.push(`- ${vessel}`);
                    return <h2 style={{ textAlign: 'center', fontWeight: 700, fontSize: '16px', color: '#1A5276', marginTop: '0', marginBottom: '8px' }}>{titleParts.join(' ')}</h2>;
                  })()}
                  <h3 style={{ fontWeight: 700, fontSize: '14px', color: '#1A5276', borderBottom: '2px solid #1A5276', paddingBottom: '4px' }}>Shipper & Consignee & Notify Party</h3>
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '12px' }}>
                    <tbody>
                      <tr>
                        <th style={{ border: '1px solid #d1d5db', padding: '6px 10px', background: '#f3f4f6', fontWeight: 600, width: '180px', textAlign: 'left', verticalAlign: 'middle' }}>Shipper</th>
                        <td style={{ border: '1px solid #d1d5db', padding: '6px 10px', whiteSpace: 'pre-wrap', verticalAlign: 'middle' }}>{previewDi.shipperText || (() => { const t = trades.find(tr => tr.id === previewDi.tradeId); const seller = t?.sellerName || ''; const trMap = { 'ı': 'I', 'İ': 'I', 'ğ': 'G', 'Ğ': 'G', 'ü': 'U', 'Ü': 'U', 'ş': 'S', 'Ş': 'S', 'ö': 'O', 'Ö': 'O', 'ç': 'C', 'Ç': 'C', 'â': 'A', 'Â': 'A' }; const sellerEn = seller.split('').map(c => trMap[c] || c).join('').toUpperCase(); return `……………….. on behalf of ${sellerEn}`; })()}</td>
                      </tr>
                      <tr>
                        <th style={{ border: '1px solid #d1d5db', padding: '6px 10px', background: '#f3f4f6', fontWeight: 600, width: '180px', textAlign: 'left', verticalAlign: 'middle' }}>Consignee</th>
                        <td style={{ border: '1px solid #d1d5db', padding: '6px 10px', whiteSpace: 'pre-wrap', verticalAlign: 'middle' }}>{getConsigneeText(previewDi)}</td>
                      </tr>
                      <tr>
                        <th style={{ border: '1px solid #d1d5db', padding: '6px 10px', background: '#f3f4f6', fontWeight: 600, width: '180px', textAlign: 'left', verticalAlign: 'middle' }}>Notify Party</th>
                        <td style={{ border: '1px solid #d1d5db', padding: '6px 10px', whiteSpace: 'pre-wrap', verticalAlign: 'middle' }}>{getNotifyText(previewDi)}</td>
                      </tr>
                      <tr>
                        <th style={{ border: '1px solid #d1d5db', padding: '6px 10px', background: '#f3f4f6', fontWeight: 600, width: '180px', textAlign: 'left', verticalAlign: 'middle' }}>Description of Goods</th>
                        <td style={{ border: '1px solid #d1d5db', padding: '6px 10px', whiteSpace: 'pre-wrap', verticalAlign: 'middle' }}>{previewDi.descriptionOfGoods || (() => { const t = trades.find(tr => tr.id === previewDi.tradeId); const origin = t?.originAdjective || ''; const commodity = t?.commodityName || ''; const crop = t?.cropYear || ''; const parts = [origin, commodity, 'IN BULK'].filter(Boolean).join(' ').toUpperCase(); return crop ? `${parts}, CROP ${crop}` : parts; })()}</td>
                      </tr>
                    </tbody>
                  </table>
                  <h3 style={{ fontWeight: 700, fontSize: '14px', color: '#1A5276', borderBottom: '2px solid #1A5276', paddingBottom: '4px' }}>Shipment & Port Details</h3>
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '12px' }}>
                    <tbody>
                      {[
                        ['Loading Port', (() => { const t = trades.find(tr => tr.id === previewDi.tradeId); const pId = t?.loadingPortId || t?.basePortId; if (!pId) return '—'; const p = ports.find(pp => pp.id === pId); return p ? `${p.name}, ${p.country}` : '—'; })()],
                        ['Discharge Port', previewDi.dischargePort === 'TBA' ? 'TBA (To be advised)' : (previewDi.dischargePort || 'TBA (To be advised)')],
                        ['Discharge Port Agent', (() => {
                          if (!previewDi.agentName || previewDi.agentName === 'TBA' || previewDi.agentId === 'TBA') return 'TBA (To be advised)';
                          const parts = [previewDi.agentName];
                          const contacts = [`Tel: ${previewDi.agentPhone || '—'}`, previewDi.agentFax ? `Fax: ${previewDi.agentFax}` : null, previewDi.agentMobile ? `Mob: ${previewDi.agentMobile}` : null].filter(Boolean).join('  •  ');
                          if (contacts) parts.push(contacts);
                          const emailWeb = [previewDi.agentEmail, previewDi.agentWeb].filter(Boolean).join('  •  ');
                          if (emailWeb) parts.push(emailWeb);
                          return parts.join('\n');
                        })()],
                        ['Buyer Surveyor', (() => { const s = previewDi.surveyor || '—'; const t = trades.find(tr => tr.id === previewDi.tradeId); const pId = t?.loadingPortId || t?.basePortId; const p = pId ? ports.find(pp => pp.id === pId) : null; return s !== '—' && p?.country ? `${s} ${p.country}` : s; })()],
                      ].map(([label, val], i) => (
                        <tr key={i}>
                          <th style={{ border: '1px solid #d1d5db', padding: '6px 10px', background: '#f3f4f6', fontWeight: 600, width: '180px', textAlign: 'left', verticalAlign: 'middle' }}>{label}</th>
                          <td style={{ border: '1px solid #d1d5db', padding: '6px 10px', whiteSpace: 'pre-wrap', verticalAlign: 'middle' }}>{val}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <h3 style={{ fontWeight: 700, fontSize: '14px', color: '#1A5276', borderBottom: '2px solid #1A5276', paddingBottom: '4px' }}>Required Documents</h3>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ border: '1px solid #d1d5db', padding: '6px', background: '#f3f4f6', width: '36px', textAlign: 'center' }}>#</th>
                        <th style={{ border: '1px solid #d1d5db', padding: '6px', background: '#f3f4f6', textAlign: 'left' }}>Document</th>
                        <th style={{ border: '1px solid #d1d5db', padding: '6px', background: '#f3f4f6', textAlign: 'center', width: '80px' }}>Originals</th>
                        <th style={{ border: '1px solid #d1d5db', padding: '6px', background: '#f3f4f6', textAlign: 'center', width: '80px' }}>Copies</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(previewDi.requiredDocuments?.length ? previewDi.requiredDocuments : DEFAULT_REQUIRED_DOCS).map((rd, idx) => (
                        <tr key={idx}>
                          <td style={{ border: '1px solid #d1d5db', padding: '6px', textAlign: 'center', fontWeight: 600, verticalAlign: 'top' }}>{idx + 1}</td>
                          <td style={{ border: '1px solid #d1d5db', padding: '6px', fontWeight: 500, verticalAlign: 'top' }}>{rd.name}</td>
                          <td style={{ border: '1px solid #d1d5db', padding: '6px', textAlign: 'center', verticalAlign: 'top' }}>{rd.originals}</td>
                          <td style={{ border: '1px solid #d1d5db', padding: '6px', textAlign: 'center', verticalAlign: 'top' }}>{rd.copies}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <h3 style={{ fontWeight: 700, fontSize: '14px', color: '#1A5276', borderBottom: '2px solid #1A5276', paddingBottom: '4px', marginTop: '16px' }}>Address for Original Documents</h3>
                  <div style={{ border: '1px solid #d1d5db', padding: '10px', background: '#f9fafb', whiteSpace: 'pre-wrap', marginBottom: '12px' }}>{previewDi.originalDocsAddress || 'To be advised later.'}</div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Select a DI from the list to preview</p>
            </CardContent></Card>
          )}
        </div>
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[#1A5276] text-center">{(() => {
              const trade = trades.find(t => t.id === form.tradeId);
              if (trade) {
                const num = trade.BAContractNumber || trade.contractNumber || '';
                const qty = trade.quantity ? Number(trade.quantity).toLocaleString('en-US') : '';
                const origin = trade.originAdjective || trade.originName || '';
                const commodity = trade.commodityName || '';
                const vessel = trade.vesselName || '';
                const parts = ['Documentary Instruction', num, `${qty} Mts ${origin} ${commodity}`.trim()];
                if (vessel) parts.push(vessel);
                return parts.filter(Boolean).join(' - ');
              }
              return editingId ? 'Edit Documentary Instruction' : 'New Documentary Instruction';
            })()}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* Contract Selection - only show when not embedded */}
            {!filterTradeId && (
            <div className="space-y-2">
              <Label>Contract *</Label>
              <Select value={form.tradeId} onValueChange={handleTradeSelect} disabled={!!editingId}>
                <SelectTrigger data-testid="di-contract-select"><SelectValue placeholder="Select contract" /></SelectTrigger>
                <SelectContent>
                  {trades.filter(t => t.BAContractNumber || t.contractNumber).map(t => (
                    <SelectItem key={t.id} value={t.id}>{getTradeDropdownLabel(t)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            )}

            {/* Consignee & Notify */}
            <div className="space-y-3">
              <h3 className="font-semibold text-sm text-[#1A5276] border-b pb-1 text-center mt-4">Shipper & Consignee & Notify Party</h3>

              {/* Shipper */}
              <div className="space-y-2">
                <Label>Shipper</Label>
                <Input value={form.shipperText || (() => { const t = trades.find(tr => tr.id === (filterTradeId || form.tradeId)); const seller = t?.sellerName || ''; const trMap = { 'ı': 'I', 'İ': 'I', 'ğ': 'G', 'Ğ': 'G', 'ü': 'U', 'Ü': 'U', 'ş': 'S', 'Ş': 'S', 'ö': 'O', 'Ö': 'O', 'ç': 'C', 'Ç': 'C', 'â': 'A', 'Â': 'A' }; const sellerEn = seller.split('').map(c => trMap[c] || c).join('').toUpperCase(); return `……………….. on behalf of ${sellerEn}`; })()} onChange={e => set('shipperText', e.target.value)} placeholder="Shipper name and details" data-testid="di-shipper-input" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Consignee</Label>
                  <Select value={form.consigneeOption} onValueChange={v => set('consigneeOption', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="to_order">TO ORDER</SelectItem>
                      <SelectItem value="buyer_details">Buyer Details</SelectItem>
                      <SelectItem value="other">Other (Custom)</SelectItem>
                    </SelectContent>
                  </Select>
                  {form.consigneeOption === 'other' && (
                    <Textarea value={form.consigneeCustom} onChange={e => set('consigneeCustom', e.target.value)} rows={2} placeholder="Enter custom consignee" />
                  )}
                  {form.consigneeOption === 'buyer_details' && form.consigneeBuyerId && (
                    <div className="bg-muted/50 rounded-lg p-3 text-sm whitespace-pre-wrap">{getBuyerDisplay(form.consigneeBuyerId)}</div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Notify Party</Label>
                  <Select value={form.notifyOption} onValueChange={v => set('notifyOption', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="buyer_details">Buyer Details</SelectItem>
                      <SelectItem value="other">Other (Custom)</SelectItem>
                    </SelectContent>
                  </Select>
                  {form.notifyOption === 'other' && (
                    <Textarea value={form.notifyCustom} onChange={e => set('notifyCustom', e.target.value)} rows={2} placeholder="Enter custom notify party" />
                  )}
                  {form.notifyOption === 'buyer_details' && form.notifyBuyerId && (
                    <div className="bg-muted/50 rounded-lg p-3 text-sm whitespace-pre-wrap">{getBuyerDisplay(form.notifyBuyerId)}</div>
                  )}
                </div>
              </div>
            </div>

            {/* Description of Goods */}
            <div className="space-y-0">
              <Label>Description of Goods</Label>
              <Input value={form.descriptionOfGoods || (() => { const t = trades.find(tr => tr.id === (filterTradeId || form.tradeId)); const origin = t?.originAdjective || ''; const commodity = t?.commodityName || ''; const crop = t?.cropYear || ''; const parts = [origin, commodity, 'IN BULK'].filter(Boolean).join(' ').toUpperCase(); return crop ? `${parts}, CROP ${crop}` : parts; })()} onChange={e => set('descriptionOfGoods', e.target.value)} placeholder="e.g. UKRAINIAN YELLOW CORN IN BULK, CROP 2025" data-testid="di-description-input" />
            </div>

            {/* Shipment & Port */}
            <div className="space-y-3">
              <h3 className="font-semibold text-sm text-[#1A5276] border-b pb-1 text-center">Shipment & Port Details</h3>
              {form.tradeId && (() => {
                const t = trades.find(tr => tr.id === form.tradeId);
                const pId = t?.loadingPortId || t?.basePortId;
                const p = pId ? ports.find(pp => pp.id === pId) : null;
                return p ? (
                  <div className="space-y-2">
                    <Label>Loading Port</Label>
                    <Input value={`${p.name}, ${p.country}`} disabled className="bg-muted/50" />
                  </div>
                ) : null;
              })()}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Discharge Port</Label>
                  <Select value={form.dischargePort} onValueChange={handlePortSelect}>
                    <SelectTrigger data-testid="di-port-select"><SelectValue placeholder="Select port" /></SelectTrigger>
                    <SelectContent side="bottom">
                      <SelectItem value="TBA">TBA (To be advised)</SelectItem>
                      {dischargePorts.map(p => <SelectItem key={p.display} value={p.display}>{p.display}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Discharge Port Agent</Label>
                  <Select value={form.agentId} onValueChange={handleAgentSelect}>
                    <SelectTrigger data-testid="di-agent-select"><SelectValue placeholder="Select agent" /></SelectTrigger>
                    <SelectContent side="bottom">
                      <SelectItem value="TBA">TBA (To be advised)</SelectItem>
                      {agents.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {form.agentName && form.agentName !== 'TBA' && (
                <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
                  <p className="font-medium">{form.agentName}</p>
                  {form.agentPhone && <p>Tel: {form.agentPhone}</p>}
                  {form.agentFax && <p>Fax: {form.agentFax}</p>}
                  {form.agentMobile && <p>Mobile: {form.agentMobile}</p>}
                  {form.agentEmail && <p>Email: {form.agentEmail}</p>}
                  {form.agentAddress && <p className="whitespace-pre-wrap">{form.agentAddress}</p>}
                </div>
              )}
              <div className="space-y-2">
                <Label>Buyer Surveyor at Load Port</Label>
                <Select value={form.surveyor} onValueChange={v => set('surveyor', v)}>
                  <SelectTrigger data-testid="di-surveyor-select"><SelectValue placeholder="Select surveyor" /></SelectTrigger>
                  <SelectContent side="bottom">
                    {surveyors.map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Seller Surveyor at Load Port</Label>
                <Select value={form.sellerSurveyor} onValueChange={v => set('sellerSurveyor', v)}>
                  <SelectTrigger data-testid="di-seller-surveyor"><SelectValue placeholder={form.tradeId ? 'Select surveyor' : 'Select a contract first'} /></SelectTrigger>
                  <SelectContent side="bottom">
                    {surveyors.map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Required Documents */}
            <div className="space-y-3">
              <h3 className="font-semibold text-sm text-[#1A5276] border-b pb-1 text-center">Required Documents</h3>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr>
                    <th className="border p-1.5 bg-muted/50 text-center w-8">#</th>
                    <th className="border p-1.5 bg-muted/50 text-left">Document Name</th>
                    <th className="border p-1.5 bg-muted/50 text-center w-20">Originals</th>
                    <th className="border p-1.5 bg-muted/50 text-center w-20">Copies</th>
                    <th className="border p-1.5 bg-muted/50 text-center w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {form.requiredDocuments.map((doc, idx) => (
                    <tr key={idx}>
                      <td className="border p-1.5 text-center text-muted-foreground">{idx + 1}</td>
                      <td className="border p-0">
                        <Input className="border-0 h-8 rounded-none focus-visible:ring-0" value={doc.name}
                          onChange={e => { const docs = [...form.requiredDocuments]; docs[idx] = { ...docs[idx], name: e.target.value }; set('requiredDocuments', docs); }}
                          data-testid={`req-doc-name-${idx}`} />
                      </td>
                      <td className="border p-0">
                        <Input type="number" min={0} className="border-0 h-8 rounded-none text-center focus-visible:ring-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" value={doc.originals}
                          onChange={e => { const docs = [...form.requiredDocuments]; docs[idx] = { ...docs[idx], originals: parseInt(e.target.value) || 0 }; set('requiredDocuments', docs); }}
                          data-testid={`req-doc-originals-${idx}`} />
                      </td>
                      <td className="border p-0">
                        <Input type="number" min={0} className="border-0 h-8 rounded-none text-center focus-visible:ring-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" value={doc.copies}
                          onChange={e => { const docs = [...form.requiredDocuments]; docs[idx] = { ...docs[idx], copies: parseInt(e.target.value) || 0 }; set('requiredDocuments', docs); }}
                          data-testid={`req-doc-copies-${idx}`} />
                      </td>
                      <td className="border p-1 text-center">
                        <button type="button" className="text-red-400 hover:text-red-600" onClick={() => { const docs = form.requiredDocuments.filter((_, i) => i !== idx); set('requiredDocuments', docs); }}
                          data-testid={`req-doc-remove-${idx}`}><X className="h-3.5 w-3.5" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Button type="button" size="sm" variant="outline" onClick={() => set('requiredDocuments', [...form.requiredDocuments, { name: '', originals: 1, copies: 0 }])} data-testid="add-req-doc-btn">
                <Plus className="h-3.5 w-3.5 mr-1" />Add Document
              </Button>
            </div>

            {/* Original Docs Address */}
            <div className="space-y-2">
              <h3 className="font-semibold text-sm text-[#1A5276] border-b pb-1">Original Documents Address</h3>
              <Textarea value={form.originalDocsAddress} onChange={e => set('originalDocsAddress', e.target.value)} rows={3} placeholder="To be advised later." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} data-testid="save-di-btn">{editingId ? 'Update' : 'Create'} DI</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send DI Email Dialog */}
      <Dialog open={diEmailDialog} onOpenChange={(open) => !open && setDiEmailDialog(false)}>
        <DialogContent className="sm:max-w-lg mx-auto">
          <DialogHeader><DialogTitle className="text-center">Send Documentary Instructions</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2 border rounded-lg p-3">
              <Label className="text-sm font-semibold">To Seller</Label>
              <Input value={diEmailTo} onChange={(e) => setDiEmailTo(e.target.value)} placeholder="seller@example.com" data-testid="di-email-to" />
              {diEmailCc.length > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">CC</Label>
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {diEmailCc.map(e => (
                      <label key={`di-cc-${e}`} className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input type="checkbox" checked={true} onChange={() => setDiEmailCc(prev => prev.filter(x => x !== e))} className="rounded" />
                        {e}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Additional CC</Label>
                <Input value={diEmailExtraCc} onChange={e => setDiEmailExtraCc(e.target.value)} placeholder="email1@example.com, email2@example.com" className="text-xs h-8" data-testid="di-extra-cc" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDiEmailDialog(false)}>Cancel</Button>
            <Button onClick={handleSendEmail} disabled={!!sending}>{sending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}Send</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
