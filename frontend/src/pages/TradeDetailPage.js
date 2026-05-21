import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Checkbox } from '../components/ui/checkbox';
import { Separator } from '../components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { ArrowLeft, FileText, Ship, Users, ClipboardCheck, Loader2, Save, CheckCircle2, Circle, Briefcase, User as UserIcon, Mail, Phone, Pencil, Plus, X, Paperclip, Download, Trash2, Upload, GripVertical, Send, CalendarDays } from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';
import { STATUS_OPTIONS, TRADE_STATUS_CONFIG } from '../lib/constants';
import { format, parseISO } from 'date-fns';
import { Calendar } from '../components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { cn } from '../lib/utils';

const DEFAULT_DOCS = [
  "Bill of Ladings", "Commercial Invoice", "Phytosanitary Certificate",
  "Certificate of Origin", "Weight Certificate", "Quality Certificate",
  "Hold Cleanliness Certificate", "Hold Sealing Certificate", "Fumigation Certificate",
  "Non-Radioactivity Certificate", "Cargo Manifest", "Marine Insurance Certificate",
  "Master's Receipt"
];

function getDocChecklist(commodity) {
  if (commodity && Array.isArray(commodity.documents) && commodity.documents.length > 0) {
    return commodity.documents;
  }
  return DEFAULT_DOCS;
}

