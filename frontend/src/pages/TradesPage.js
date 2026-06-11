import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import api from '../lib/api';
import { TRADE_STATUS_CONFIG, STATUS_OPTIONS, COMPLETED_STATUSES, WASHOUT_STATUSES, CANCELLED_STATUSES } from '../lib/constants';
import { normalizeTR } from '../lib/utils-tr';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Plus, Search, Ship, Clock, CheckCircle, Filter, X, AlertTriangle, Ban, Loader2, Pencil, CalendarDays, TrendingUp, AlertCircle, DollarSign, Users, Building, FileText, Send, Banknote } from 'lucide-react';
import { toast } from 'sonner';
import { format, parseISO, isAfter, startOfDay } from 'date-fns';

export default function TradesPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [trades, setTrades] = useState([]);
  const [partners, setPartners] = useState([]);
  const [commodities, setCommodities] = useState([]);
  const [origins, setOrigins] = useState([]);
  const [vessels, setVessels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState([]);
  const [events, setEvents] = useState([]);
  const [search, setSearch] = useState('');
  const [filterCommodity, setFilterCommodity] = useState('all');
  const [filterSeller, setFilterSeller] = useState('all');
  const [filterBuyer, setFilterBuyer] = useState('all');
  const [filterVessel, setFilterVessel] = useState('all');
  const [filterOrigin, setFilterOrigin] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterCoBroker, setFilterCoBroker] = useState('all');
  const [filterCountry, setFilterCountry] = useState('all');
  const [filterBrokerName, setFilterBrokerName] = useState('all');
  const [filterYear, setFilterYear] = useState(new Date().getFullYear().toString());
  const [selectedTrade, setSelectedTrade] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [entityFilter, setEntityFilter] = useState(null); // { type: 'seller'|'buyer'|'broker', name: '...', code: '...' }
  const [generatingBC, setGeneratingBC] = useState(null); // trade id being generated
  const [brokerCommDialog, setBrokerCommDialog] = useState({ open: false, tradeId: null, newStatus: null });

  const fetchAll = useCallback(async () => {
    try {
      const [tr, pa, co, or, ve, inv, ev] = await Promise.all([
        api.get('/api/trades'),
        api.get('/api/partners'),
        api.get('/api/commodities'),
        api.get('/api/origins'),
        api.get('/api/vessels'),
        api.get('/api/invoices'),
        api.get('/api/events'),
      ]);
      setTrades(tr.data);
      setPartners(pa.data);
      setCommodities(co.data);
      setOrigins(or.data);
      setVessels(ve.data);
      setInvoices(inv.data);
      setEvents(ev.data);
    } catch (err) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Scroll to section when navigating from dashboard
  useEffect(() => {
    if (location.state?.scrollTo && !loading) {
      const el = document.getElementById(location.state.scrollTo);
      if (el) {
        setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
      }
      // Clear state so refresh doesn't re-scroll
      window.history.replaceState({}, '');
    }
  }, [location.state, loading]);

  const generateBC = async (tradeId) => {
    setGeneratingBC(tradeId);
    try {
      const res = await api.get(`/api/business-confirmation/${tradeId}/pdf`, { responseType: 'blob' });
      window.open(window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' })), '_blank');
      toast.success('Business Confirmation generated');
    } catch { toast.error('Failed to generate Business Confirmation'); }
    finally { setGeneratingBC(null); }
  };


  const hasActiveFilters = search || filterCommodity !== 'all' || filterSeller !== 'all' || filterBuyer !== 'all' || filterVessel !== 'all' || filterOrigin !== 'all' || filterStatus !== 'all' || filterCoBroker !== 'all' || filterCountry !== 'all' || filterBrokerName !== 'all' || filterYear !== new Date().getFullYear().toString();
  const clearFilters = () => { setSearch(''); setFilterCommodity('all'); setFilterSeller('all'); setFilterBuyer('all'); setFilterVessel('all'); setFilterOrigin('all'); setFilterStatus('all'); setFilterCoBroker('all'); setFilterCountry('all'); setFilterBrokerName('all'); setFilterYear(new Date().getFullYear().toString()); };

  const getTradeYear = useCallback((trade) => {
    const d = trade.contractDate || trade.createdAt || '';
    const slashMatch = d.match(/^\d{2}\/\d{2}\/(\d{4})$/);
    if (slashMatch) return slashMatch[1];
    if (d.length >= 4) return d.substring(0, 4);
    return '';
  }, []);

  const currentYear = new Date().getFullYear().toString();
  const yearFilteredTrades = useMemo(() => {
    if (filterYear === 'all') return trades;
    return trades.filter(t => {
      const tradeYear = getTradeYear(t);
      if (tradeYear === filterYear) return true;
      // When viewing current year, also include older trades that are NOT yet completed/cancelled
      if (filterYear === currentYear) {
        const isIncomplete = !COMPLETED_STATUSES.includes(t.status) &&
                             !CANCELLED_STATUSES.includes(t.status);
        if (isIncomplete) return true;
        // Also include completed trades with unpaid brokerage
        if (COMPLETED_STATUSES.includes(t.status) && !t.invoicePaid &&
            (t.brokerName || (t.brokeragePerMT && t.brokeragePerMT > 0))) {
          return true;
        }
      }
      return false;
    });
  }, [trades, filterYear, currentYear, getTradeYear]);

  const sellers = useMemo(() => {
    const sellerIds = new Set(trades.map(t => t.sellerId).filter(Boolean));
    return partners.filter(p => sellerIds.has(p.id));
  }, [partners, trades]);
  const buyers = useMemo(() => {
    const buyerIds = new Set(trades.map(t => t.buyerId).filter(Boolean));
    return partners.filter(p => buyerIds.has(p.id));
  }, [partners, trades]);
  const uniqueVessels = useMemo(() => [...new Set(trades.filter(t => t.vesselName).map(t => t.vesselName))].sort(), [trades]);
  const uniqueCoBrokers = useMemo(() => {
    const map = new Map();
    trades.forEach(t => { if (t.coBrokerId && t.coBrokerName) map.set(t.coBrokerId, t.coBrokerCode || t.coBrokerName); });
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [trades]);
  const uniqueCountries = useMemo(() => {
    const set = new Set();
    trades.forEach(t => { if (t.originName) set.add(t.originName); });
    return [...set].sort((a, b) => a.localeCompare(b, 'tr'));
  }, [trades]);

  const entityTrades = useMemo(() => {
    if (!entityFilter) return [];
    return trades.filter(t => {
      if (entityFilter.type === 'seller') return t.sellerName === entityFilter.name;
      if (entityFilter.type === 'buyer') return t.buyerName === entityFilter.name;
      if (entityFilter.type === 'broker') return t.brokerName === entityFilter.name || t.coBrokerName === entityFilter.name;
      return false;
    });
  }, [trades, entityFilter]);

  const applyFilters = useCallback((list) => {
    let result = list;
    if (filterCommodity !== 'all') result = result.filter(t => t.commodityId === filterCommodity);
    if (filterSeller !== 'all') result = result.filter(t => t.sellerId === filterSeller);
    if (filterBuyer !== 'all') result = result.filter(t => t.buyerId === filterBuyer);
    if (filterVessel !== 'all') result = result.filter(t => t.vesselName === filterVessel);
    if (filterOrigin !== 'all') result = result.filter(t => t.originId === filterOrigin);
    if (filterStatus !== 'all') result = result.filter(t => t.status === filterStatus);
    if (filterCoBroker !== 'all') result = result.filter(t => t.coBrokerId === filterCoBroker);
    if (filterBrokerName !== 'all') result = result.filter(t => t.brokerName === filterBrokerName);
    if (filterCountry !== 'all') result = result.filter(t => t.originName === filterCountry);
    if (search) {
      const q = normalizeTR(search);
      result = result.filter(t =>
        normalizeTR(t.referenceNumber).includes(q) ||
        normalizeTR(t.sellerCode || t.sellerName).includes(q) ||
        normalizeTR(t.buyerCode || t.buyerName).includes(q) ||
        normalizeTR(t.commodityName).includes(q) ||
        normalizeTR(t.vesselName).includes(q)
      );
    }
    return result;
  }, [filterCommodity, filterSeller, filterBuyer, filterVessel, filterOrigin, filterStatus, filterCoBroker, filterBrokerName, filterCountry, search]);

  const categorized = useMemo(() => ({
    ongoing: yearFilteredTrades.filter(t => !['completed', 'cancelled', 'washout'].includes(t.status) && t.vesselName),
    pending: yearFilteredTrades.filter(t => !['completed', 'cancelled', 'washout'].includes(t.status) && !t.vesselName),
    completed: yearFilteredTrades.filter(t => COMPLETED_STATUSES.includes(t.status)),
    washout: yearFilteredTrades.filter(t => WASHOUT_STATUSES.includes(t.status)),
    cancelled: yearFilteredTrades.filter(t => CANCELLED_STATUSES.includes(t.status)),
  }), [yearFilteredTrades]);

  // Match pending commissions from trade's own invoicePaid field (consistent with CommissionsPage)
  const awaitingBrokerage = useMemo(() =>
    yearFilteredTrades.filter(t =>
      COMPLETED_STATUSES.includes(t.status) &&
      !t.invoicePaid &&
      (t.brokerName || (t.brokeragePerMT && t.brokeragePerMT > 0))
    ),
  [yearFilteredTrades]);

  const pendingCommissionTradeIds = useMemo(() => {
    return new Set(awaitingBrokerage.map(t => t.id));
  }, [awaitingBrokerage]);

  // Remove awaiting brokerage from ongoing
  const filteredOngoing = useMemo(() =>
    categorized.ongoing.filter(t => !pendingCommissionTradeIds.has(t.id)),
  [categorized.ongoing, pendingCommissionTradeIds]);

  const fullyCompleted = useMemo(() =>
    categorized.completed.filter(t => !pendingCommissionTradeIds.has(t.id)),
  [categorized.completed, pendingCommissionTradeIds]);

  const filtered = useMemo(() => ({
    ongoing: applyFilters(filteredOngoing),
    pending: applyFilters(categorized.pending),
    awaitingBrokerage: applyFilters(awaitingBrokerage),
    completed: applyFilters(fullyCompleted),
    washout: applyFilters(categorized.washout),
    cancelled: applyFilters(categorized.cancelled),
  }), [categorized, applyFilters, awaitingBrokerage, fullyCompleted, filteredOngoing]);

  const upcomingItems = useMemo(() => {
    const today = startOfDay(new Date());
    const items = [];
    invoices.filter(i => i.status === 'pending').forEach(inv => {
      items.push({ id: inv.id, type: 'invoice', title: `Invoice ${inv.invoiceNumber} - ${inv.vendorName}`, date: inv.dueDate, icon: 'payment' });
    });
    events.filter(e => { try { const d = parseISO(e.date); return isAfter(d, today) || format(d, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd'); } catch { return false; } })
      .forEach(evt => { items.push({ id: evt.id, type: 'event', title: evt.title, date: evt.date, icon: evt.type }); });
    items.sort((a, b) => { try { return new Date(a.date) - new Date(b.date); } catch { return 0; } });
    return items;
  }, [invoices, events]);

  const handleStatusChange = async (tradeId, newStatus) => {
    try {
      // For cancelled/washout, ask about broker commissions via dialog
      if (['cancelled', 'washout'].includes(newStatus)) {
        const trade = trades.find(t => t.id === tradeId);
        const hasBroker = trade?.brokerName || (trade?.brokeragePerMT && trade.brokeragePerMT > 0);
        if (hasBroker) {
          setBrokerCommDialog({ open: true, tradeId, newStatus });
          return;
        }
      }
      await api.patch(`/api/trades/${tradeId}/status`, { status: newStatus });
      setTrades(prev => prev.map(t => t.id === tradeId ? { ...t, status: newStatus } : t));
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to update status';
      toast.error(msg);
    }
  };

  const handleBrokerCommDecision = async (generate) => {
    const { tradeId, newStatus } = brokerCommDialog;
    setBrokerCommDialog({ open: false, tradeId: null, newStatus: null });
    try {
      const cancelDate = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Istanbul' });
      await api.put(`/api/trades/${tradeId}`, { generateBrokerCommission: generate, cancelledDate: cancelDate });
      await api.patch(`/api/trades/${tradeId}/status`, { status: newStatus });
      setTrades(prev => prev.map(t => t.id === tradeId ? { ...t, status: newStatus, generateBrokerCommission: generate, cancelledDate: cancelDate } : t));
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to update status';
      toast.error(msg);
    }
  };

  const formatDate = (d) => { if (!d) return '-'; if (/^\d{2}\/\d{2}\/\d{4}$/.test(d)) return d; try { return format(parseISO(d), 'dd/MM/yyyy'); } catch { return '-'; } };
  const formatShipmentDate = (d) => { if (!d) return ''; const m = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); if (m) return d; try { return format(parseISO(d), 'dd/MM/yyyy'); } catch { return d; } };
  const formatQty = (q) => q ? `${q.toLocaleString()} MT` : '-';

  // Calculate discharge port price: base price + port variation difference for selected discharge port
  const getDischargePortPrice = useCallback((trade) => {
    const basePrice = trade.pricePerMT;
    if (!basePrice) return null;
    
    const dischargePortId = trade.dischargePortId;
    const portVariations = trade.portVariations || [];
    
    // If no discharge port selected or no variations, return base price
    if (!dischargePortId || portVariations.length === 0) return basePrice;
    
    // Find the matching port variation
    const matchingVariation = portVariations.find(pv => pv.portId === dischargePortId);
    if (matchingVariation) {
      return basePrice + Number(matchingVariation.difference || 0);
    }
    
    // If discharge port doesn't match any variation, return base price
    return basePrice;
  }, []);

  const handleVesselUpdate = async (tradeId, vesselName) => {
    try {
      await api.put(`/api/trades/${tradeId}`, { vesselName: vesselName || '' });
      setTrades(prev => prev.map(t => t.id === tradeId ? { ...t, vesselName } : t));
      toast.success('Vessel updated');
    } catch { toast.error('Failed to update vessel'); }
  };

  const VesselPicker = ({ trade }) => {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');
    const wrapperRef = useRef(null);
    const dropdownRef = useRef(null);
    const inputRef = useRef(null);
    const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });

    useEffect(() => {
      const handler = (e) => {
        if (wrapperRef.current && wrapperRef.current.contains(e.target)) return;
        if (dropdownRef.current && dropdownRef.current.contains(e.target)) return;
        setOpen(false);
      };
      if (open) document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    useEffect(() => {
      if (open && inputRef.current) {
        const rect = inputRef.current.getBoundingClientRect();
        setPos({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 192) });
      }
    }, [open]);

    const sorted = useMemo(() => {
      const list = [...new Set(vessels.map(v => v.name).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'));
      if (!q) return list;
      return list.filter(n => n.toLowerCase().includes(q.toLowerCase()));
    }, [q]);

    const formatVesselName = (name) => {
      if (!name || name.length <= 17) return name;
      const words = name.split(' ');
      let line1 = '';
      let line2 = '';
      for (const w of words) {
        if (!line2 && (line1 + (line1 ? ' ' : '') + w).length <= 17) {
          line1 += (line1 ? ' ' : '') + w;
        } else {
          line2 += (line2 ? ' ' : '') + w;
        }
      }
      if (!line2) return name;
      return <>{line1}<br/>&nbsp;&nbsp;{line2}</>;
    };

    if (!open) {
      if (trade.vesselName) {
        return (
          <div className="flex items-center gap-1 justify-center" onClick={(e) => e.stopPropagation()}>
            <a
              href={`/documents/${trade.id}`}
              data-testid={`vessel-link-${trade.id}`}
              className="font-bold text-blue-600 hover:text-blue-800 hover:underline text-sm uppercase leading-tight"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(`/documents/${trade.id}`); }}
            >
              {formatVesselName(trade.vesselName)}
            </a>
            <button className="text-muted-foreground hover:text-foreground ml-1 p-0.5" onClick={(e) => { e.stopPropagation(); setOpen(true); setQ(''); }} title="Change vessel">
              <Pencil className="h-3 w-3" />
            </button>
          </div>
        );
      }
      return (
        <button
          data-testid={`vessel-picker-${trade.id}`}
          className="w-full text-center text-sm uppercase cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5 transition-colors"
          onClick={(e) => { e.stopPropagation(); setOpen(true); setQ(''); }}
        >
          <span className="text-muted-foreground">-</span>
        </button>
      );
    }

    return (
      <div ref={wrapperRef} className="relative" onClick={(e) => e.stopPropagation()}>
        <Input
          ref={inputRef}
          autoFocus
          data-testid={`vessel-search-${trade.id}`}
          className="h-7 text-xs"
          placeholder="Search vessel..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {createPortal(
          <div
            ref={dropdownRef}
            style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 9999 }}
            className="max-h-48 overflow-y-auto rounded-md border bg-popover shadow-lg text-sm"
            onClick={(e) => e.stopPropagation()}
          >
            {trade.vesselName && (
              <button className="w-full text-left px-3 py-1.5 hover:bg-muted text-destructive text-xs" onClick={() => { handleVesselUpdate(trade.id, ''); setOpen(false); }}>
                Clear vessel
              </button>
            )}
            {sorted.length === 0 && <div className="px-3 py-2 text-muted-foreground text-xs">No vessels found</div>}
            {sorted.map(name => (
              <button
                key={name}
                className={`w-full text-left px-3 py-1.5 hover:bg-muted text-xs uppercase ${name === trade.vesselName ? 'bg-muted font-medium' : ''}`}
                onClick={() => { handleVesselUpdate(trade.id, name); setOpen(false); }}
              >
                {name}
              </button>
            ))}
          </div>,
          document.body
        )}
      </div>
    );
  };

  const renderTable = (list, empty, overrideStatus = null) => {
    if (list.length === 0) return <div className="text-center py-8 text-muted-foreground text-sm">{search || hasActiveFilters ? 'No contracts match your search or filters' : empty}</div>;
    return (
      <div className="overflow-x-auto border rounded-lg">
        <Table className="trade-table">
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-center">Contract Date</TableHead>
              <TableHead className="text-center">Contract No</TableHead>
              <TableHead className="text-center">Seller</TableHead>
              <TableHead className="text-center">Buyer</TableHead>
              <TableHead className="text-center">Broker</TableHead>
              <TableHead className="text-center">Commodity</TableHead>
              <TableHead className="text-center">Origin</TableHead>
              <TableHead className="text-center">Quantity<br/><span className="text-xs font-normal text-muted-foreground">(Mts)</span></TableHead>
              <TableHead className="text-center">Delivery Term</TableHead>
              <TableHead className="text-center whitespace-nowrap">Unit Price</TableHead>
              <TableHead className="text-center">Shipment Period</TableHead>
              <TableHead className="text-center">Vessel</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((trade) => (
              <TableRow key={trade.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/trades/${trade.id}`)}>
                <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                  <Select value={trade.status} onValueChange={(v) => handleStatusChange(trade.id, v)}>
                    <SelectTrigger className="w-full h-8 justify-center border-0 shadow-none focus:ring-0">
                      <Badge className={`${TRADE_STATUS_CONFIG[overrideStatus || trade.status]?.color || 'bg-muted text-muted-foreground'} status-badge truncate`}>
                        {(TRADE_STATUS_CONFIG[overrideStatus || trade.status]?.label || overrideStatus || trade.status).toUpperCase()}
                      </Badge>
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-center text-sm">{formatDate(trade.contractDate || trade.createdAt)}</TableCell>
                <TableCell className="text-center">
                  <Link to={`/trades/${trade.id}`} className="font-medium text-foreground hover:underline cursor-pointer text-sm">
                    {trade.BAContractNumber || trade.contractNumber || trade.referenceNumber}
                  </Link>
                  {trade.sellerContractNumber && trade.sellerContractNumber !== 'N/A' && (
                    <div className="text-xs text-muted-foreground">{trade.sellerContractNumber}</div>
                  )}
                </TableCell>
                <TableCell className="text-center text-sm whitespace-nowrap"><span className="cursor-pointer text-foreground hover:underline" onClick={(e) => { e.stopPropagation(); setEntityFilter({ type: 'seller', name: trade.sellerName, code: trade.sellerCode || trade.sellerName }); }}>{trade.sellerCode || trade.sellerName || '-'}</span></TableCell>
                <TableCell className="text-center text-sm whitespace-nowrap"><span className="cursor-pointer text-foreground hover:underline" onClick={(e) => { e.stopPropagation(); setEntityFilter({ type: 'buyer', name: trade.buyerName, code: trade.buyerCode || trade.buyerName }); }}>{trade.buyerCode || trade.buyerName || '-'}</span></TableCell>
                <TableCell className="text-center text-sm whitespace-nowrap">{(trade.brokerCode || trade.brokerName) ? (
                  <div className="flex flex-col items-center">
                    {trade.coBrokerName ? (
                      <>
                        <span className="cursor-pointer text-foreground hover:underline" onClick={(e) => { e.stopPropagation(); setEntityFilter({ type: 'broker', name: trade.brokerName, code: trade.brokerCode || trade.brokerName }); }}>{trade.brokerCode || trade.brokerName}</span>
                        <hr className="w-full border-t border-border my-0.5" />
                        <span className="cursor-pointer text-foreground hover:underline" onClick={(e) => { e.stopPropagation(); setEntityFilter({ type: 'broker', name: trade.coBrokerName, code: trade.coBrokerCode || trade.coBrokerName }); }}>{trade.coBrokerCode || trade.coBrokerName}</span>
                      </>
                    ) : (
                      <span className="cursor-pointer text-foreground hover:underline" onClick={(e) => { e.stopPropagation(); setEntityFilter({ type: 'broker', name: trade.brokerName, code: trade.brokerCode || trade.brokerName }); }}>{trade.brokerCode || trade.brokerName}</span>
                    )}
                  </div>
                ) : '-'}</TableCell>
                <TableCell className="text-center text-sm max-w-[160px]">{trade.commodityName || '-'}</TableCell>
                <TableCell className="text-center text-sm whitespace-nowrap">{trade.originName || '-'}</TableCell>
                <TableCell className="text-center font-mono text-sm">{trade.quantity ? trade.quantity.toLocaleString() : '-'}</TableCell>
                <TableCell className="text-center text-sm whitespace-nowrap">{(() => {
                  const port = trade.basePortName || trade.loadingPortName || '';
                  const term = trade.deliveryTerm || '';
                  const baseTerm = port && port.toLowerCase().startsWith(term.toLowerCase()) ? port : [term, port].filter(Boolean).join(' ') || '-';
                  const basePrice = trade.pricePerMT;
                  const currency = trade.currency || 'USD';
                  const pvs = trade.portVariations || [];
                  if (pvs.length === 0) return baseTerm;
                  // Build all ports with prices
                  const allPorts = [
                    { name: baseTerm, price: basePrice || 0, isMarmara: baseTerm.toLowerCase().includes('marmara') },
                    ...pvs.map(pv => {
                      const pvTerm = [term, pv.portName].filter(Boolean).join(' ');
                      const pvPrice = (basePrice || 0) + Number(pv.difference || 0);
                      return { name: pvTerm, price: pvPrice, isMarmara: pvTerm.toLowerCase().includes('marmara') };
                    })
                  ];
                  // Sort: lower price first, marmara always middle
                  const marmara = allPorts.filter(p => p.isMarmara);
                  const others = allPorts.filter(p => !p.isMarmara).sort((a, b) => a.price - b.price);
                  const sorted = [];
                  if (others.length > 0) sorted.push(others[0]);
                  sorted.push(...marmara);
                  if (others.length > 1) sorted.push(...others.slice(1));
                  return (
                    <div className="flex flex-col items-center">
                      {sorted.map((p, i) => (
                        <span key={i}>{i > 0 && <hr className="w-full border-t border-border my-0.5" />}<span className="text-foreground">{p.name}</span>{basePrice ? <span className="text-xs ml-1">({p.price.toLocaleString()} {currency})</span> : null}</span>
                      ))}
                    </div>
                  );
                })()}</TableCell>
                <TableCell className="text-center font-mono text-sm whitespace-nowrap">{(() => {
                  const basePrice = trade.pricePerMT;
                  const currency = trade.currency || 'USD';
                  if (!basePrice) return '-';
                  const pvs = trade.portVariations || [];
                  if (pvs.length === 0) return `${basePrice.toLocaleString()} ${currency}`;
                  const term = trade.deliveryTerm || '';
                  const basePortLabel = trade.basePortName || '';
                  const baseTerm = basePortLabel && basePortLabel.toLowerCase().startsWith(term.toLowerCase()) ? basePortLabel : [term, basePortLabel].filter(Boolean).join(' ');
                  const allPorts = [
                    { price: basePrice, isMarmara: baseTerm.toLowerCase().includes('marmara') },
                    ...pvs.map(pv => ({ price: basePrice + Number(pv.difference || 0), isMarmara: (pv.portName || '').toLowerCase().includes('marmara') }))
                  ];
                  const marmara = allPorts.filter(p => p.isMarmara);
                  const others = allPorts.filter(p => !p.isMarmara).sort((a, b) => a.price - b.price);
                  const sorted = [];
                  if (others.length > 0) sorted.push(others[0]);
                  sorted.push(...marmara);
                  if (others.length > 1) sorted.push(...others.slice(1));
                  return (
                    <div className="flex flex-col items-center">
                      {sorted.map((p, i) => (
                        <span key={i}>{i > 0 && <hr className="w-full border-t border-border my-0.5" />}{p.price.toLocaleString()} {currency}</span>
                      ))}
                    </div>
                  );
                })()}</TableCell>
                <TableCell className="text-center text-sm">{trade.shipmentWindowStart || trade.shipmentWindowEnd ? <div>{formatShipmentDate(trade.shipmentWindowStart) && <div>{formatShipmentDate(trade.shipmentWindowStart)}</div>}{formatShipmentDate(trade.shipmentWindowEnd) && <div>{formatShipmentDate(trade.shipmentWindowEnd)}</div>}</div> : '-'}</TableCell>
                <TableCell className="text-center text-sm whitespace-nowrap"><VesselPicker trade={trade} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card className="relative overflow-hidden p-1.5 md:p-2 cursor-pointer hover:shadow-md transition-shadow" data-testid="trades-kpi-ongoing" onClick={() => { const el = document.getElementById('trades-ongoing'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
          <CardHeader className="flex flex-row items-center justify-between pb-1 pt-1">
            <CardTitle className="text-xs md:text-sm font-semibold text-muted-foreground">Ongoing Contracts</CardTitle>
            <div className="flex h-7 w-7 md:h-8 md:w-8 items-center justify-center rounded-lg bg-blue-100"><Ship className="h-3.5 w-3.5 md:h-4 md:w-4 text-primary" /></div>
          </CardHeader>
          <CardContent className="pb-2">
            <div className="text-2xl md:text-3xl font-bold mt-1">{categorized.ongoing.length}</div>
            <div className="mt-1 flex items-center gap-1 text-xs text-secondary"><TrendingUp className="h-3 w-3" /><span>In transit</span></div>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden p-1.5 md:p-2 cursor-pointer hover:shadow-md transition-shadow" data-testid="trades-kpi-pending" onClick={() => { const el = document.getElementById('trades-pending'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
          <CardHeader className="flex flex-row items-center justify-between pb-1 pt-1">
            <CardTitle className="text-xs md:text-sm font-semibold text-muted-foreground">Pending Contracts</CardTitle>
            <div className="flex h-7 w-7 md:h-8 md:w-8 items-center justify-center rounded-lg bg-amber-100"><Clock className="h-3.5 w-3.5 md:h-4 md:w-4 text-amber-600" /></div>
          </CardHeader>
          <CardContent className="pb-2">
            <div className="text-2xl md:text-3xl font-bold mt-1">{categorized.pending.length}</div>
            <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><AlertCircle className="h-3 w-3" /><span>Awaiting vessel</span></div>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden p-1.5 md:p-2 cursor-pointer hover:shadow-md transition-shadow" data-testid="trades-kpi-completed" onClick={() => { const el = document.getElementById('trades-completed'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
          <CardHeader className="flex flex-row items-center justify-between pb-1 pt-1">
            <CardTitle className="text-xs md:text-sm font-semibold text-muted-foreground">Completed Contracts</CardTitle>
            <div className="flex h-7 w-7 md:h-8 md:w-8 items-center justify-center rounded-lg bg-green-50"><CheckCircle className="h-3.5 w-3.5 md:h-4 md:w-4 text-secondary" /></div>
          </CardHeader>
          <CardContent className="pb-2">
            <div className="text-2xl md:text-3xl font-bold mt-1">{categorized.completed.length}</div>
            <div className="mt-1 flex items-center gap-1 text-xs text-secondary"><TrendingUp className="h-3 w-3" /><span>Completed</span></div>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden p-1.5 md:p-2 cursor-pointer hover:shadow-md transition-shadow" data-testid="trades-kpi-upcoming" onClick={() => navigate('/calendar')}>
          <CardHeader className="pb-1 pt-1">
            <CardTitle className="text-xs md:text-sm font-semibold text-muted-foreground text-center">Upcoming Payments & Events</CardTitle>
          </CardHeader>
          <CardContent>
            {upcomingItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-2 text-center">
                <CalendarDays className="h-8 w-8 text-muted-foreground/30 mb-1" />
                <p className="text-xs text-muted-foreground">No upcoming items</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {upcomingItems.slice(0, 3).map((item) => (
                  <div key={`${item.type}-${item.id}`} className="flex items-center gap-2 p-1.5 rounded-lg border bg-muted/30">
                    <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${item.icon === 'payment' || item.type === 'invoice' ? 'bg-green-100' : item.icon === 'meeting' ? 'bg-blue-100' : item.icon === 'conference' ? 'bg-purple-100' : 'bg-gray-100'}`}>
                      {item.icon === 'payment' || item.type === 'invoice' ? <DollarSign className="h-3 w-3 text-green-600" /> : item.icon === 'meeting' ? <Users className="h-3 w-3 text-blue-600" /> : item.icon === 'conference' ? <Building className="h-3 w-3 text-purple-600" /> : <CalendarDays className="h-3 w-3 text-gray-600" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{item.title}</p>
                      <p className="text-[10px] text-muted-foreground">{(() => { try { return format(parseISO(item.date), 'MMM d, yyyy'); } catch { return ''; } })()}</p>
                    </div>
                  </div>
                ))}
                {upcomingItems.length > 3 && <p className="text-xs text-center text-muted-foreground">+{upcomingItems.length - 3} more</p>}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Search + Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3 overflow-x-auto">
            <div className="shrink-0">
              <Button onClick={() => navigate('/trades/new')} data-testid="trades-new-trade-button"><Plus className="mr-2 h-4 w-4" />New Contract</Button>
            </div>
            <div className="relative shrink-0">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input data-testid="trades-search-input" placeholder="Search contracts..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 w-[200px]" />
            </div>
            {hasActiveFilters && <Button variant="ghost" size="sm" onClick={clearFilters} className="shrink-0 text-destructive hover:text-destructive" data-testid="trades-clear-filter"><X className="h-4 w-4 mr-1" />Clear Filter</Button>}
            <Select value={filterYear} onValueChange={setFilterYear}>
              <SelectTrigger className="w-[100px] shrink-0" data-testid="trades-year-filter"><CalendarDays className="h-3.5 w-3.5 mr-1 text-muted-foreground" /><SelectValue placeholder="Year" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Years</SelectItem>
                <SelectItem value="2026">2026</SelectItem>
                <SelectItem value="2025">2025</SelectItem>
                <SelectItem value="2024">2024</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterCommodity} onValueChange={setFilterCommodity}>
              <SelectTrigger className="w-[160px] shrink-0"><SelectValue placeholder="Commodity" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Commodities</SelectItem>
                {commodities.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterOrigin} onValueChange={setFilterOrigin}>
              <SelectTrigger className="w-[130px] shrink-0"><SelectValue placeholder="Origin" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Origins</SelectItem>
                {origins.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterCountry} onValueChange={setFilterCountry}>
              <SelectTrigger className="w-[130px] shrink-0"><SelectValue placeholder="Country" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Countries</SelectItem>
                {uniqueCountries.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterSeller} onValueChange={setFilterSeller}>
              <SelectTrigger className="w-[130px] shrink-0"><SelectValue placeholder="Seller" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sellers</SelectItem>
                {sellers.map(s => <SelectItem key={s.id} value={s.id}>{s.companyCode || s.companyName}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterBuyer} onValueChange={setFilterBuyer}>
              <SelectTrigger className="w-[130px] shrink-0"><SelectValue placeholder="Buyer" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Buyers</SelectItem>
                {buyers.map(b => <SelectItem key={b.id} value={b.id}>{b.companyCode || b.companyName}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterBrokerName} onValueChange={setFilterBrokerName}>
              <SelectTrigger className="w-[140px] shrink-0" data-testid="filter-broker-name"><SelectValue placeholder="Broker Name" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Brokers</SelectItem>
                <SelectItem value="Izzet Alev">Izzet Alev</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterCoBroker} onValueChange={setFilterCoBroker}>
              <SelectTrigger className="w-[140px] shrink-0"><SelectValue placeholder="Co-Broker" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Co-Brokers</SelectItem>
                {uniqueCoBrokers.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Ongoing */}
      <Card id="trades-ongoing" className="border-l-4 border-l-emerald-500 bg-emerald-50/50">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2"><Ship className="h-5 w-5 text-emerald-600" /><CardTitle className="text-emerald-800">Ongoing Contracts</CardTitle><Badge variant="secondary" className="bg-emerald-100 text-emerald-800">{filtered.ongoing.length}</Badge></div>
          <CardDescription className="text-emerald-700">Contracts with vessel details</CardDescription>
        </CardHeader>
        <CardContent>{renderTable(filtered.ongoing, 'No ongoing contracts')}</CardContent>
      </Card>

      {/* Pending */}
      <Card id="trades-pending" className="border-l-4 border-l-amber-400 bg-amber-50/50">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2"><Clock className="h-5 w-5 text-amber-600" /><CardTitle className="text-amber-800">Pending Contracts</CardTitle><Badge variant="secondary" className="bg-amber-100 text-amber-800">{filtered.pending.length}</Badge></div>
          <CardDescription className="text-amber-700">Waiting for vessel nomination</CardDescription>
        </CardHeader>
        <CardContent>{renderTable(filtered.pending, 'No pending contracts')}</CardContent>
      </Card>

      {/* Awaiting Brokerage Payment */}
      {filtered.awaitingBrokerage.length > 0 && (
        <Card id="trades-awaiting-brokerage" className="border-l-4 border-l-orange-400 bg-orange-50/50">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2"><Banknote className="h-5 w-5 text-orange-600" /><CardTitle className="text-orange-800">Awaiting Brokerage Payment</CardTitle><Badge variant="secondary" className="bg-orange-100 text-orange-800">{filtered.awaitingBrokerage.length}</Badge></div>
            <CardDescription className="text-orange-700">Payment received from buyer — pending broker commission payment</CardDescription>
          </CardHeader>
          <CardContent>{renderTable(filtered.awaitingBrokerage, 'No contracts awaiting brokerage', 'brokerage')}</CardContent>
        </Card>
      )}

      {/* Completed */}
      <Card id="trades-completed" className="border-l-4 border-l-slate-400 bg-slate-50/50">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2"><CheckCircle className="h-5 w-5 text-slate-500" /><CardTitle className="text-slate-700">Completed Contracts</CardTitle><Badge variant="secondary" className="bg-slate-200 text-slate-700">{filtered.completed.length}</Badge></div>
          <CardDescription className="text-slate-600">Successfully completed contracts</CardDescription>
        </CardHeader>
        <CardContent>{renderTable(filtered.completed, 'No completed contracts')}</CardContent>
      </Card>

      {/* Washout */}
      <Card className="border-l-4 border-l-amber-500 bg-amber-50/50">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-600" /><CardTitle className="text-amber-800">Washout Contracts</CardTitle><Badge variant="secondary" className="bg-amber-100 text-amber-800">{filtered.washout.length}</Badge></div>
          <CardDescription className="text-amber-700">Contracts settled by washout</CardDescription>
        </CardHeader>
        <CardContent>{renderTable(filtered.washout, 'No washout contracts')}</CardContent>
      </Card>

      {/* Cancelled */}
      <Card className="border-l-4 border-l-red-400 bg-red-50/50">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2"><Ban className="h-5 w-5 text-red-500" /><CardTitle className="text-red-700">Cancelled Contracts</CardTitle><Badge variant="secondary" className="bg-red-100 text-red-700">{filtered.cancelled.length}</Badge></div>
          <CardDescription className="text-red-600">Cancelled or terminated contracts</CardDescription>
        </CardHeader>
        <CardContent>{renderTable(filtered.cancelled, 'No cancelled contracts')}</CardContent>
      </Card>

      {/* Trade Detail Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto [&>button.absolute]:hidden">
          <DialogHeader>
            <div className="flex items-center justify-center gap-3">
              <DialogTitle className="text-2xl">{selectedTrade?.BAContractNumber || selectedTrade?.referenceNumber || 'Trade Details'}</DialogTitle>
              {selectedTrade && <Badge className={TRADE_STATUS_CONFIG[selectedTrade.status]?.color || ''}>{TRADE_STATUS_CONFIG[selectedTrade.status]?.label}</Badge>}
            </div>
          </DialogHeader>
          {selectedTrade && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Contract Information */}
                <div className="border rounded-lg p-6 space-y-4">
                  <h4 className="font-semibold text-base">Contract Information</h4>
                  <div className="space-y-5 text-base">
                    <div className="flex justify-between"><span className="text-muted-foreground">DealSpot Ref. No</span><span className="font-medium">{selectedTrade.referenceNumber || '-'}</span></div>
                    <hr />
                    <div className="flex justify-between"><span className="text-muted-foreground">Seller Sales Contract No.</span><span className="font-medium">{selectedTrade.sellerContractNumber || selectedTrade.BAContractNumber || selectedTrade.contractNumber || '-'}</span></div>
                    <hr />
                    <div className="flex justify-between"><span className="text-muted-foreground">Contract Date</span><span className="font-medium">{formatDate(selectedTrade.contractDate)}</span></div>
                    <hr />
                    <div className="flex justify-between"><span className="text-muted-foreground">Commodity</span><span className="font-medium">{selectedTrade.commodityName || '-'}</span></div>
                    <hr />
                    <div className="flex justify-between"><span className="text-muted-foreground">Origin</span><span className="font-medium">{selectedTrade.originName || '-'}</span></div>
                    <hr />
                    <div className="flex justify-between"><span className="text-muted-foreground">Quantity</span><span className="font-medium">{selectedTrade.quantity ? `${selectedTrade.quantity.toLocaleString()} MT` : '-'}</span></div>
                    <hr />
                    <div className="flex justify-between"><span className="text-muted-foreground">Price</span><span className="font-medium">{(() => {
                      const price = getDischargePortPrice(selectedTrade);
                      return price ? `${selectedTrade.currency || 'USD'} ${price.toLocaleString()}/MT` : '-';
                    })()}</span></div>
                  </div>
                </div>
                {/* Trade Terms */}
                <div className="border rounded-lg p-6 space-y-4">
                  <h4 className="font-semibold text-base">Trade Terms</h4>
                  <div className="space-y-5 text-base">
                    <div className="flex justify-between"><span className="text-muted-foreground">Seller</span><span className="font-medium">{selectedTrade.sellerCode || selectedTrade.sellerName || '-'}</span></div>
                    <hr />
                    <div className="flex justify-between"><span className="text-muted-foreground">Buyer</span><span className="font-medium">{selectedTrade.buyerCode || selectedTrade.buyerName || '-'}</span></div>
                    <hr />
                    <div className="flex justify-between"><span className="text-muted-foreground">Broker</span><span className="font-medium">{selectedTrade.brokerCode || selectedTrade.brokerName || '-'}</span></div>
                    <hr />
                    <div className="flex justify-between"><span className="text-muted-foreground">Delivery Term</span><span className="font-medium">{(() => { const port = selectedTrade.basePortName || selectedTrade.loadingPortName || ''; const term = selectedTrade.deliveryTerm || ''; if (port && port.toLowerCase().startsWith(term.toLowerCase())) return port; return [term, port].filter(Boolean).join(' ') || '-'; })()}</span></div>
                    <hr />
                    <div className="flex justify-between"><span className="text-muted-foreground">Payment Terms</span><span className="font-medium">{selectedTrade.paymentTerms || '-'}</span></div>
                    <hr />
                    <div className="flex justify-between"><span className="text-muted-foreground">Shipment Period</span><span className="font-medium">{formatShipmentDate(selectedTrade.shipmentWindowStart) && formatShipmentDate(selectedTrade.shipmentWindowEnd) ? `${formatShipmentDate(selectedTrade.shipmentWindowStart)} - ${formatShipmentDate(selectedTrade.shipmentWindowEnd)}` : '-'}</span></div>
                    <hr />
                    <div className="flex justify-between"><span className="text-muted-foreground">Vessel</span><span className="font-medium uppercase">{selectedTrade.vesselName || '-'}</span></div>
                  </div>
                </div>
              </div>
              {selectedTrade.notes && (
                <div className="border rounded-lg p-4 text-sm">
                  <h4 className="font-semibold text-sm mb-2">Notes</h4>
                  <p className="text-muted-foreground">{selectedTrade.notes}</p>
                </div>
              )}
              {(selectedTrade.blNumber || selectedTrade.blDate || selectedTrade.blQuantity || selectedTrade.sellerSurveyor || selectedTrade.buyerSurveyor || selectedTrade.dischargeQuantity) && (
                <div className="border rounded-lg p-6 space-y-4">
                  <h4 className="font-semibold text-base">B/L Details</h4>
                  <div className="grid grid-cols-2 gap-x-8 gap-y-5 text-base">
                    <div className="flex justify-between"><span className="text-muted-foreground">B/L Number</span><span className="font-medium">{selectedTrade.blNumber || '-'}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">B/L Date</span><span className="font-medium">{selectedTrade.blDate || '-'}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">B/L Quantity</span><span className="font-medium">{selectedTrade.blQuantity ? `${Number(selectedTrade.blQuantity).toLocaleString()} MT` : '-'}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Discharge Quantity</span><span className="font-medium">{selectedTrade.dischargeQuantity ? `${Number(selectedTrade.dischargeQuantity).toLocaleString()} MT` : '-'}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Load Port</span><span className="font-medium">{selectedTrade.loadingPortName || selectedTrade.basePortName || '-'}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Discharge Port</span><span className="font-medium">{selectedTrade.dischargePortName || '-'}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Seller Surveyor</span><span className="font-medium">{selectedTrade.sellerSurveyor || '-'}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Buyer Surveyor</span><span className="font-medium">{selectedTrade.buyerSurveyor || '-'}</span></div>
                  </div>
                </div>
              )}
              <div className="flex justify-end pt-4">
                <Button variant="outline" onClick={() => setModalOpen(false)}>Close</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Entity Trades Dialog */}
      <Dialog open={!!entityFilter} onOpenChange={(open) => { if (!open) setEntityFilter(null); }}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          {entityFilter && (
            <>
              <DialogHeader>
                <DialogTitle className="capitalize">{entityFilter.type}: {entityFilter.code || entityFilter.name} — All Trades ({entityTrades.length})</DialogTitle>
              </DialogHeader>
              <div className="overflow-x-auto border rounded-lg">
                <Table className="trade-table">
                  <TableHeader><TableRow className="bg-muted/50">
                    <TableHead>Status</TableHead><TableHead>Contract</TableHead><TableHead>Commodity</TableHead>
                    <TableHead>Seller</TableHead><TableHead>Buyer</TableHead><TableHead>Quantity</TableHead>
                    <TableHead>Price/MT</TableHead><TableHead>Vessel</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {entityTrades.length === 0 ? <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">No trades found</TableCell></TableRow> :
                    entityTrades.map(t => {
                      const sc = TRADE_STATUS_CONFIG[t.status] || {};
                      return (
                        <TableRow key={t.id} className="cursor-pointer hover:bg-muted/50" onClick={() => { setEntityFilter(null); navigate(`/trades/${t.id}`); }}>
                          <TableCell><Badge className={`text-xs ${sc.color || 'bg-muted'}`}>{sc.label || t.status}</Badge></TableCell>
                          <TableCell className="font-medium text-sm">{t.BAContractNumber || t.referenceNumber}</TableCell>
                          <TableCell className="text-sm max-w-[150px]">{t.commodityName || '-'}</TableCell>
                          <TableCell className="text-sm">{t.sellerCode || t.sellerName || '-'}</TableCell>
                          <TableCell className="text-sm">{t.buyerCode || t.buyerName || '-'}</TableCell>
                          <TableCell className="text-sm">{t.quantity ? `${t.quantity.toLocaleString()} Mts` : '-'}</TableCell>
                          <TableCell className="text-sm">{(() => {
                            const price = getDischargePortPrice(t);
                            return price ? `$${price.toLocaleString()}` : '-';
                          })()}</TableCell>
                          <TableCell className="text-sm">{t.vesselName || '-'}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Broker Commission Dialog */}
      <Dialog open={brokerCommDialog.open} onOpenChange={(open) => !open && setBrokerCommDialog({ open: false, tradeId: null, newStatus: null })}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center text-lg">Broker Commission</DialogTitle>
          </DialogHeader>
          <p className="text-center text-muted-foreground py-4">
            Should broker commissions be generated for this contract?
          </p>
          <div className="flex justify-center gap-4 pb-2">
            <Button variant="outline" className="min-w-[100px]" onClick={() => handleBrokerCommDecision(false)}>No</Button>
            <Button className="min-w-[100px]" onClick={() => handleBrokerCommDecision(true)}>Yes</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
