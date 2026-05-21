import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Separator } from '../components/ui/separator';
import { Ship, FileText, Loader2, Save, CheckCircle2, Circle, Mail, Pencil, X, Paperclip, Trash2, Upload, GripVertical, Send, ClipboardCheck, Anchor, ScrollText, CalendarDays, DollarSign, ArrowLeft, Eye, Filter, Search, AlertTriangle, Scale } from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';
import DocInstructionsPage from './DocInstructionsPage';
import DraftDocumentsTab from './DraftDocumentsTab';
import { Calendar } from '../components/ui/calendar';
import { toIstanbulTime } from '../lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { format, parse } from 'date-fns';
import { useParams, useNavigate } from 'react-router-dom';

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

export default function VesselExecutionPage() {
  const { tradeId: urlTradeId } = useParams();
  const navigate = useNavigate();
  const [trades, setTrades] = useState([]);
  const [allTrades, setAllTrades] = useState([]);
  const [commodities, setCommodities] = useState([]);
  const [selectedTradeId, setSelectedTradeId] = useState('');
  const [trade, setTrade] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tradeLoading, setTradeLoading] = useState(false);

  // B/L state
  const [blDialogOpen, setBlDialogOpen] = useState(false);
  const [blForm, setBlForm] = useState({});
  const [blSaving, setBlSaving] = useState(false);
  const [ports, setPorts] = useState([]);
  const [surveyors, setSurveyors] = useState([]);
  const [disportAgents, setDisportAgents] = useState([]);
  const [loadportAgents, setLoadportAgents] = useState([]);

  // Filter state
  const [veSearch, setVeSearch] = useState('');
  const [veCommodity, setVeCommodity] = useState('all');
  const [veSeller, setVeSeller] = useState('all');
  const [veBuyer, setVeBuyer] = useState('all');
  const [veOrigin, setVeOrigin] = useState('all');
  const [veVessel, setVeVessel] = useState('all');
  const [partners, setPartners] = useState([]);
  const [origins, setOrigins] = useState([]);
  // Documents state
  const [docChecks, setDocChecks] = useState({});
  const [additionalDocs, setAdditionalDocs] = useState([]);
  const [newDocInput, setNewDocInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [docFiles, setDocFiles] = useState({});
  const [uploadingDoc, setUploadingDoc] = useState(null);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [draggedFile, setDraggedFile] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);

  // Execution state
  // Vessel Nomination state
  const [vessels, setVessels] = useState([]);
  const [nominationEditing, setNominationEditing] = useState(false);
  const [nominationForm, setNominationForm] = useState({});
  const [nominationSaving, setNominationSaving] = useState(false);

  const [sendingBC, setSendingBC] = useState(false);
  const [sendingSA, setSendingSA] = useState(false);
  const [diUploading, setDiUploading] = useState(false);
  const [emailDialog, setEmailDialog] = useState({ open: false, docType: '', docLabel: '' });
  const [emailSellerTo, setEmailSellerTo] = useState('');
  const [emailBuyerTo, setEmailBuyerTo] = useState('');
  const [emailSellerCc, setEmailSellerCc] = useState([]);
  const [emailBuyerCc, setEmailBuyerCc] = useState([]);
  const [emailPirEmails, setEmailPirEmails] = useState([]);
  const [emailExtraSeller, setEmailExtraSeller] = useState('');
  const [emailExtraBuyer, setEmailExtraBuyer] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [ciDialog, setCiDialog] = useState(false);
  const [ciTo, setCiTo] = useState('');
  const [ciCc, setCiCc] = useState([]);
  const [ciExtraCc, setCiExtraCc] = useState('');
  const [buyerPaymentSaving, setBuyerPaymentSaving] = useState(false);
  const [swiftUploading, setSwiftUploading] = useState(false);
  const [shortageDocUploading, setShortageDocUploading] = useState(false);
  const [shortageInvUploading, setShortageInvUploading] = useState(false);
  const [shortagePaySaving, setShortagePaySaving] = useState(false);

  // DI documents state
  const [diDocNames, setDiDocNames] = useState([]);

  useEffect(() => {
    const fetchInitial = async () => {
      try {
        const [trRes, comRes, portRes, surRes, daRes, laRes, vesRes, partRes, origRes] = await Promise.all([
          api.get('/api/trades'),
          api.get('/api/commodities'),
          api.get('/api/ports'),
          api.get('/api/surveyors'),
          api.get('/api/disport-agents'),
          api.get('/api/loadport-agents'),
          api.get('/api/vessels'),
          api.get('/api/partners'),
          api.get('/api/origins'),
        ]);
        setTrades(trRes.data.filter(t => t.vesselName));
        setAllTrades(trRes.data);
        setCommodities(comRes.data);
        setPorts(portRes.data);
        setSurveyors(surRes.data);
        setDisportAgents(daRes.data);
        setLoadportAgents(laRes.data);
        setVessels(vesRes.data);
        setPartners(partRes.data);
        setOrigins(origRes.data);
        // Auto-select trade from URL
        if (urlTradeId) {
          setSelectedTradeId(urlTradeId);
          fetchTrade(urlTradeId);
        }
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    fetchInitial();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlTradeId]);

  const fetchTrade = async (tradeId) => {
    if (!tradeId) { setTrade(null); return; }
    setTradeLoading(true);
    try {
      const res = await api.get(`/api/trades/${tradeId}`);
      setTrade(res.data);
      // Sync key fields back to the table list
      setTrades(prev => prev.map(t => t.id === tradeId ? { ...t, loadingPortId: res.data.loadingPortId } : t));
      setDocChecks(res.data.docChecks || {});
      setAdditionalDocs(res.data.additionalDocuments || []);
      // Fetch DI document names for this trade
      try {
        const diRes = await api.get(`/api/doc-instructions/?tradeId=${tradeId}`);
        const dis = diRes.data || [];
        if (dis.length > 0 && Array.isArray(dis[0].requiredDocuments) && dis[0].requiredDocuments.length > 0) {
          setDiDocNames(dis[0].requiredDocuments.map(d => d.name));
        } else {
          setDiDocNames([]);
        }
      } catch { setDiDocNames([]); }
      const filesRes = await api.get(`/api/documents?tradeId=${tradeId}`);
      const fileMap = {};
      (filesRes.data || []).forEach(f => {
        if (f.docName) {
          if (!fileMap[f.docName]) fileMap[f.docName] = [];
          fileMap[f.docName].push(f);
        }
      });
      setDocFiles(fileMap);
    } catch { toast.error('Failed to load contract'); }
    finally { setTradeLoading(false); }
  };

  const handleTradeSelect = (tradeId) => {
    navigate(`/documents/${tradeId}`);
  };

  const renderCommodity = (t) => {
    const name = t.commodityName || '-';
    const words = name.split(/\s+/);
    if (words.length > 4) {
      const mid = Math.ceil(words.length / 2);
      return <><div>{words.slice(0, mid).join(' ')}</div><div>{words.slice(mid).join(' ')}</div></>;
    }
    return name;
  };

  const renderVessel = (name) => {
    if (!name) return '-';
    if (name.length > 18 && name.startsWith('MV ')) {
      const parts = name.slice(3).split(/\s+/);
      return <><div>MV {parts[0]}</div><div>{parts.slice(1).join(' ')}</div></>;
    }
    return name;
  };

  // Filter logic
  const applyVeFilter = (list) => {
    let r = list;
    if (veSearch) {
      const q = veSearch.toLowerCase();
      r = r.filter(t => (t.pirContractNumber || '').toLowerCase().includes(q) || (t.commodityName || '').toLowerCase().includes(q) || (t.vesselName || '').toLowerCase().includes(q) || (t.sellerName || '').toLowerCase().includes(q) || (t.buyerName || '').toLowerCase().includes(q));
    }
    if (veCommodity !== 'all') r = r.filter(t => t.commodityId === veCommodity);
    if (veSeller !== 'all') r = r.filter(t => t.sellerId === veSeller);
    if (veBuyer !== 'all') r = r.filter(t => t.buyerId === veBuyer);
    if (veOrigin !== 'all') r = r.filter(t => t.originId === veOrigin);
    if (veVessel !== 'all') r = r.filter(t => t.vesselId === veVessel);
    return r;
  };

  const filteredTrades = useMemo(() => applyVeFilter(trades), [trades, veSearch, veCommodity, veSeller, veBuyer, veOrigin, veVessel]);
  const filteredAllTrades = useMemo(() => applyVeFilter(allTrades), [allTrades, veSearch, veCommodity, veSeller, veBuyer, veOrigin, veVessel]);
  const hasVeFilters = veSearch || veCommodity !== 'all' || veSeller !== 'all' || veBuyer !== 'all' || veOrigin !== 'all' || veVessel !== 'all';

  // Unified brokerage check: uses invoicePaid field (consistent with CommissionsPage & TradesPage)
  const isAwaitingBrokerage = (t) =>
    ['completed', 'brokerage'].includes(t.status) &&
    !t.invoicePaid &&
    (t.brokerName || (t.brokeragePerMT && t.brokeragePerMT > 0));
  const isEffectivelyCompleted = (t) =>
    ['completed', 'brokerage'].includes(t.status) && !isAwaitingBrokerage(t);


  const getTradeLabel = (t) => {
    const num = t.pirContractNumber || t.contractNumber || '';
    const qty = t.quantity ? Number(t.quantity).toLocaleString('en-US') : '';
    const origin = t.originAdjective || t.originName || '';
    const commodity = t.commodityName || '';
    const seller = t.sellerCode || t.sellerName || '';
    const buyer = t.buyerCode || t.buyerName || '';
    const vessel = t.vesselName || '';
    const parts = [num];
    if (qty || commodity) parts.push(`${qty} Mts ${origin} ${commodity}`.trim());
    if (seller || buyer) parts.push(`${seller} / ${buyer}`.trim());
    if (vessel) parts.push(vessel);
    return parts.filter(Boolean).join(' - ');
  };

  // --- B/L Functions ---
  const openBlDialog = () => {
    if (!trade) return;
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
      const res = await api.put(`/api/trades/${selectedTradeId}`, data);
      setTrade(res.data);
      toast.success('B/L Details saved');
      setBlDialogOpen(false);
    } catch { toast.error('Failed to save B/L details'); }
    finally { setBlSaving(false); }
  };

  // --- Documents Functions ---
  const saveDocChecks = async () => {
    setSaving(true);
    try {
      await api.put(`/api/trades/${selectedTradeId}`, { docChecks, additionalDocuments: additionalDocs });
      toast.success('Document checklist saved');
    } catch { toast.error('Failed to save'); }
    finally { setSaving(false); }
  };

  const toggleDoc = (doc) => setDocChecks(prev => ({ ...prev, [doc]: !prev[doc] }));

  const uploadDocFile = async (docName, file) => {
    if (!file) return;
    setUploadingDoc(docName);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('tradeId', selectedTradeId);
      formData.append('tradeRef', trade?.referenceNumber || '');
      formData.append('docType', 'checklist');
      formData.append('docName', docName);
      const res = await api.post('/api/documents', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setDocFiles(prev => ({ ...prev, [docName]: [...(prev[docName] || []), res.data] }));
      toast.success(`File uploaded for ${docName}`);
    } catch { toast.error('Upload failed'); }
    finally { setUploadingDoc(null); }
  };

  const deleteDocFile = async (docName, fileId) => {
    try {
      await api.delete(`/api/documents/${fileId}`);
      setDocFiles(prev => ({ ...prev, [docName]: (prev[docName] || []).filter(f => f.id !== fileId) }));
      toast.success('File removed');
    } catch { toast.error('Delete failed'); }
  };

  const viewShipmentDoc = async (fileUrl) => {
    try {
      const res = await api.get(fileUrl, { responseType: 'blob' });
      const contentType = res.headers['content-type'] || 'application/octet-stream';
      const blob = new Blob([res.data], { type: contentType });
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch { toast.error('Failed to open document'); }
  };

  const bulkUploadFiles = async (files) => {
    if (!files || files.length === 0) return;
    setBulkUploading(true);
    let count = 0;
    for (const file of files) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('tradeId', selectedTradeId);
        formData.append('tradeRef', trade?.referenceNumber || '');
        formData.append('docType', 'checklist');
        formData.append('docName', '_unassigned');
        const res = await api.post('/api/documents', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
        setDocFiles(prev => ({ ...prev, _unassigned: [...(prev._unassigned || []), res.data] }));
        count++;
      } catch { /* skip */ }
    }
    setBulkUploading(false);
    if (count > 0) toast.success(`${count} file(s) uploaded`);
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

  const handleDragStart = (file, fromDoc) => setDraggedFile({ file, fromDoc });
  const handleDragOver = (e, docName) => { e.preventDefault(); setDropTarget(docName); };
  const handleDragLeave = () => setDropTarget(null);
  const handleDrop = (e, toDoc) => {
    e.preventDefault();
    setDropTarget(null);
    if (draggedFile && draggedFile.fromDoc !== toDoc) reassignFile(draggedFile.file, draggedFile.fromDoc, toDoc);
    setDraggedFile(null);
  };

  const addCustomDoc = () => {
    const name = newDocInput.trim();
    if (!name) return;
    if (additionalDocs.includes(name)) { toast.error('Already exists'); return; }
    setAdditionalDocs(prev => [...prev, name]);
    setNewDocInput('');
  };

  const removeAdditionalDoc = (doc) => {
    setAdditionalDocs(prev => prev.filter(d => d !== doc));
    setDocChecks(prev => { const next = { ...prev }; delete next[doc]; return next; });
  };

  // --- Execution Functions ---
  const sendBusinessConfirmation = async () => {
    setSendingBC(true);
    try {
      const res = await api.get(`/api/business-confirmation/${selectedTradeId}/pdf`, { responseType: 'blob' });
      window.open(window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' })), '_blank');
      await api.put(`/api/trades/${selectedTradeId}`, {
        businessConfirmationSentBy: trade.executionHandledBy || 'Admin',
        businessConfirmationSentAt: new Date().toISOString(),
      });
      setTrade(prev => ({ ...prev, businessConfirmationSentBy: prev.executionHandledBy || 'Admin', businessConfirmationSentAt: new Date().toISOString() }));
      toast.success('Business Confirmation generated');
    } catch { toast.error('Failed to generate'); }
    finally { setSendingBC(false); }
  };

  const reverseBusinessConfirmation = async () => {
    setSendingBC(true);
    try {
      await api.put(`/api/trades/${selectedTradeId}`, { businessConfirmationSentBy: null, businessConfirmationSentAt: null });
      setTrade(prev => ({ ...prev, businessConfirmationSentBy: null, businessConfirmationSentAt: null }));
      toast.success('Business Confirmation reversed');
    } catch { toast.error('Failed to reverse'); }
    finally { setSendingBC(false); }
  };

  const sendShipmentAppropriation = async () => {
    setSendingSA(true);
    try {
      const res = await api.get(`/api/shipment-appropriation/${selectedTradeId}/pdf`, { responseType: 'blob' });
      window.open(window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' })), '_blank');
      await api.put(`/api/trades/${selectedTradeId}`, {
        shipmentAppropriationSentBy: trade.executionHandledBy || 'Admin',
        shipmentAppropriationSentAt: new Date().toISOString(),
      });
      setTrade(prev => ({ ...prev, shipmentAppropriationSentBy: prev.executionHandledBy || 'Admin', shipmentAppropriationSentAt: new Date().toISOString() }));
      toast.success('Shipment Appropriation generated');
    } catch { toast.error('Failed to generate'); }
    finally { setSendingSA(false); }
  };

  const reverseShipmentAppropriation = async () => {
    setSendingSA(true);
    try {
      await api.put(`/api/trades/${selectedTradeId}`, { shipmentAppropriationSentBy: null, shipmentAppropriationSentAt: null });
      setTrade(prev => ({ ...prev, shipmentAppropriationSentBy: null, shipmentAppropriationSentAt: null }));
      toast.success('Shipment Appropriation reversed');
    } catch { toast.error('Failed to reverse'); }
    finally { setSendingSA(false); }
  };

  const toggleDiReceived = async (val) => {
    try {
      const res = await api.put(`/api/trades/${selectedTradeId}`, { diReceived: val });
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
      await api.post(`/api/trades/${selectedTradeId}/upload-di`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      const res = await api.get(`/api/trades/${selectedTradeId}`);
      setTrade(res.data);
      toast.success('DI document uploaded');
    } catch (err) { toast.error(err.response?.data?.detail || 'Upload failed'); }
    finally { setDiUploading(false); }
  };

  const openEmailDialog = async (docType, docLabel) => {
    setEmailDialog({ open: true, docType, docLabel });
    setEmailExtraSeller('');
    setEmailExtraBuyer('');
    try {
      const res = await api.get(`/api/email-prefill/${selectedTradeId}`);
      const d = res.data;
      setEmailSellerTo(d.sellerEmails?.[0] || '');
      setEmailBuyerTo(d.buyerEmails?.[0] || '');
      setEmailPirEmails(d.pirEmails || []);
      // CC = other seller/buyer emails + all BA emails
      const sellerExtraEmails = (d.sellerEmails || []).slice(1);
      const buyerExtraEmails = (d.buyerEmails || []).slice(1);
      setEmailSellerCc([...sellerExtraEmails, ...(d.pirEmails || [])]);
      setEmailBuyerCc([...buyerExtraEmails, ...(d.pirEmails || [])]);
    } catch {
      setEmailSellerTo('');
      setEmailBuyerTo('');
      setEmailPirEmails([]);
      setEmailSellerCc([]);
      setEmailBuyerCc([]);
    }
  };

  const sendDocumentEmail = async () => {
    if (!emailSellerTo && !emailBuyerTo) { toast.error('Enter at least one email'); return; }
    const extraSellerArr = emailExtraSeller.split(',').map(e => e.trim()).filter(Boolean);
    const extraBuyerArr = emailExtraBuyer.split(',').map(e => e.trim()).filter(Boolean);
    setEmailSending(true);
    try {
      await api.post('/api/send-document-email', {
        trade_id: selectedTradeId,
        doc_type: emailDialog.docType,
        seller_email: emailSellerTo,
        buyer_email: emailBuyerTo,
        seller_cc: [...emailSellerCc, ...extraSellerArr],
        buyer_cc: [...emailBuyerCc, ...extraBuyerArr],
      });
      toast.success(`${emailDialog.docLabel} sent`);
      setEmailDialog({ open: false, docType: '', docLabel: '' });
      fetchTrade(selectedTradeId);
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to send'); }
    finally { setEmailSending(false); }
  };

  const openCiDialog = async () => {
    setCiDialog(true);
    setCiExtraCc('');
    try {
      const res = await api.get(`/api/email-prefill/${selectedTradeId}`);
      const d = res.data;
      const brokAcct = trade?.brokerageAccount || 'seller';
      if (brokAcct === 'buyer') {
        setCiTo(d.buyerEmails?.[0] || '');
        setCiCc([...(d.buyerEmails || []).slice(1), ...(d.pirEmails || [])]);
      } else {
        setCiTo(d.sellerEmails?.[0] || '');
        setCiCc([...(d.sellerEmails || []).slice(1), ...(d.pirEmails || [])]);
      }
    } catch {
      setCiTo('');
      setCiCc([]);
    }
  };

  const sendCommissionInvoice = async () => {
    if (!ciTo) { toast.error('Enter a recipient email'); return; }
    const extraArr = ciExtraCc.split(',').map(e => e.trim()).filter(Boolean);
    setEmailSending(true);
    try {
      await api.post('/api/commission-invoice/send-email', {
        tradeId: trade.id,
        toEmail: ciTo,
        ccEmails: [...ciCc, ...extraArr],
      });
      await api.put(`/api/trades/${trade.id}`, {
        commissionInvoiceSentBy: trade.executionHandledBy || 'Admin',
        commissionInvoiceSentAt: new Date().toISOString(),
      });
      setTrade(prev => ({ ...prev, commissionInvoiceSentBy: prev.executionHandledBy || 'Admin', commissionInvoiceSentAt: new Date().toISOString() }));
      toast.success('Commission invoice sent');
      setCiDialog(false);
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to send'); }
    finally { setEmailSending(false); }
  };

  const saveBuyerPaymentDate = async (dateStr) => {
    setBuyerPaymentSaving(true);
    try {
      const res = await api.post(`/api/trades/${selectedTradeId}/buyer-payment`, { paymentDate: dateStr });
      setTrade(res.data);
      if (dateStr) {
        toast.success('Payment date saved — contract completed & commission invoice generated');
      } else {
        toast.success('Payment date cleared — contract reverted');
      }
    } catch { toast.error('Failed to save payment date'); }
    finally { setBuyerPaymentSaving(false); }
  };

  const uploadSwiftCopy = async (file) => {
    if (!file) return;
    setSwiftUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post(`/api/trades/${selectedTradeId}/upload-swift`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setTrade(res.data);
      toast.success('Payment / SWIFT copy uploaded');
    } catch { toast.error('Failed to upload SWIFT copy'); }
    finally { setSwiftUploading(false); }
  };

  const viewSwiftCopy = async () => {
    try {
      const res = await api.get(`/api/trades/${selectedTradeId}/download-swift`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      window.open(url, '_blank');
    } catch { toast.error('Failed to open SWIFT copy'); }
  };

  const deleteSwiftCopy = async () => {
    try {
      await api.delete(`/api/trades/${selectedTradeId}/upload-swift`);
      const res = await api.get(`/api/trades/${selectedTradeId}`);
      setTrade(res.data);
      toast.success('SWIFT copy removed');
    } catch { toast.error('Failed to remove SWIFT copy'); }
  };

  // --- Shortage Document/Invoice Functions ---
  const uploadShortageDoc = async (file) => {
    if (!file) return;
    setShortageDocUploading(true);
    try {
      const fd = new FormData(); fd.append('file', file);
      const res = await api.post(`/api/trades/${selectedTradeId}/upload-shortage-doc`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setTrade(res.data); toast.success('Shortage document uploaded');
    } catch { toast.error('Failed to upload shortage document'); }
    finally { setShortageDocUploading(false); }
  };
  const viewShortageDoc = async () => {
    try {
      const res = await api.get(`/api/trades/${selectedTradeId}/download-shortage-doc`, { responseType: 'blob' });
      window.open(window.URL.createObjectURL(new Blob([res.data])), '_blank');
    } catch { toast.error('Failed to open shortage document'); }
  };
  const deleteShortageDoc = async () => {
    try {
      await api.delete(`/api/trades/${selectedTradeId}/upload-shortage-doc`);
      const res = await api.get(`/api/trades/${selectedTradeId}`);
      setTrade(res.data); toast.success('Shortage document removed');
    } catch { toast.error('Failed to remove shortage document'); }
  };

  const uploadShortageInv = async (file) => {
    if (!file) return;
    setShortageInvUploading(true);
    try {
      const fd = new FormData(); fd.append('file', file);
      const res = await api.post(`/api/trades/${selectedTradeId}/upload-shortage-invoice`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setTrade(res.data); toast.success('Shortage invoice uploaded');
    } catch { toast.error('Failed to upload shortage invoice'); }
    finally { setShortageInvUploading(false); }
  };
  const viewShortageInv = async () => {
    try {
      const res = await api.get(`/api/trades/${selectedTradeId}/download-shortage-invoice`, { responseType: 'blob' });
      window.open(window.URL.createObjectURL(new Blob([res.data])), '_blank');
    } catch { toast.error('Failed to open shortage invoice'); }
  };
  const deleteShortageInv = async () => {
    try {
      await api.delete(`/api/trades/${selectedTradeId}/upload-shortage-invoice`);
      const res = await api.get(`/api/trades/${selectedTradeId}`);
      setTrade(res.data); toast.success('Shortage invoice removed');
    } catch { toast.error('Failed to remove shortage invoice'); }
  };

  const saveShortagePaymentDate = async (dateStr) => {
    setShortagePaySaving(true);
    try {
      const res = await api.put(`/api/trades/${selectedTradeId}/shortage-payment-date`, { shortagePaymentDate: dateStr });
      setTrade(res.data); toast.success('Shortage payment date saved');
    } catch { toast.error('Failed to save shortage payment date'); }
    finally { setShortagePaySaving(false); }
  };

  // --- Vessel Nomination Functions ---
  const startNominationEdit = () => {
    setNominationForm({
      vesselName: trade.vesselName || '',
      loadingPortId: trade.loadingPortId || trade.basePortId || '',
      sellerSurveyor: trade.sellerSurveyor || '',
      loadportAgent: trade.loadportAgent || '',
    });
    setNominationEditing(true);
  };

  const saveNomination = async () => {
    setNominationSaving(true);
    try {
      const res = await api.put(`/api/trades/${selectedTradeId}`, {
        vesselName: nominationForm.vesselName,
        loadingPortId: nominationForm.loadingPortId,
        sellerSurveyor: nominationForm.sellerSurveyor,
        loadportAgent: nominationForm.loadportAgent,
      });
      setTrade(res.data);
      setTrades(prev => prev.map(t => t.id === selectedTradeId ? { ...t, vesselName: nominationForm.vesselName, loadingPortId: nominationForm.loadingPortId } : t));
      toast.success('Vessel nomination details saved');
      setNominationEditing(false);
    } catch { toast.error('Failed to save nomination details'); }
    finally { setNominationSaving(false); }
  };

  const cancelNominationEdit = () => {
    setNominationEditing(false);
    setNominationForm({});
  };

  // Computed
  const commodity = trade ? commodities.find(c => c.id === trade.commodityId) : null;
  const getPortDisplay = (portId) => {
    const p = ports.find(x => x.id === portId);
    return p ? `${p.name}, ${p.country}` : '-';
  };
  const docList = diDocNames.length > 0 ? diDocNames : getDocChecklist(commodity);
  const allDocs = [...docList, ...additionalDocs];
  const completedDocs = allDocs.filter(d => docChecks[d]).length;

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4" data-testid="vessel-execution-page">
      {!urlTradeId && <div></div>}

      {/* Filters */}
      {!urlTradeId && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search..." className="pl-9 h-8 text-sm" value={veSearch} onChange={e => setVeSearch(e.target.value)} data-testid="ve-search" />
          </div>
          <Select value={veCommodity} onValueChange={setVeCommodity}><SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue placeholder="Commodity" /></SelectTrigger><SelectContent>{[{id:'all',name:'All Commodities'},...commodities].map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>
          <Select value={veSeller} onValueChange={setVeSeller}><SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue placeholder="Seller" /></SelectTrigger><SelectContent>{[{id:'all',companyName:'All Sellers'},...partners.filter(p => (Array.isArray(p.type) ? p.type : [p.type]).includes('seller'))].map(p => <SelectItem key={p.id} value={p.id}>{p.companyName}</SelectItem>)}</SelectContent></Select>
          <Select value={veBuyer} onValueChange={setVeBuyer}><SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue placeholder="Buyer" /></SelectTrigger><SelectContent>{[{id:'all',companyName:'All Buyers'},...partners.filter(p => (Array.isArray(p.type) ? p.type : [p.type]).includes('buyer'))].map(p => <SelectItem key={p.id} value={p.id}>{p.companyName}</SelectItem>)}</SelectContent></Select>
          <Select value={veOrigin} onValueChange={setVeOrigin}><SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue placeholder="Origin" /></SelectTrigger><SelectContent>{[{id:'all',name:'All Origins'},...origins].map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent></Select>
          <Select value={veVessel} onValueChange={setVeVessel}><SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue placeholder="Vessel" /></SelectTrigger><SelectContent>{[{id:'all',name:'All Vessels'},...vessels].map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent></Select>
          {hasVeFilters && <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setVeSearch(''); setVeCommodity('all'); setVeSeller('all'); setVeBuyer('all'); setVeOrigin('all'); setVeVessel('all'); }}><X className="h-3 w-3 mr-1" />Clear</Button>}
        </div>
      )}

      {urlTradeId && trade && (
        <div className="flex items-center">
          <Button variant="ghost" size="sm" onClick={() => navigate('/documents')} data-testid="back-to-list" className="shrink-0">
            <ArrowLeft className="h-4 w-4 mr-1" />Back
          </Button>
          <div className="flex-1 flex items-center justify-center gap-2 pr-16">
            <Ship className="h-5 w-5 text-[#1A5276] dark:text-blue-300 flex-shrink-0" />
            <h1 className="text-lg font-bold text-[#1A5276] dark:text-blue-300">
              {trade.pirContractNumber || trade.contractNumber} - {trade.quantity ? `${Number(trade.quantity).toLocaleString()} Mts ` : ''}{trade.commodityName || ''} - {trade.vesselName || 'No Vessel'} ({trade.sellerCode || trade.sellerName || '-'} → {trade.buyerCode || trade.buyerName || '-'})
            </h1>
            {(() => {
              const s = trade.status;
              if (['completed','brokerage'].includes(s)) return <span className="ml-2 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-200 text-gray-700">COMPLETED</span>;
              if (['pending','draft','open'].includes(s) || !trade.vesselName) return <span className="ml-2 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800">PENDING</span>;
              return <span className="ml-2 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">ONGOING</span>;
            })()}
          </div>
        </div>
      )}

      {/* Contracts Tables - only show when no trade selected via URL */}
      {!urlTradeId && (<>

      {/* Ongoing Contracts Table */}
      {filteredTrades.filter(t => t.vesselName && !['completed','cancelled','washout','brokerage'].includes(t.status)).length > 0 && (
      <div>
        <h2 className="text-sm font-semibold text-[#1A5276] dark:text-blue-300 mb-1.5">Ongoing Contracts ({filteredTrades.filter(t => t.vesselName && !['completed','cancelled','washout','brokerage'].includes(t.status)).length})</h2>
        <div className="border border-[#1A5276]/30 dark:border-blue-900/50 rounded-lg overflow-hidden [&_th]:border [&_th]:border-muted [&_td]:border [&_td]:border-muted">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#1A5276]/10 dark:bg-blue-900/40 border-b border-[#1A5276]/30 dark:border-blue-900/50">
                <th className="text-center px-4 py-2.5 font-bold text-[#1A5276]">Contract No</th>
                <th className="text-center px-4 py-2.5 font-bold text-[#1A5276]">Commodity</th>
                <th className="text-center px-4 py-2.5 font-bold text-[#1A5276]">Seller</th>
                <th className="text-center px-4 py-2.5 font-bold text-[#1A5276]">Buyer</th>
                <th className="text-center px-4 py-2.5 font-bold text-[#1A5276]">Origin</th>
                <th className="text-center px-4 py-2.5 font-bold text-[#1A5276]">Quantity</th>
                <th className="text-center px-4 py-2.5 font-bold text-[#1A5276]">Loading Port</th>
                <th className="text-center px-4 py-2.5 font-bold text-[#1A5276]">Discharge Port</th>
                <th className="text-center px-4 py-2.5 font-bold text-[#1A5276]">Vessel</th>
              </tr>
            </thead>
            <tbody>
              {filteredTrades.filter(t => t.vesselName && !['completed','cancelled','washout','brokerage'].includes(t.status)).map(t => (
                <tr
                  key={t.id}
                  onClick={() => handleTradeSelect(t.id)}
                  className={`border-b border-[#1A5276]/10 dark:border-blue-900/30 cursor-pointer transition-colors hover:bg-[#1A5276]/5 dark:hover:bg-blue-900/10 ${selectedTradeId === t.id ? 'bg-[#1A5276]/10 dark:bg-blue-900/30 border-l-4 border-l-[#1A5276]' : ''}`}
                  data-testid={`ve-contract-row-${t.id}`}
                >
                  <td className="px-4 py-2.5 font-medium text-center">{t.pirContractNumber || t.contractNumber || t.referenceNumber || '-'}</td>
                  <td className="px-4 py-2.5 text-center">{renderCommodity(t)}</td>
                  <td className="px-4 py-2.5 text-center">{t.sellerCode || t.sellerName || '-'}</td>
                  <td className="px-4 py-2.5 text-center">{t.buyerCode || t.buyerName || '-'}</td>
                  <td className="px-4 py-2.5 text-center">{t.originName || '-'}</td>
                  <td className="px-4 py-2.5 text-center">{(t.blQuantity ? `${Number(t.blQuantity).toLocaleString('en-US')} MT` : t.quantity ? `${Number(t.quantity).toLocaleString('en-US')} MT` : '-')}</td>
                  <td className="px-4 py-2.5 text-center">{getPortDisplay(t.loadingPortId || t.basePortId)}</td>
                  <td className="px-4 py-2.5 text-center">{getPortDisplay(t.dischargePortId)}</td>
                  <td className="px-4 py-2.5 font-medium uppercase text-center">{renderVessel(t.vesselName)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* Pending Vessel Nomination - between Ongoing and Completed */}
      {filteredAllTrades.filter(t => !t.vesselName && !['completed','cancelled','washout','brokerage'].includes(t.status)).length > 0 && (
      <div>
        <h2 className="text-sm font-semibold text-amber-600 dark:text-amber-400 mb-1.5">Pending Vessel Nomination ({filteredAllTrades.filter(t => !t.vesselName && !['completed','cancelled','washout','brokerage'].includes(t.status)).length})</h2>
        <div className="border border-amber-200 dark:border-amber-900/50 rounded-lg overflow-hidden [&_th]:border [&_th]:border-muted [&_td]:border [&_td]:border-muted">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-amber-100 dark:bg-amber-900/40 border-b border-amber-200 dark:border-amber-900/50">
                <th className="text-center px-4 py-2.5 font-bold text-[#1A5276]">Contract No</th>
                <th className="text-center px-4 py-2.5 font-bold text-[#1A5276]">Commodity</th>
                <th className="text-center px-4 py-2.5 font-bold text-[#1A5276]">Seller</th>
                <th className="text-center px-4 py-2.5 font-bold text-[#1A5276]">Buyer</th>
                <th className="text-center px-4 py-2.5 font-bold text-[#1A5276]">Origin</th>
                <th className="text-center px-4 py-2.5 font-bold text-[#1A5276]">Quantity</th>
                <th className="text-center px-4 py-2.5 font-bold text-[#1A5276]">Loading Port</th>
                <th className="text-center px-4 py-2.5 font-bold text-[#1A5276]">Discharge Port</th>
                <th className="text-center px-4 py-2.5 font-bold text-[#1A5276]">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredAllTrades.filter(t => !t.vesselName && !['completed','cancelled','washout','brokerage'].includes(t.status)).map(t => (
                <tr
                  key={t.id}
                  onClick={() => handleTradeSelect(t.id)}
                  className="border-b border-amber-100 dark:border-amber-900/30 cursor-pointer transition-colors hover:bg-amber-50/50 dark:hover:bg-amber-900/10"
                  data-testid={`ve-pending-row-${t.id}`}
                >
                  <td className="px-4 py-2.5 font-medium text-center">{t.pirContractNumber || t.contractNumber || t.referenceNumber || '-'}</td>
                  <td className="px-4 py-2.5 text-center">{renderCommodity(t)}</td>
                  <td className="px-4 py-2.5 text-center">{t.sellerCode || t.sellerName || '-'}</td>
                  <td className="px-4 py-2.5 text-center">{t.buyerCode || t.buyerName || '-'}</td>
                  <td className="px-4 py-2.5 text-center">{t.originName || '-'}</td>
                  <td className="px-4 py-2.5 text-center">{(t.blQuantity ? `${Number(t.blQuantity).toLocaleString('en-US')} MT` : t.quantity ? `${Number(t.quantity).toLocaleString('en-US')} MT` : '-')}</td>
                  <td className="px-4 py-2.5 text-center">{getPortDisplay(t.loadingPortId || t.basePortId)}</td>
                  <td className="px-4 py-2.5 text-center">{getPortDisplay(t.dischargePortId)}</td>
                  <td className="px-4 py-2.5 text-center"><span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">Awaiting Vessel</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}


      {/* Awaiting Brokerage Payment */}
      {filteredTrades.filter(t => t.vesselName && isAwaitingBrokerage(t)).length > 0 && (
      <div>
        <h2 className="text-sm font-semibold text-orange-600 dark:text-orange-400 mb-1.5">Awaiting Brokerage Payment ({filteredTrades.filter(t => t.vesselName && isAwaitingBrokerage(t)).length})</h2>
        <div className="border border-orange-200 dark:border-orange-900/30 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-orange-100 dark:bg-orange-900/40 border-b border-orange-200 dark:border-orange-900/50">
                <th className="text-center px-4 py-2.5 font-bold text-[#1A5276]">Contract No</th>
                <th className="text-center px-4 py-2.5 font-bold text-[#1A5276]">Commodity</th>
                <th className="text-center px-4 py-2.5 font-bold text-[#1A5276]">Seller</th>
                <th className="text-center px-4 py-2.5 font-bold text-[#1A5276]">Buyer</th>
                <th className="text-center px-4 py-2.5 font-bold text-[#1A5276]">Origin</th>
                <th className="text-center px-4 py-2.5 font-bold text-[#1A5276]">Quantity</th>
                <th className="text-center px-4 py-2.5 font-bold text-[#1A5276]">Loading Port</th>
                <th className="text-center px-4 py-2.5 font-bold text-[#1A5276]">Discharge Port</th>
                <th className="text-center px-4 py-2.5 font-bold text-[#1A5276]">Vessel</th>
              </tr>
            </thead>
            <tbody>
              {filteredTrades.filter(t => t.vesselName && isAwaitingBrokerage(t)).map(t => (
                <tr
                  key={t.id}
                  onClick={() => handleTradeSelect(t.id)}
                  className={`border-b border-orange-100 dark:border-orange-900/30 cursor-pointer transition-colors hover:bg-orange-50/50 dark:hover:bg-orange-900/10 ${selectedTradeId === t.id ? 'bg-orange-100 dark:bg-orange-900/30 border-l-4 border-l-orange-600' : ''}`}
                  data-testid={`ve-brokerage-row-${t.id}`}
                >
                  <td className="px-4 py-2.5 font-medium text-center">{t.pirContractNumber || t.contractNumber || t.referenceNumber || '-'}</td>
                  <td className="px-4 py-2.5 text-center">{renderCommodity(t)}</td>
                  <td className="px-4 py-2.5 text-center">{t.sellerCode || t.sellerName || '-'}</td>
                  <td className="px-4 py-2.5 text-center">{t.buyerCode || t.buyerName || '-'}</td>
                  <td className="px-4 py-2.5 text-center">{t.originName || '-'}</td>
                  <td className="px-4 py-2.5 text-center">{(t.blQuantity ? `${Number(t.blQuantity).toLocaleString('en-US')} MT` : t.quantity ? `${Number(t.quantity).toLocaleString('en-US')} MT` : '-')}</td>
                  <td className="px-4 py-2.5 text-center">{getPortDisplay(t.loadingPortId || t.basePortId)}</td>
                  <td className="px-4 py-2.5 text-center">{getPortDisplay(t.dischargePortId)}</td>
                  <td className="px-4 py-2.5 font-medium uppercase text-center">{renderVessel(t.vesselName)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* Completed Contracts Table */}
      {filteredTrades.filter(t => t.vesselName && isEffectivelyCompleted(t)).length > 0 && (
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground mb-1.5">Completed Contracts ({filteredTrades.filter(t => t.vesselName && isEffectivelyCompleted(t)).length})</h2>
        <div className="border border-border rounded-lg overflow-hidden opacity-75">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted border-b">
                <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">Contract No</th>
                <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">Commodity</th>
                <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">Seller</th>
                <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">Buyer</th>
                <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">Origin</th>
                <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">Quantity</th>
                <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">Loading Port</th>
                <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">Discharge Port</th>
                <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">Vessel</th>
              </tr>
            </thead>
            <tbody>
              {filteredTrades.filter(t => t.vesselName && isEffectivelyCompleted(t)).map(t => (
                <tr
                  key={t.id}
                  onClick={() => handleTradeSelect(t.id)}
                  className={`border-b cursor-pointer transition-colors hover:bg-muted/30 text-muted-foreground ${selectedTradeId === t.id ? 'bg-muted/50 border-l-4 border-l-muted-foreground' : ''}`}
                  data-testid={`ve-contract-row-${t.id}`}
                >
                  <td className="px-4 py-2.5 font-medium text-center">{t.pirContractNumber || t.contractNumber || t.referenceNumber || '-'}</td>
                  <td className="px-4 py-2.5 text-center">{renderCommodity(t)}</td>
                  <td className="px-4 py-2.5 text-center">{t.sellerCode || t.sellerName || '-'}</td>
                  <td className="px-4 py-2.5 text-center">{t.buyerCode || t.buyerName || '-'}</td>
                  <td className="px-4 py-2.5 text-center">{t.originName || '-'}</td>
                  <td className="px-4 py-2.5 text-center">{(t.blQuantity ? `${Number(t.blQuantity).toLocaleString('en-US')} MT` : t.quantity ? `${Number(t.quantity).toLocaleString('en-US')} MT` : '-')}</td>
                  <td className="px-4 py-2.5 text-center">{getPortDisplay(t.loadingPortId || t.basePortId)}</td>
                  <td className="px-4 py-2.5 text-center">{getPortDisplay(t.dischargePortId)}</td>
                  <td className="px-4 py-2.5 font-medium uppercase text-center">{renderVessel(t.vesselName)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* Empty state when no vessel-nominated contracts exist */}
      {filteredTrades.filter(t => t.vesselName).length === 0 && filteredAllTrades.filter(t => !t.vesselName && !['completed','cancelled','washout'].includes(t.status) && !isAwaitingBrokerage(t)).length === 0 && (
        <div className="border border-dashed border-muted-foreground/30 rounded-lg p-8 text-center" data-testid="ve-empty-state">
          <Ship className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
          <h3 className="text-base font-semibold text-muted-foreground mb-1">No Vessel Nominations Yet</h3>
          <p className="text-sm text-muted-foreground/70">Contracts will appear here once a vessel has been nominated.</p>
        </div>
      )}

      </>)}

      {urlTradeId && tradeLoading && <div className="flex items-center justify-center h-32"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}

      {urlTradeId && trade && !tradeLoading && (
        <Tabs defaultValue="nomination" className="mt-2">
          <TabsList className="w-full flex h-auto [&_button[data-state=active]]:bg-[#1A5276] [&_button[data-state=active]]:text-white [&_button[data-state=active]]:shadow-sm">
            <TabsTrigger value="nomination" className="py-3 text-xs sm:text-sm flex-1"><Anchor className="h-4 w-4 mr-1.5 hidden sm:inline" />Vessel Nomination</TabsTrigger>
            <TabsTrigger value="di" className="py-3 text-xs sm:text-sm flex-1"><ScrollText className="h-4 w-4 mr-1.5 hidden sm:inline" />Documentary Instruction</TabsTrigger>
            <TabsTrigger value="draft-docs" className="py-3 text-xs sm:text-sm flex-1"><Paperclip className="h-4 w-4 mr-1.5 hidden sm:inline" />Draft Documents</TabsTrigger>
            <TabsTrigger value="bl" className="py-3 text-xs sm:text-sm flex-1"><Ship className="h-4 w-4 mr-1.5 hidden sm:inline" />B/L Details</TabsTrigger>
            <TabsTrigger value="sa" className="py-3 text-xs sm:text-sm flex-1"><Send className="h-4 w-4 mr-1.5 hidden sm:inline" />Shipment Appropriation</TabsTrigger>
            <TabsTrigger value="documents" className="py-3 text-xs sm:text-sm flex-1"><ClipboardCheck className="h-4 w-4 mr-1.5 hidden sm:inline" />Shipment Documents</TabsTrigger>
            <TabsTrigger value="payment" className="py-3 text-xs sm:text-sm flex-1"><DollarSign className="h-4 w-4 mr-1.5 hidden sm:inline" />Payment</TabsTrigger>
            <TabsTrigger value="shortage-demurrage" className="py-3 text-xs sm:text-sm flex-1"><Scale className="h-4 w-4 mr-1.5 hidden sm:inline" />Shortage & Demurrage</TabsTrigger>
          </TabsList>

          {/* B/L Details Tab */}
          <TabsContent value="bl">
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-base">Bill of Lading (B/L) Details</CardTitle>
                <Button size="sm" variant="outline" onClick={openBlDialog}><Pencil className="h-3.5 w-3.5 mr-1" />Edit B/L Details</Button>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <div className="flex justify-between"><span className="text-muted-foreground">Vessel Name</span><span className="font-medium uppercase">{trade.vesselName || '-'}</span></div>
                    <Separator />
                    <div className="flex justify-between"><span className="text-muted-foreground">B/L Number</span><span className="font-medium">{trade.blNumber || '-'}</span></div>
                    <Separator />
                    <div className="flex justify-between"><span className="text-muted-foreground">B/L Date</span><span className="font-medium">{trade.blDate || '-'}</span></div>
                    <Separator />
                    <div className="flex justify-between"><span className="text-muted-foreground">B/L Quantity</span><span className="font-medium">{trade.blQuantity ? `${Number(trade.blQuantity).toLocaleString()} MT` : '-'}</span></div>
                    <Separator />
                    <div className="flex justify-between"><span className="text-muted-foreground">Load Port</span><span className="font-medium">{getPortDisplay(trade.loadingPortId || trade.basePortId)}</span></div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between"><span className="text-muted-foreground">Load Port Agent</span><span className="font-medium">{trade.loadportAgent || '-'}</span></div>
                    <Separator />
                    <div className="flex justify-between"><span className="text-muted-foreground">Discharge Port Agent</span><span className="font-medium">{trade.disportAgent || '-'}</span></div>
                    <Separator />
                    {trade.sellerSurveyor && trade.buyerSurveyor && trade.sellerSurveyor === trade.buyerSurveyor ? (
                      <div className="flex justify-between"><span className="text-muted-foreground">Double Nomination at Load Port</span><span className="font-medium">{trade.sellerSurveyor}</span></div>
                    ) : (
                      <>
                        <div className="flex justify-between"><span className="text-muted-foreground">Seller Surveyor at Load Port</span><span className="font-medium">{trade.sellerSurveyor || '-'}</span></div>
                        <Separator />
                        <div className="flex justify-between"><span className="text-muted-foreground">Buyer Surveyor at Load Port</span><span className="font-medium">{trade.buyerSurveyor || '-'}</span></div>
                      </>
                    )}
                    <Separator />
                    <div className="flex justify-between"><span className="text-muted-foreground">Discharge Quantity</span><span className="font-medium">{trade.dischargeQuantity ? `${Number(trade.dischargeQuantity).toLocaleString()} MT` : '-'}</span></div>
                    <Separator />
                    {trade.blQuantity && trade.dischargeQuantity ? (() => {
                      const shortage = Number(trade.blQuantity) - Number(trade.dischargeQuantity);
                      const pct = ((shortage / Number(trade.blQuantity)) * 100).toFixed(3);
                      return (
                        <>
                          <div className="flex justify-between"><span className="text-muted-foreground">Shortage</span><span className={`font-medium ${shortage > 0 ? 'text-red-600' : shortage < 0 ? 'text-green-600' : ''}`}>{shortage > 0 ? '' : shortage < 0 ? '+' : ''}{Math.abs(shortage).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MT ({pct}%)</span></div>
                          <Separator />
                        </>
                      );
                    })() : null}
                    <div className="flex justify-between"><span className="text-muted-foreground">Discharge Port</span><span className="font-medium">{getPortDisplay(trade.dischargePortId)}</span></div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Documents Tab */}
          <TabsContent value="documents">
            <Card className="mb-4">
              <CardContent className="pt-5 pb-4">
                <label className="flex items-center justify-center gap-2 p-4 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary hover:bg-muted/30 transition-colors" data-testid="bulk-upload-zone">
                  {bulkUploading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : <Upload className="h-5 w-5 text-muted-foreground" />}
                  <span className="text-sm text-muted-foreground">{bulkUploading ? 'Uploading...' : 'Click to bulk upload documents, then drag to assign'}</span>
                  <input type="file" className="hidden" multiple accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx" onChange={(e) => { bulkUploadFiles(Array.from(e.target.files)); e.target.value = ''; }} />
                </label>
                {docFiles._unassigned && docFiles._unassigned.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <h4 className="text-sm font-semibold text-amber-700">Unassigned Files</h4>
                    <div className="flex flex-wrap gap-2">
                      {docFiles._unassigned.map(f => (
                        <div key={f.id} draggable onDragStart={() => handleDragStart(f, '_unassigned')} className="flex items-center gap-2 text-xs bg-amber-50 border border-amber-200 rounded px-3 py-2 cursor-grab">
                          <GripVertical className="h-3 w-3 text-amber-400" /><FileText className="h-3 w-3 text-primary" />
                          <span className="truncate max-w-[200px]">{f.fileName}</span>
                          <button onClick={() => viewShipmentDoc(f.fileUrl)} className="text-blue-500 hover:text-blue-700" title="View"><Eye className="h-3 w-3" /></button>
                          <button onClick={() => deleteDocFile('_unassigned', f.id)} className="text-red-400 hover:text-red-600 ml-1"><Trash2 className="h-3 w-3" /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base">Document Checklist</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">{completedDocs} of {allDocs.length} completed</p>
                </div>
                <Button onClick={saveDocChecks} disabled={saving} size="sm">{saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}Save</Button>
              </CardHeader>
              <CardContent>
                <div className="w-full bg-muted rounded-full h-2 mb-4">
                  <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${allDocs.length > 0 ? (completedDocs / allDocs.length) * 100 : 0}%` }} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {allDocs.map((doc, i) => (
                    <div key={i} className={`p-3 rounded-lg border hover:bg-muted/50 transition-colors ${dropTarget === doc ? 'ring-2 ring-primary bg-primary/5' : ''}`}
                      onDragOver={(e) => handleDragOver(e, doc)} onDragLeave={handleDragLeave} onDrop={(e) => handleDrop(e, doc)}>
                      <div className="flex items-center gap-3 cursor-pointer" onClick={() => toggleDoc(doc)}>
                        {docChecks[doc] ? <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" /> : <Circle className="h-5 w-5 text-muted-foreground flex-shrink-0" />}
                        <span className={docChecks[doc] ? 'line-through text-muted-foreground flex-1' : 'text-sm flex-1'}>{doc}</span>
                        <label className="cursor-pointer text-muted-foreground hover:text-primary" onClick={(e) => e.stopPropagation()}>
                          {uploadingDoc === doc ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                          <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx" onChange={(e) => { uploadDocFile(doc, e.target.files[0]); e.target.value = ''; }} />
                        </label>
                        {additionalDocs.includes(doc) && <button onClick={(e) => { e.stopPropagation(); removeAdditionalDoc(doc); }} className="text-red-400 hover:text-red-600"><X className="h-3.5 w-3.5" /></button>}
                      </div>
                      {docFiles[doc] && docFiles[doc].length > 0 && (
                        <div className="mt-2 ml-8 space-y-1">
                          {docFiles[doc].map(f => (
                            <div key={f.id} draggable onDragStart={() => handleDragStart(f, doc)} className="flex items-center gap-2 text-xs bg-muted/50 rounded px-2 py-1.5 cursor-grab">
                              <GripVertical className="h-3 w-3 text-muted-foreground" /><FileText className="h-3 w-3 text-primary" />
                              <span className="truncate max-w-[200px]">{f.fileName}</span>
                              <button onClick={(e) => { e.stopPropagation(); viewShipmentDoc(f.fileUrl); }} className="text-blue-500 hover:text-blue-700 ml-auto" title="View"><Eye className="h-3 w-3" /></button>
                              <button onClick={() => deleteDocFile(doc, f.id)} className="text-red-400 hover:text-red-600"><Trash2 className="h-3 w-3" /></button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-4">
                  <Input placeholder="Add custom document..." value={newDocInput} onChange={(e) => setNewDocInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCustomDoc()} className="max-w-xs" />
                  <Button size="sm" variant="outline" onClick={addCustomDoc}>Add</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Vessel Nomination Tab */}
          <TabsContent value="nomination">
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-base">Vessel Nomination</CardTitle>
                {!nominationEditing ? (
                  <Button size="sm" variant="outline" onClick={startNominationEdit} data-testid="edit-nomination-btn"><Pencil className="h-3.5 w-3.5 mr-1" />Edit</Button>
                ) : (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={cancelNominationEdit} data-testid="cancel-nomination-btn"><X className="h-3.5 w-3.5 mr-1" />Cancel</Button>
                    <Button size="sm" onClick={saveNomination} disabled={nominationSaving} data-testid="save-nomination-btn">
                      {nominationSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}Save
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent>
                {nominationEditing ? (
                  <div className="grid grid-cols-2 gap-4" data-testid="nomination-edit-form">
                    <div className="space-y-2">
                      <Label>Vessel Name</Label>
                      <Select value={nominationForm.vesselName || ''} onValueChange={(v) => setNominationForm(p => ({ ...p, vesselName: v }))}>
                        <SelectTrigger data-testid="nomination-vessel-select"><SelectValue placeholder="Select vessel" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="N/A">N/A</SelectItem>
                          {vessels.map(v => <SelectItem key={v.id} value={v.name}>{v.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Loading Port</Label>
                      <Select value={nominationForm.loadingPortId || ''} onValueChange={(v) => setNominationForm(p => ({ ...p, loadingPortId: v }))}>
                        <SelectTrigger data-testid="nomination-loadport-select"><SelectValue placeholder="Select loading port" /></SelectTrigger>
                        <SelectContent>{ports.filter(p => p.type === 'loading').map(p => <SelectItem key={p.id} value={p.id}>{p.name}, {p.country}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Seller Surveyor</Label>
                      <Select value={nominationForm.sellerSurveyor || ''} onValueChange={(v) => setNominationForm(p => ({ ...p, sellerSurveyor: v }))}>
                        <SelectTrigger data-testid="nomination-surveyor-select"><SelectValue placeholder="Select surveyor" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="N/A">N/A</SelectItem>
                          {surveyors.map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Load Port Agent</Label>
                      <Select value={nominationForm.loadportAgent || ''} onValueChange={(v) => setNominationForm(p => ({ ...p, loadportAgent: v }))}>
                        <SelectTrigger data-testid="nomination-agent-select"><SelectValue placeholder="Select agent" /></SelectTrigger>
                        <SelectContent>{loadportAgents.map(a => <SelectItem key={a.id} value={a.name}>{a.name}{a.port ? ` (${a.port})` : ''}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-0" data-testid="nomination-details">
                    <div className="grid grid-cols-2 gap-x-8">
                      <div className="space-y-3">
                        <div className="flex justify-between items-center py-2">
                          <span className="text-sm text-muted-foreground">Vessel</span>
                          <span className="font-semibold uppercase" data-testid="nomination-vessel-value">{trade.vesselName && trade.vesselName !== 'N/A' ? trade.vesselName : '-'}</span>
                        </div>
                        <Separator />
                        <div className="flex justify-between items-center py-2">
                          <span className="text-sm text-muted-foreground">Loading Port</span>
                          <span className="font-medium" data-testid="nomination-loadport-value">{getPortDisplay(trade.loadingPortId || trade.basePortId)}</span>
                        </div>
                      </div>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center py-2">
                          <span className="text-sm text-muted-foreground">Seller Surveyor</span>
                          <span className="font-medium" data-testid="nomination-surveyor-value">{trade.sellerSurveyor && trade.sellerSurveyor !== 'N/A' ? trade.sellerSurveyor : '-'}</span>
                        </div>
                        <Separator />
                        <div className="flex justify-between items-center py-2">
                          <span className="text-sm text-muted-foreground">Load Port Agent</span>
                          <span className="font-medium" data-testid="nomination-agent-value">{trade.loadportAgent || '-'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                <div className="mt-6 flex items-center gap-4">
                  <Button size="lg" disabled={!trade.vesselName} onClick={() => openEmailDialog('vessel_nomination', 'Vessel Nomination')} data-testid="send-nomination-btn">
                    <Send className="h-4 w-4 mr-2" />Send Nomination
                  </Button>
                  {trade.vessel_nominationSent && (
                    <p className="text-sm text-muted-foreground">
                      Sent to <strong>{trade.buyerCode || trade.buyerName || '-'}</strong> by <strong>{(trade.vessel_nominationSentBy || '-').split('.').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}</strong> on {toIstanbulTime(trade.vessel_nominationSentAt)}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Documentary Instruction Tab */}
          <TabsContent value="di">
            <Card className="mb-4">
              <CardHeader><CardTitle className="text-base">Documentary Instruction Received</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4 flex-wrap">
                  <span className="text-sm text-muted-foreground">DI Received?</span>
                  <div className="flex gap-2">
                    <Button size="sm" variant={trade.diReceived ? 'default' : 'outline'} onClick={() => toggleDiReceived(true)}>Yes</Button>
                    <Button size="sm" variant={!trade.diReceived ? 'default' : 'outline'} onClick={() => toggleDiReceived(false)}>No</Button>
                  </div>
                  {trade.diReceived && (
                    <div className="flex items-center gap-3">
                      <Input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx" className="max-w-sm" onChange={(e) => uploadDiDocument(e.target.files[0])} />
                      {diUploading && <Loader2 className="h-4 w-4 animate-spin" />}
                    </div>
                  )}
                </div>
                {trade.diReceived && trade.diDocumentFilename && (
                  <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                    <FileText className="h-5 w-5 text-primary" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{trade.diDocumentFilename}</p>
                      <p className="text-xs text-muted-foreground">Uploaded document</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={async () => {
                      try {
                        const res = await api.get(`/api/trades/${selectedTradeId}/download-di`, { responseType: 'blob' });
                        const url = window.URL.createObjectURL(new Blob([res.data]));
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = trade.diDocumentFilename || 'di_document.pdf';
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                        window.URL.revokeObjectURL(url);
                      } catch { toast.error('Failed to download'); }
                    }} data-testid="download-di-btn">Download</Button>
                    <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-600" onClick={async () => {
                      try {
                        await api.delete(`/api/trades/${selectedTradeId}/upload-di`);
                        const res = await api.get(`/api/trades/${selectedTradeId}`);
                        setTrade(res.data);
                        toast.success('DI document deleted');
                      } catch (err) { toast.error('Failed to delete'); }
                    }}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                )}
              </CardContent>
            </Card>
            <DocInstructionsPage filterTradeId={selectedTradeId} embedded />
          </TabsContent>

          {/* Draft Documents Tab */}
          <TabsContent value="draft-docs">
            <DraftDocumentsTab trade={trade} tradeId={selectedTradeId} />
          </TabsContent>

          {/* Shipment Appropriation Tab */}
          <TabsContent value="sa">
            <Card>
              <CardHeader><CardTitle className="text-base">Shipment Appropriation to Buyer</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {trade.shipmentAppropriationSentAt ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 p-4 rounded-lg border bg-green-50 border-green-200">
                      <CheckCircle2 className="h-6 w-6 text-green-600 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-green-800">Shipment Appropriation Sent</p>
                        <p className="text-sm text-green-600">By {trade.shipmentAppropriationSentBy || '-'}</p>
                        <p className="text-sm text-green-600">{(() => { try { const d = new Date(trade.shipmentAppropriationSentAt); return `${d.toLocaleDateString('en-GB')} ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`; } catch { return trade.shipmentAppropriationSentAt; } })()}</p>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <Button variant="outline" onClick={sendShipmentAppropriation} disabled={sendingSA}>
                        {sendingSA ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}Resend
                      </Button>
                      <Button variant="outline" className="text-destructive hover:text-destructive" onClick={reverseShipmentAppropriation} disabled={sendingSA}>
                        <X className="h-4 w-4 mr-2" />Reverse
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button size="lg" onClick={sendShipmentAppropriation} disabled={sendingSA}>
                    {sendingSA ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileText className="h-4 w-4 mr-2" />}Generate Shipment Appropriation
                  </Button>
                )}
                <Button variant="outline" size="lg" onClick={() => openEmailDialog('shipment_appropriation', 'Shipment Appropriation')}>
                  <Send className="h-4 w-4 mr-2" />Email Shipment Appropriation
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Payment Date From Buyer Tab */}
          <TabsContent value="payment">
            <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Payment Date From Buyer</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={`w-[220px] justify-start text-left font-normal ${!trade.buyerPaymentDate ? 'text-muted-foreground' : ''}`} data-testid="buyer-payment-date-btn">
                        <CalendarDays className="mr-2 h-4 w-4" />
                        {trade.buyerPaymentDate || 'Pick payment date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={trade.buyerPaymentDate ? (() => { try { const [d,m,y] = trade.buyerPaymentDate.split('/'); return new Date(y, m-1, d); } catch { return undefined; } })() : undefined}
                        onSelect={(d) => { if (d) saveBuyerPaymentDate(format(d, 'dd/MM/yyyy')); }}
                      />
                    </PopoverContent>
                  </Popover>
                  {trade.buyerPaymentDate && (
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => saveBuyerPaymentDate('')} data-testid="clear-buyer-payment">
                      <X className="h-4 w-4 mr-1" />Clear
                    </Button>
                  )}
                  {buyerPaymentSaving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Payment / SWIFT Copy</CardTitle></CardHeader>
              <CardContent>
                  {trade.swiftFileName ? (
                    <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                      <FileText className="h-5 w-5 text-primary flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{trade.swiftFileName}</p>
                        <p className="text-xs text-muted-foreground">Uploaded SWIFT copy</p>
                      </div>
                      <Button size="sm" variant="outline" onClick={viewSwiftCopy} data-testid="view-swift-btn">
                        <FileText className="h-3.5 w-3.5 mr-1" />View
                      </Button>
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={deleteSwiftCopy} data-testid="delete-swift-btn">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <label className="inline-flex items-center gap-2 cursor-pointer px-4 py-2 rounded-md border border-dashed border-muted-foreground/30 hover:bg-muted/50 transition-colors">
                      {swiftUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4 text-muted-foreground" />}
                      <span className="text-sm text-muted-foreground">{swiftUploading ? 'Uploading...' : 'Upload SWIFT Copy'}</span>
                      <input type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx" className="hidden" onChange={(e) => { if (e.target.files[0]) uploadSwiftCopy(e.target.files[0]); e.target.value = ''; }} disabled={swiftUploading} data-testid="swift-file-input" />
                    </label>
                  )}
              </CardContent>
            </Card>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Commission Invoice</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Invoice Number</Label>
                    <Input placeholder="e.g. COMM-BEK446" value={trade.invoiceNo || ''} onChange={(e) => { const val = e.target.value; setTrade(prev => ({...prev, invoiceNo: val})); }} onBlur={(e) => api.put(`/api/trades/${trade.id}`, { invoiceNo: e.target.value })} data-testid="commission-invoice-no-input" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Invoice Date</Label>
                    <Input placeholder="e.g. 01/04/2026" value={trade.invoiceDate || ''} onChange={(e) => { const val = e.target.value; setTrade(prev => ({...prev, invoiceDate: val})); }} onBlur={(e) => api.put(`/api/trades/${trade.id}`, { invoiceDate: e.target.value })} data-testid="commission-invoice-date-input" />
                  </div>
                  <div className="flex items-center gap-2 pt-2">
                    <Button variant="outline" size="sm" data-testid="view-commission-invoice-pdf" onClick={async () => { try { const res = await api.get(`/api/commission-invoice/${trade.id}`, { responseType: 'blob' }); window.open(window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' })), '_blank'); } catch { toast.error('Failed to generate PDF'); } }}><FileText className="h-4 w-4 mr-1.5" />View PDF</Button>
                    <Button variant="default" size="sm" className="bg-[#1A5276] hover:bg-[#143D5C]" data-testid="send-commission-invoice-btn" onClick={openCiDialog}><Send className="h-4 w-4 mr-1.5" />Send to {trade.brokerageAccount === 'buyer' ? (trade.buyerCode || trade.buyerName || 'Buyer') : (trade.sellerCode || trade.sellerName || 'Seller')}</Button>
                    {trade.commissionInvoiceSentAt && (
                      <p className="text-xs text-muted-foreground">Sent by <strong>{(trade.commissionInvoiceSentBy || '-').split('.').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}</strong> on {toIstanbulTime(trade.commissionInvoiceSentAt)}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Courier for Original Documents</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Courier Name</Label>
                    <Input placeholder="e.g. DHL, FedEx, UPS..." value={trade.courierName || ''} onChange={(e) => { const val = e.target.value; setTrade(prev => ({...prev, courierName: val})); }} onBlur={(e) => api.put(`/api/trades/${trade.id}`, { courierName: e.target.value })} data-testid="courier-name-input" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Tracking Number</Label>
                    <Input placeholder="Tracking number..." value={trade.courierTrackingNo || ''} onChange={(e) => { const val = e.target.value; setTrade(prev => ({...prev, courierTrackingNo: val})); }} onBlur={(e) => api.put(`/api/trades/${trade.id}`, { courierTrackingNo: e.target.value })} data-testid="courier-tracking-input" />
                  </div>
                </div>
              </CardContent>
            </Card>
            </div>
            {trade.buyerPaymentDate && (
              <div className="flex items-center gap-3 p-4 mt-4 rounded-lg border bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
                <CheckCircle2 className="h-6 w-6 text-green-600 flex-shrink-0" />
                <div>
                  <p className="font-medium text-green-800 dark:text-green-300">Contract Completed</p>
                  <p className="text-sm text-green-600 dark:text-green-400">Payment received on {trade.buyerPaymentDate}. Commission invoice auto-generated.</p>
                </div>
              </div>
            )}
          </TabsContent>

          {/* Shortage & Demurrage Tab */}
          <TabsContent value="shortage-demurrage">
            <div className="grid grid-cols-2 gap-6">
              {/* Shortage Section */}
              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4" />Shortage</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  {(() => {
                    const blQty = parseFloat(trade.blQuantity) || 0;
                    const dischargeQty = parseFloat(trade.dischargeQuantity) || 0;
                    const allowedPct = 0.5;
                    const allowedShortage = blQty * (allowedPct / 100);
                    const actualShortage = blQty - dischargeQty;
                    const exceedsTolerance = actualShortage > allowedShortage && blQty > 0 && dischargeQty > 0;
                    const shortageToPayMT = exceedsTolerance ? actualShortage - allowedShortage : 0;
                    const fmtQty = (v) => { if (!v) return '-'; return v.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 3}) + ' MT'; };

                    return (
                      <>
                        <div className="flex justify-between items-center py-2 border-b">
                          <span className="text-sm text-muted-foreground">B/L Quantity</span>
                          <span className="font-semibold">{blQty ? fmtQty(blQty) : '-'}</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b">
                          <span className="text-sm text-muted-foreground">Discharge Quantity</span>
                          <span className="font-semibold">{dischargeQty ? fmtQty(dischargeQty) : '-'}</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b">
                          <span className="text-sm text-muted-foreground">Allowed Shortage ({allowedPct}%)</span>
                          <span className="font-medium">{blQty ? fmtQty(allowedShortage) : '-'}</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b">
                          <span className="text-sm text-muted-foreground">Actual Shortage</span>
                          <span className={`font-semibold ${actualShortage > 0 && blQty > 0 ? 'text-red-600' : ''}`}>{blQty && dischargeQty ? fmtQty(actualShortage) : '-'}</span>
                        </div>
                        <div className={`flex justify-between items-center py-3 px-3 rounded-lg ${exceedsTolerance ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'}`}>
                          <span className="text-sm font-semibold">Shortage to be Paid</span>
                          {exceedsTolerance ? (
                            <span className="font-bold text-red-600">- {fmtQty(shortageToPayMT)}</span>
                          ) : (
                            <span className="font-bold text-green-600">N/A</span>
                          )}
                        </div>
                      </>
                    );
                  })()}

                  {/* Shortage Document Upload */}
                  <div className="pt-3 border-t space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">Shortage Document</span>
                      {trade.shortageDocFileName ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-muted-foreground truncate max-w-[150px]">{trade.shortageDocFileName}</span>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={viewShortageDoc} data-testid="view-shortage-doc"><Eye className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={deleteShortageDoc} data-testid="delete-shortage-doc"><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      ) : (
                        <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer bg-muted hover:bg-muted/80 transition-colors">
                          {shortageDocUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                          {shortageDocUploading ? 'Uploading...' : 'Upload'}
                          <input type="file" className="hidden" onChange={(e) => uploadShortageDoc(e.target.files[0])} disabled={shortageDocUploading} />
                        </label>
                      )}
                    </div>

                    {/* Shortage Invoice Upload */}
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">Shortage Invoice</span>
                      {trade.shortageInvFileName ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-muted-foreground truncate max-w-[150px]">{trade.shortageInvFileName}</span>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={viewShortageInv} data-testid="view-shortage-inv"><Eye className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={deleteShortageInv} data-testid="delete-shortage-inv"><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      ) : (
                        <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer bg-muted hover:bg-muted/80 transition-colors">
                          {shortageInvUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                          {shortageInvUploading ? 'Uploading...' : 'Upload'}
                          <input type="file" className="hidden" onChange={(e) => uploadShortageInv(e.target.files[0])} disabled={shortageInvUploading} />
                        </label>
                      )}
                    </div>

                    {/* Shortage Payment Date */}
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">Payment Date</span>
                      <div className="flex items-center gap-1.5">
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                              <CalendarDays className="h-3.5 w-3.5" />
                              {trade.shortagePaymentDate || 'Select date'}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="end">
                            <Calendar mode="single"
                              selected={(() => { try { const [d,m,y] = (trade.shortagePaymentDate || '').split('/'); return new Date(y, m-1, d); } catch { return undefined; } })()}
                              onSelect={(date) => { if (date) saveShortagePaymentDate(format(date, 'dd/MM/yyyy')); }}
                            />
                          </PopoverContent>
                        </Popover>
                        {trade.shortagePaymentDate && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Demurrage Section */}
              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><DollarSign className="h-4 w-4" />Demurrage</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-sm text-muted-foreground">Demurrage Amount</span>
                    <span className="font-semibold text-muted-foreground">N/A</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Demurrage details will be added when applicable.</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      )}


      {/* B/L Edit Dialog */}
      <Dialog open={blDialogOpen} onOpenChange={setBlDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle className="text-center">Edit B/L Details</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>B/L Number</Label><Input value={blForm.blNumber || ''} onChange={(e) => setBlForm(p => ({ ...p, blNumber: e.target.value }))} /></div>
            <div className="space-y-2"><Label>B/L Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarDays className="mr-2 h-4 w-4" />
                    {blForm.blDate || 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={(() => { try { const [d, m, y] = (blForm.blDate || '').split('/'); return new Date(y, m - 1, d); } catch { return undefined; } })()}
                    onSelect={(date) => { if (date) setBlForm(p => ({ ...p, blDate: format(date, 'dd/MM/yyyy') })); }}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2"><Label>B/L Quantity (MT)</Label><Input type="number" value={blForm.blQuantity || ''} onChange={(e) => setBlForm(p => ({ ...p, blQuantity: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Discharge Quantity (MT)</Label><Input type="number" value={blForm.dischargeQuantity || ''} onChange={(e) => setBlForm(p => ({ ...p, dischargeQuantity: e.target.value }))} /></div>
            {blForm.blQuantity && blForm.dischargeQuantity && (() => {
              const shortage = parseFloat(blForm.blQuantity) - parseFloat(blForm.dischargeQuantity);
              const pct = ((shortage / parseFloat(blForm.blQuantity)) * 100).toFixed(3);
              return (
                <div className="col-span-2 px-3 py-2 rounded-md bg-muted/50 border text-sm flex justify-between items-center">
                  <span className="text-muted-foreground font-medium">Shortage</span>
                  <span className={`font-semibold ${shortage > 0 ? 'text-red-600' : shortage < 0 ? 'text-green-600' : ''}`}>{shortage > 0 ? '' : shortage < 0 ? '+' : ''}{Math.abs(shortage).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MT ({pct}%)</span>
                </div>
              );
            })()}
            <div className="space-y-2"><Label>Load Port</Label>
              <Select value={blForm.loadPortId || ''} onValueChange={(v) => setBlForm(p => ({ ...p, loadPortId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{ports.filter(p => p.type === 'loading').map(p => <SelectItem key={p.id} value={p.id}>{p.name}, {p.country}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Discharge Port</Label>
              <Select value={blForm.dischargePortId || ''} onValueChange={(v) => setBlForm(p => ({ ...p, dischargePortId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{ports.filter(p => p.type === 'discharge').map(p => <SelectItem key={p.id} value={p.id}>{p.name}, {p.country}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Seller Surveyor at Load Port</Label>
              <Select value={blForm.sellerSurveyor || ''} onValueChange={(v) => setBlForm(p => ({ ...p, sellerSurveyor: v }))}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{surveyors.map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Buyer Surveyor at Load Port</Label>
              <Select value={blForm.buyerSurveyor || ''} onValueChange={(v) => setBlForm(p => ({ ...p, buyerSurveyor: v }))}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{surveyors.map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Discharge Port Agent</Label>
              <Select value={blForm.disportAgent || ''} onValueChange={(v) => setBlForm(p => ({ ...p, disportAgent: v }))}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{disportAgents.map(a => <SelectItem key={a.id} value={a.name}>{a.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Load Port Agent</Label>
              <Select value={blForm.loadportAgent || ''} onValueChange={(v) => setBlForm(p => ({ ...p, loadportAgent: v }))}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{loadportAgents.map(a => <SelectItem key={a.id} value={a.name}>{a.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBlDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveBlDetails} disabled={blSaving}>{blSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email Dialog */}
      <Dialog open={emailDialog.open} onOpenChange={(open) => !open && setEmailDialog({ open: false, docType: '', docLabel: '' })}>
        <DialogContent className="sm:max-w-lg mx-auto">
          <DialogHeader><DialogTitle className="text-center">Send {emailDialog.docLabel}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {/* Seller Section - hidden for CIF/CFR vessel nominations (buyer responsibility) */}
            {!(emailDialog.docType === 'vessel_nomination' && /^(CIF|CFR)/i.test(trade?.deliveryTerm || '')) && (
            <div className="space-y-2 border rounded-lg p-3">
              <Label className="text-sm font-semibold">To Seller ({trade?.sellerCode || trade?.sellerName || ''})</Label>
              <Input value={emailSellerTo} onChange={(e) => setEmailSellerTo(e.target.value)} placeholder="seller@example.com" data-testid="email-seller-to" />
              {emailSellerCc.length > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">CC</Label>
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {emailSellerCc.map(e => (
                      <label key={`s-${e}`} className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input type="checkbox" checked={true} onChange={() => setEmailSellerCc(prev => prev.filter(x => x !== e))} className="rounded" />
                        {e}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Additional CC</Label>
                <Input value={emailExtraSeller} onChange={e => setEmailExtraSeller(e.target.value)} placeholder="email1@example.com, email2@example.com" className="text-xs h-8" data-testid="email-seller-extra-cc" />
              </div>
            </div>
            )}

            {/* Buyer Section */}
            <div className="space-y-2 border rounded-lg p-3">
              <Label className="text-sm font-semibold">To Buyer ({trade?.buyerCode || trade?.buyerName || ''})</Label>
              <Input value={emailBuyerTo} onChange={(e) => setEmailBuyerTo(e.target.value)} placeholder="buyer@example.com" data-testid="email-buyer-to" />
              {emailBuyerCc.length > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">CC</Label>
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {emailBuyerCc.map(e => (
                      <label key={`b-${e}`} className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input type="checkbox" checked={true} onChange={() => setEmailBuyerCc(prev => prev.filter(x => x !== e))} className="rounded" />
                        {e}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Additional CC</Label>
                <Input value={emailExtraBuyer} onChange={e => setEmailExtraBuyer(e.target.value)} placeholder="email1@example.com, email2@example.com" className="text-xs h-8" data-testid="email-buyer-extra-cc" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailDialog({ open: false, docType: '', docLabel: '' })}>Cancel</Button>
            <Button onClick={sendDocumentEmail} disabled={emailSending}>{emailSending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}Send</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Commission Invoice Email Dialog */}
      <Dialog open={ciDialog} onOpenChange={(open) => !open && setCiDialog(false)}>
        <DialogContent className="sm:max-w-lg mx-auto">
          <DialogHeader><DialogTitle className="text-center">Send Commission Invoice</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2 border rounded-lg p-3">
              <Label className="text-sm font-semibold">To {trade?.brokerageAccount === 'buyer' ? (trade?.buyerCode || trade?.buyerName || 'Buyer') : (trade?.sellerCode || trade?.sellerName || 'Seller')}</Label>
              <Input value={ciTo} onChange={(e) => setCiTo(e.target.value)} placeholder="recipient@example.com" data-testid="ci-email-to" />
              {ciCc.length > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">CC</Label>
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {ciCc.map(e => (
                      <label key={`ci-${e}`} className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input type="checkbox" checked={true} onChange={() => setCiCc(prev => prev.filter(x => x !== e))} className="rounded" />
                        {e}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Additional CC</Label>
                <Input value={ciExtraCc} onChange={e => setCiExtraCc(e.target.value)} placeholder="email1@example.com, email2@example.com" className="text-xs h-8" data-testid="ci-extra-cc" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCiDialog(false)}>Cancel</Button>
            <Button onClick={sendCommissionInvoice} disabled={emailSending}>{emailSending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}Send</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