export default function TradeDetailPage() {
  const { tradeId } = useParams();
  const navigate = useNavigate();
  const [trade, setTrade] = useState(null);
  const [loading, setLoading] = useState(true);
  const [docChecks, setDocChecks] = useState({});
  const [activeTab, setActiveTab] = useState('summary');
  const [saving, setSaving] = useState(false);
  const [partners, setPartners] = useState([]);
  const [commodities, setCommodities] = useState([]);
  const [vessels, setVessels] = useState([]);
  const [additionalDocs, setAdditionalDocs] = useState([]);
  const [newDocInput, setNewDocInput] = useState('');
  const [surveyors, setSurveyors] = useState([]);
  const [ports, setPorts] = useState([]);
  const [blDialogOpen, setBlDialogOpen] = useState(false);
  const [blForm, setBlForm] = useState({});
  const [blSaving, setBlSaving] = useState(false);
  const [disportAgents, setDisportAgents] = useState([]);
  const [loadportAgents, setLoadportAgents] = useState([]);
  const [diUploading, setDiUploading] = useState(false);
  const [docFiles, setDocFiles] = useState({});
  const [uploadingDoc, setUploadingDoc] = useState(null);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [draggedFile, setDraggedFile] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [sendingSA, setSendingSA] = useState(false);
  const [sendingBC, setSendingBC] = useState(false);
  const [emailDialog, setEmailDialog] = useState({ open: false, docType: '', docLabel: '' });
  const [emailSellerTo, setEmailSellerTo] = useState('');
  const [emailBuyerTo, setEmailBuyerTo] = useState('');
  const [emailSending, setEmailSending] = useState(false);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [tradeRes, partRes, comRes, vesRes, surRes, portRes, daRes, laRes] = await Promise.all([
          api.get(`/api/trades/${tradeId}`),
          api.get('/api/partners'),
          api.get('/api/commodities'),
          api.get('/api/vessels'),
          api.get('/api/surveyors'),
          api.get('/api/ports'),
          api.get('/api/disport-agents'),
          api.get('/api/loadport-agents'),
        ]);
        setTrade(tradeRes.data);
        setPartners(partRes.data);
        setCommodities(comRes.data);
        setVessels(vesRes.data);
        setSurveyors(surRes.data);
        setPorts(portRes.data);
        setDisportAgents(daRes.data);
        setLoadportAgents(laRes.data);
        setDocChecks(tradeRes.data.docChecks || {});
        setAdditionalDocs(tradeRes.data.additionalDocuments || []);
        // Fetch uploaded document files for this trade
        const filesRes = await api.get(`/api/documents?tradeId=${tradeId}`);
        const fileMap = {};
        (filesRes.data || []).forEach(f => {
          if (f.docName) {
            if (!fileMap[f.docName]) fileMap[f.docName] = [];
            fileMap[f.docName].push(f);
          }
        });
        setDocFiles(fileMap);
      } catch (err) {
        toast.error('Failed to load trade');
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [tradeId]);

  const getName = (list, id) => {
    const item = list.find(i => i.id === id);
    return item?.name || item?.companyName || '-';
  };

  const saveDocChecks = async () => {
    setSaving(true);
    try {
      await api.put(`/api/trades/${tradeId}`, { docChecks, additionalDocuments: additionalDocs });
      toast.success('Document checklist saved');
    } catch { toast.error('Failed to save'); }
    finally { setSaving(false); }
  };

  const uploadDocFile = async (docName, file) => {
    if (!file) return;
    setUploadingDoc(docName);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('tradeId', tradeId);
      formData.append('tradeRef', trade?.referenceNumber || '');
      formData.append('docType', 'checklist');
      formData.append('docName', docName);
      const res = await api.post('/api/documents', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setDocFiles(prev => ({
        ...prev,
        [docName]: [...(prev[docName] || []), res.data]
      }));
      toast.success(`File uploaded for ${docName}`);
    } catch { toast.error('Upload failed'); }
    finally { setUploadingDoc(null); }
  };

  const deleteDocFile = async (docName, fileId) => {
    try {
      await api.delete(`/api/documents/${fileId}`);
      setDocFiles(prev => ({
        ...prev,
        [docName]: (prev[docName] || []).filter(f => f.id !== fileId)
      }));
      toast.success('File removed');
    } catch { toast.error('Delete failed'); }
  };

  const bulkUploadFiles = async (files) => {
    if (!files || files.length === 0) return;
    setBulkUploading(true);
    let count = 0;
    for (const file of files) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('tradeId', tradeId);
        formData.append('tradeRef', trade?.referenceNumber || '');
        formData.append('docType', 'checklist');
        formData.append('docName', '_unassigned');
        const res = await api.post('/api/documents', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
        setDocFiles(prev => ({ ...prev, _unassigned: [...(prev._unassigned || []), res.data] }));
        count++;
      } catch { /* skip failed */ }
    }
    setBulkUploading(false);
    if (count > 0) toast.success(`${count} file(s) uploaded — drag them to assign`);
  };

  const reassignFile = async (file, fromDoc, toDoc) => {
    try {
      await api.put(`/api/documents/${file.id}/assign`, { docName: toDoc });
      setDocFiles(prev => {
        const next = { ...prev };
        next[fromDoc] = (next[fromDoc] || []).filter(f => f.id !== file.id);
        if (next[fromDoc].length === 0) delete next[fromDoc];
        next[toDoc] = [...(next[toDoc] || []), { ...file, docName: toDoc }];
        return next;
      });
      toast.success(`Moved to ${toDoc}`);
    } catch { toast.error('Failed to reassign'); }
  };

  const handleDragStart = (file, fromDoc) => { setDraggedFile({ file, fromDoc }); };
  const handleDragOver = (e, docName) => { e.preventDefault(); setDropTarget(docName); };
  const handleDragLeave = () => { setDropTarget(null); };
  const handleDrop = (e, toDoc) => {
    e.preventDefault();
    setDropTarget(null);
    if (draggedFile && draggedFile.fromDoc !== toDoc) {
      reassignFile(draggedFile.file, draggedFile.fromDoc, toDoc);
    }
    setDraggedFile(null);
  };

  const sendShipmentAppropriation = async () => {
    setSendingSA(true);
    try {
      // Download PDF as blob with auth header
      const res = await api.get(`/api/shipment-appropriation/${tradeId}/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      window.open(url, '_blank');
      // Record the send
      await api.put(`/api/trades/${tradeId}`, {
        shipmentAppropriationSentBy: trade.executionHandledBy || 'Admin',
        shipmentAppropriationSentAt: new Date().toISOString(),
      });
      setTrade(prev => ({
        ...prev,
        shipmentAppropriationSentBy: prev.executionHandledBy || 'Admin',
        shipmentAppropriationSentAt: new Date().toISOString(),
      }));
      toast.success('Shipment Appropriation generated');
    } catch { toast.error('Failed to generate'); }
    finally { setSendingSA(false); }
  };

  const reverseShipmentAppropriation = async () => {
    setSendingSA(true);
    try {
      await api.put(`/api/trades/${tradeId}`, {
        shipmentAppropriationSentBy: null,
        shipmentAppropriationSentAt: null,
      });
      setTrade(prev => ({ ...prev, shipmentAppropriationSentBy: null, shipmentAppropriationSentAt: null }));
      toast.success('Shipment Appropriation reversed');
    } catch { toast.error('Failed to reverse'); }
    finally { setSendingSA(false); }
  };

  const sendBusinessConfirmation = async () => {
    setSendingBC(true);
    try {
      const res = await api.get(`/api/business-confirmation/${tradeId}/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      window.open(url, '_blank');
      await api.put(`/api/trades/${tradeId}`, {
        businessConfirmationSentBy: trade.executionHandledBy || 'Admin',
        businessConfirmationSentAt: new Date().toISOString(),
      });
      setTrade(prev => ({
        ...prev,
        businessConfirmationSentBy: prev.executionHandledBy || 'Admin',
        businessConfirmationSentAt: new Date().toISOString(),
      }));
      toast.success('Business Confirmation generated');
    } catch { toast.error('Failed to generate'); }
    finally { setSendingBC(false); }
  };

  const openEmailDialog = (docType, docLabel) => {
    // Pre-fill with seller/buyer emails from the trade
    setEmailSellerTo(trade?.sellerEmail || '');
    setEmailBuyerTo(trade?.buyerEmail || '');
    setEmailDialog({ open: true, docType, docLabel });
  };

  const sendDocumentEmail = async () => {
    if (!emailSellerTo && !emailBuyerTo) { toast.error('Please enter at least one recipient email'); return; }
    setEmailSending(true);
    try {
      await api.post('/api/send-document-email', {
        trade_id: tradeId,
        doc_type: emailDialog.docType,
        seller_email: emailSellerTo,
        buyer_email: emailBuyerTo,
      });
      toast.success(`${emailDialog.docLabel} sent successfully`);
      setEmailDialog({ open: false, docType: '', docLabel: '' });
      fetchTrade();
    } catch (err) {
      console.error('Email send error:', err.response?.status, err.response?.data);
      toast.error(err.response?.data?.detail || err.response?.data?.message || 'Failed to send email');
    } finally { setEmailSending(false); }
  };

  const reverseBusinessConfirmation = async () => {
    setSendingBC(true);
    try {
      await api.put(`/api/trades/${tradeId}`, {
        businessConfirmationSentBy: null,
        businessConfirmationSentAt: null,
      });
      setTrade(prev => ({ ...prev, businessConfirmationSentBy: null, businessConfirmationSentAt: null }));
      toast.success('Business Confirmation reversed');
    } catch { toast.error('Failed to reverse'); }
    finally { setSendingBC(false); }
  };

  const saveBuyerPaymentDate = async (dateStr) => {
    try {
      await api.put(`/api/trades/${tradeId}`, { buyerPaymentDate: dateStr });
      setTrade(prev => ({ ...prev, buyerPaymentDate: dateStr }));
      toast.success('Buyer payment date saved');
    } catch { toast.error('Failed to save payment date'); }
  };

  const addAdditionalDoc = () => {
    const name = newDocInput.trim();
    if (!name) return;
    if (additionalDocs.includes(name)) { toast.error('Document already exists'); return; }
    setAdditionalDocs(prev => [...prev, name]);
    setNewDocInput('');
  };

  const removeAdditionalDoc = (doc) => {
    setAdditionalDocs(prev => prev.filter(d => d !== doc));
    setDocChecks(prev => { const next = {...prev}; delete next[doc]; return next; });
  };

  const toggleDoc = (doc) => {
    setDocChecks(prev => ({ ...prev, [doc]: !prev[doc] }));
  };

  const openBlDialog = () => {
    setBlForm({
      blNumber: trade.blNumber || '1',
      blDate: trade.blDate || '',
      blQuantity: trade.blQuantity != null ? String(trade.blQuantity) : '',
      loadPortId: trade.loadingPortId || trade.basePortId || '',
      dischargePortId: trade.dischargePortId || '',
      sellerSurveyor: trade.sellerSurveyor || '',
      buyerSurveyor: trade.buyerSurveyor || 'N/A',
      dischargeQuantity: trade.dischargeQuantity != null ? String(trade.dischargeQuantity) : '',
      disportAgent: trade.disportAgent || '',
      loadportAgent: trade.loadportAgent || '',
    });
    setBlDialogOpen(true);
  };

  const handleBlQuantityChange = (val) => {
    setBlForm(prev => ({ ...prev, blQuantity: val }));
  };

  const calcShortage = (blQty, dischQty) => {
    const bl = parseFloat(blQty) || 0;
    const disch = parseFloat(dischQty) || 0;
    if (!bl || !disch) return null;
    const allowance = bl * 0.005;
    const diff = bl - disch;
    if (diff > allowance) return diff - allowance;
    return 0;
  };

  const saveBlDetails = async () => {
    setBlSaving(true);
    try {
      const data = {
        blNumber: blForm.blNumber,
        blDate: blForm.blDate,
        blQuantity: blForm.blQuantity ? parseFloat(blForm.blQuantity) : 0,
        loadingPortId: blForm.loadPortId,
        dischargePortId: blForm.dischargePortId,
        sellerSurveyor: blForm.sellerSurveyor,
        buyerSurveyor: blForm.buyerSurveyor,
        dischargeQuantity: blForm.dischargeQuantity ? parseFloat(blForm.dischargeQuantity) : 0,
        disportAgent: blForm.disportAgent,
        loadportAgent: blForm.loadportAgent,
      };
      const res = await api.put(`/api/trades/${tradeId}`, data);
      setTrade(res.data);
      toast.success('Shipment (B/L) Details saved');
      setBlDialogOpen(false);
    } catch { toast.error('Failed to save B/L details'); }
    finally { setBlSaving(false); }
  };

  const toggleDiReceived = async (val) => {
    try {
      const res = await api.put(`/api/trades/${tradeId}`, { diReceived: val });
      setTrade(res.data);
      toast.success(val ? 'DI marked as received' : 'DI marked as not received');
    } catch { toast.error('Failed to update'); }
  };

  const uploadDiDocument = async (file) => {
    if (!file) return;
    setDiUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await api.post(`/api/trades/${tradeId}/upload-di`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      const res = await api.get(`/api/trades/${tradeId}`);
      setTrade(res.data);
      toast.success('DI document uploaded');
    } catch (err) { toast.error(err.response?.data?.detail || 'Upload failed'); }
    finally { setDiUploading(false); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  if (!trade) return <div className="text-center py-16 text-muted-foreground">Trade not found</div>;

  const statusConfig = STATUS_OPTIONS.find(s => s.value === trade.status);
  const statusColor = TRADE_STATUS_CONFIG[trade.status] || {};
  const commodity = commodities.find(c => c.id === trade.commodityId);
  const commodityName = commodity?.name || commodity?.companyName || '-';
  const docList = getDocChecklist(commodity);
  const allDocs = [...docList, ...additionalDocs];
  const completedDocs = allDocs.filter(d => docChecks[d]).length;

  return (
    <div className="space-y-6" data-testid="trade-detail-page">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/trades')}><ArrowLeft className="h-5 w-5" /></Button>
        <div className="flex-1">
          <h1 className="text-center text-lg font-bold text-green-700 dark:text-green-400">
            {trade.pirContractNumber || trade.referenceNumber || trade.contractNumber} - {trade.quantity ? `${Number(trade.quantity).toLocaleString()} Mts ` : ''}{trade.commodityName || ''} - {trade.vesselName ? `${trade.vesselName} ` : ''}({(trade.sellerName || '').split(' ').slice(0, 2).join(' ')} → {(trade.buyerName || '').split(' ').slice(0, 2).join(' ')})
          </h1>
        </div>
        {activeTab !== 'documents' && (
        <div className="flex items-center gap-2">
          <Button variant="outline" data-testid="edit-trade-detail-btn" onClick={() => activeTab === 'shipment' ? openBlDialog() : navigate(`/trades/${tradeId}/edit`)}>
            <Pencil className="h-4 w-4 mr-2" />{activeTab === 'shipment' ? 'Edit Shipment (B/L) Details' : 'Edit Contract'}
          </Button>
          <Button variant="destructive" data-testid="delete-trade-btn" onClick={async () => { if (window.confirm('Are you sure you want to delete this contract? This action cannot be undone.')) { try { await api.delete(`/api/trades/${tradeId}`); navigate('/trades'); } catch { toast.error('Failed to delete contract'); } } }}>
            <Trash2 className="h-4 w-4 mr-2" />Delete Contract
          </Button>
        </div>
        )}
      </div>

      {/* Trade Summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Contract Information</CardTitle></CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">BA Ticaret Ref. No</span><span className="font-medium">{trade.referenceNumber || '-'}</span></div>
                <Separator />
                <div className="flex justify-between"><span className="text-muted-foreground">Seller Sales Contract No.</span><span className="font-medium">{trade.sellerContractNumber || trade.pirContractNumber || trade.contractNumber || '-'}</span></div>
                <Separator />
                <div className="flex justify-between"><span className="text-muted-foreground">Contract Date</span><span className="font-medium">{(() => { const d = trade.contractDate; if (!d) return '-'; if (/^\d{2}\/\d{2}\/\d{4}$/.test(d)) return d; try { const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[3]}/${m[2]}/${m[1]}`; return d; } catch { return d; } })()}</span></div>
                <Separator />
                <div className="flex justify-between"><span className="text-muted-foreground">Seller</span><span className="font-medium">{trade.sellerName || getName(partners, trade.sellerId)}</span></div>
                <Separator />
                <div className="flex justify-between"><span className="text-muted-foreground">Buyer</span><span className="font-medium">{trade.buyerName || getName(partners, trade.buyerId)}</span></div>
                <Separator />
                <div className="flex justify-between"><span className="text-muted-foreground">Broker</span><span className="font-medium text-right">{trade.brokerName || getName(partners, trade.brokerId) || '-'}</span></div>
                {trade.brokerPersonName && (
                  <>
                    <Separator />
                    <div className="flex justify-between"><span className="text-muted-foreground">Broker Name</span><span className="font-medium">{trade.brokerPersonName}</span></div>
                  </>
                )}
                {trade.coBrokerId && (
                  <div className="flex justify-between"><span className="text-muted-foreground text-orange-600">Co-Broker</span><span className="font-medium text-orange-600">{trade.coBrokerName || getName(partners, trade.coBrokerId) || '-'}</span></div>
                )}
                <Separator />
                <div className="flex justify-between"><span className="text-muted-foreground">Commodity</span><span className="font-medium">{trade.commodityDisplayName || commodityName}</span></div>
                <Separator />
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground shrink-0">Specifications</span>
                  <span className="font-medium text-right whitespace-pre-line">{trade.commoditySpecs || commodity?.specs || '-'}</span>
                </div>
                <Separator />
                <div className="flex justify-between"><span className="text-muted-foreground">Quantity</span><span className="font-medium">{trade.quantity ? `${trade.quantity.toLocaleString()} MT${trade.tolerance ? ` (+/- ${trade.tolerance}%)` : ''}` : '-'}</span></div>
                <Separator />
                <div className="flex justify-between"><span className="text-muted-foreground">Unit Price</span><span className="font-medium">{trade.pricePerMT ? `${trade.currency || 'USD'} ${trade.pricePerMT.toLocaleString()}/MT ${(() => { const port = trade.basePortName || ''; const country = trade.basePortCountry || ''; const portDisplay = port && country ? `${port}, ${country}` : port; const term = trade.deliveryTerm || ''; if (portDisplay && portDisplay.toLowerCase().startsWith(term.toLowerCase())) return portDisplay; return [term, portDisplay].filter(Boolean).join(' '); })()}` : '-'}</span></div>
                {trade.portVariations && trade.portVariations.length > 0 && (
                  <>
                    <Separator />
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Port Options</span>
                      <div className="text-right space-y-1">
                        {trade.portVariations.map((pv, i) => {
                          const diff = Number(pv.difference || 0);
                          const portPrice = (trade.pricePerMT || 0) + diff;
                          const portName = pv.portName || pv.portId;
                          return (
                            <div key={i} className="font-medium">{trade.currency || 'USD'} {portPrice.toLocaleString()}/MT {trade.deliveryTerm || ''} {portName}{pv.portCountry ? `, ${pv.portCountry}` : ''} <span className={`font-mono ${diff < 0 ? 'text-red-600' : diff > 0 ? 'text-green-600' : ''}`}>({diff > 0 ? '+' : ''}{diff} USD)</span></div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Contract Terms</CardTitle></CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Payment Terms</span><span className="font-medium">{trade.paymentTerms || '-'}</span></div>
                <Separator />
                <div className="flex justify-between"><span className="text-muted-foreground">Origin</span><span className="font-medium">{trade.originName || '-'}</span></div>
                <Separator />
                <div className="flex justify-between"><span className="text-muted-foreground">Shipment Period</span><span className="font-medium text-right">{trade.shipmentWindowStart && trade.shipmentWindowEnd ? <>{(() => { try { const m = trade.shipmentWindowStart.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); if (m) return trade.shipmentWindowStart; return format(parseISO(trade.shipmentWindowStart), 'dd/MM/yyyy'); } catch { return trade.shipmentWindowStart; }})()}<br />{(() => { try { const m = trade.shipmentWindowEnd.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); if (m) return trade.shipmentWindowEnd; return format(parseISO(trade.shipmentWindowEnd), 'dd/MM/yyyy'); } catch { return trade.shipmentWindowEnd; }})()}</> : '-'}</span></div>
                <Separator />
                <div className="flex justify-between"><span className="text-muted-foreground">Vessel</span><span className="font-medium uppercase">{trade.vesselName || '-'}</span></div>
                <Separator />
                <div className="flex justify-between"><span className="text-muted-foreground">Discharge Rate</span><span className="font-medium">{trade.dischargeRate ? `${Number(trade.dischargeRate).toLocaleString()} Mts/Day` : '-'}</span></div>
                <Separator />
                <div className="flex justify-between"><span className="text-muted-foreground">Demurrage Rate</span><span className="font-medium">{trade.demurrageRate ? `USD ${Number(trade.demurrageRate).toLocaleString()}/Day` : '-'}</span></div>
                <Separator />
                <div className="flex justify-between"><span className="text-muted-foreground">Brokerage (per MT)</span><span className="font-medium">{trade.brokeragePerMT != null && trade.brokeragePerMT !== 0 ? `${trade.brokeragePerMT} ${trade.brokerageCurrency || 'USD'}` : '-'}</span></div>
                <Separator />
                <div className="flex justify-between"><span className="text-muted-foreground">Brokerage Payment</span><span className="font-medium capitalize">{trade.brokerageAccount ? `${trade.brokerageAccount} Account` : '-'}</span></div>
                <Separator />
                <div className="flex justify-between"><span className="text-muted-foreground">Execution Handled By</span><span className="font-medium">{trade.executionHandledBy || '-'}</span></div>
                <Separator />
                <div className="flex justify-between"><span className="text-muted-foreground">GAFTA Term</span><span className="font-medium text-right max-w-[60%]">{trade.gaftaTerm || 'GAFTA No. 48, Arbitration Clause 125, London'}</span></div>
                {trade.notes && (
                  <>
                    <Separator />
                    <div className="flex justify-between gap-4"><span className="text-muted-foreground shrink-0">Notes</span><span className="font-medium text-right whitespace-pre-line">{trade.notes}</span></div>
                  </>
                )}
                <Separator />
                <div className="flex justify-between"><span className="text-muted-foreground">Status</span><Badge className={statusColor.color || 'bg-muted'}>{statusConfig?.label || trade.status}</Badge></div>
              </CardContent>
            </Card>
          </div>

      {/* B/L Edit Dialog */}
      <Dialog open={blDialogOpen} onOpenChange={setBlDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Shipment (B/L) Details</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>B/L Number</Label>
                <Input data-testid="bl-number-input" value={blForm.blNumber || ''} onChange={(e) => setBlForm({...blForm, blNumber: e.target.value})} placeholder="1" />
              </div>
              <div className="space-y-2">
                <Label>B/L Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button data-testid="bl-date-input" variant="outline" className={cn('w-full justify-start text-left font-normal', !blForm.blDate && 'text-muted-foreground')}>
                      <CalendarDays className="mr-2 h-4 w-4" />
                      {blForm.blDate ? (() => { try { const d = new Date(blForm.blDate + (blForm.blDate.includes('T') ? '' : 'T00:00:00')); return !isNaN(d) ? format(d, 'dd/MM/yyyy') : blForm.blDate; } catch { return blForm.blDate; } })() : 'dd/mm/yyyy'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={blForm.blDate ? (() => { try { const d = new Date(blForm.blDate + (blForm.blDate.includes('T') ? '' : 'T00:00:00')); return !isNaN(d) ? d : undefined; } catch { return undefined; } })() : undefined} onSelect={(d) => { if (d) setBlForm({...blForm, blDate: format(d, 'dd/MM/yyyy')}); }} initialFocus />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>B/L Quantity (Mts)</Label>
                <Input data-testid="bl-quantity-input" type="number" value={blForm.blQuantity || ''} onChange={(e) => handleBlQuantityChange(e.target.value)} placeholder="e.g. 25000" />
              </div>
              <div className="space-y-2">
                <Label>Discharge Quantity (Mts)</Label>
                <Input data-testid="bl-discharge-qty-input" type="number" value={blForm.dischargeQuantity || ''} onChange={(e) => setBlForm({...blForm, dischargeQuantity: e.target.value})} placeholder="Enter discharge quantity" />
              </div>
            </div>
            <div className="p-3 rounded-lg border bg-muted/30 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Shortage (Mts)</span>
                <span className="font-medium">{(() => { const s = calcShortage(blForm.blQuantity, blForm.dischargeQuantity); if (s === null) return '-'; if (s > 0) return <span className="text-red-600 font-bold">-{s.toLocaleString(undefined, {maximumFractionDigits: 2})} MT</span>; return <span className="text-green-600">N/A</span>; })()}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Allowance: B/L Qty x 0.5% = {blForm.blQuantity ? (parseFloat(blForm.blQuantity) * 0.005).toLocaleString(undefined, {maximumFractionDigits: 2}) : '0'} MT</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Load Port</Label>
                <Select value={blForm.loadPortId || ''} onValueChange={(v) => setBlForm({...blForm, loadPortId: v})}>
                  <SelectTrigger><SelectValue placeholder="Select port" /></SelectTrigger>
                  <SelectContent>{ports.sort((a, b) => a.name.localeCompare(b.name)).map(p => <SelectItem key={p.id} value={p.id}>{p.name}{p.country ? `, ${p.country}` : ''}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Discharge Port</Label>
                <Select value={blForm.dischargePortId || ''} onValueChange={(v) => setBlForm({...blForm, dischargePortId: v})}>
                  <SelectTrigger><SelectValue placeholder="Select port" /></SelectTrigger>
                  <SelectContent>{ports.sort((a, b) => a.name.localeCompare(b.name)).map(p => <SelectItem key={p.id} value={p.id}>{p.name}{p.country ? `, ${p.country}` : ''}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Seller Surveyor</Label>
                <Select value={blForm.sellerSurveyor || '_custom'} onValueChange={(v) => setBlForm({...blForm, sellerSurveyor: v === '_custom' ? '' : v})}>
                  <SelectTrigger><SelectValue placeholder="Select surveyor" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_custom">Custom...</SelectItem>
                    {surveyors.sort((a, b) => a.name.localeCompare(b.name)).map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {(!blForm.sellerSurveyor || !surveyors.some(s => s.name === blForm.sellerSurveyor)) && (
                  <Input value={blForm.sellerSurveyor || ''} onChange={(e) => setBlForm({...blForm, sellerSurveyor: e.target.value})} placeholder="Type surveyor name" />
                )}
              </div>
              <div className="space-y-2">
                <Label>Buyer Surveyor</Label>
                <Select value={blForm.buyerSurveyor || 'N/A'} onValueChange={(v) => setBlForm({...blForm, buyerSurveyor: v === '_custom' ? '' : v})}>
                  <SelectTrigger><SelectValue placeholder="Select surveyor" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="N/A">N/A</SelectItem>
                    {surveyors.sort((a, b) => a.name.localeCompare(b.name)).map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
                    <SelectItem value="_custom">Custom...</SelectItem>
                  </SelectContent>
                </Select>
                {(blForm.buyerSurveyor && blForm.buyerSurveyor !== 'N/A' && !surveyors.some(s => s.name === blForm.buyerSurveyor)) && (
                  <Input value={blForm.buyerSurveyor || ''} onChange={(e) => setBlForm({...blForm, buyerSurveyor: e.target.value})} placeholder="Type surveyor name" />
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Load Port Agent</Label>
              <Select value={blForm.loadportAgent || ''} onValueChange={(v) => setBlForm({...blForm, loadportAgent: v})}>
                <SelectTrigger><SelectValue placeholder="Select load port agent" /></SelectTrigger>
                <SelectContent>
                  {loadportAgents.sort((a, b) => a.name.localeCompare(b.name)).map(a => <SelectItem key={a.id} value={a.name}>{a.name}{a.port ? ` (${a.port})` : ''}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Discharge Port Agent</Label>
              <Select value={blForm.disportAgent || ''} onValueChange={(v) => setBlForm({...blForm, disportAgent: v})}>
                <SelectTrigger><SelectValue placeholder="Select disport agent" /></SelectTrigger>
                <SelectContent>
                  {disportAgents.sort((a, b) => a.name.localeCompare(b.name)).map(a => <SelectItem key={a.id} value={a.name}>{a.name}{a.port ? ` (${a.port})` : ''}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBlDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveBlDetails} disabled={blSaving}>{blSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Save Shipment (B/L) Details</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={emailDialog.open} onOpenChange={(o) => !o && setEmailDialog({ open: false, docType: '', docLabel: '' })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Email {emailDialog.docLabel}</DialogTitle>
            <DialogDescription>Separate emails will be sent to seller and buyer. Admin users will be CC'd automatically.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Seller Email ({trade?.sellerName})</Label>
              <Input data-testid="email-seller" type="email" value={emailSellerTo} onChange={(e) => setEmailSellerTo(e.target.value)} placeholder="seller@example.com" />
            </div>
            <div className="space-y-2">
              <Label>Buyer Email ({trade?.buyerName})</Label>
              <Input data-testid="email-buyer" type="email" value={emailBuyerTo} onChange={(e) => setEmailBuyerTo(e.target.value)} placeholder="buyer@example.com" />
            </div>
            <div className="p-3 rounded-lg bg-muted/50 text-sm space-y-1">
              <p><strong>Document:</strong> {emailDialog.docLabel}</p>
              <p><strong>Trade:</strong> {trade?.referenceNumber} ({trade?.sellerContractNumber})</p>
              <p><strong>From:</strong> BA Ticaret (onboarding@resend.dev)</p>
              <p className="text-xs text-amber-600">Note: Test mode — emails can only be sent to verified addresses until domain is verified on Resend.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailDialog({ open: false, docType: '', docLabel: '' })}>Cancel</Button>
            <Button onClick={sendDocumentEmail} disabled={emailSending} data-testid="send-email-btn">
              {emailSending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Mail className="h-4 w-4 mr-1" />}Send Emails
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
