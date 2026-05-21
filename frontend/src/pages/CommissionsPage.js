import { useState, useEffect, useMemo } from 'react';
import api from '../lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Checkbox } from '../components/ui/checkbox';
import { TRADE_STATUS_CONFIG } from '../lib/constants';
import { DollarSign, Clock, CheckCircle, Search, Loader2, FileDown, Building2, Pencil, CalendarDays, Filter, X, Trash2 } from 'lucide-react';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Calendar } from '../components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { cn } from '../lib/utils';
import { format } from 'date-fns';

export default function CommissionsPage() {
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterSeller, setFilterSeller] = useState('all');
  const [filterBuyer, setFilterBuyer] = useState('all');
  const [filterCommodity, setFilterCommodity] = useState('all');
  const [filterOrigin, setFilterOrigin] = useState('all');
  const [filterDestination, setFilterDestination] = useState('all');
  const [bankAccounts, setBankAccounts] = useState([]);
  const [selectedBankIds, setSelectedBankIds] = useState([]);
  const [editDialog, setEditDialog] = useState({ open: false, trade: null });
  const [editForm, setEditForm] = useState({ brokeragePerMT: 0, brokerageCurrency: 'USD' });
  const [bankDialogOpen, setBankDialogOpen] = useState(false);
  const [pendingInvoice, setPendingInvoice] = useState(null);
  const [invoiceEditDialog, setInvoiceEditDialog] = useState({ open: false, trade: null });
  const [invoiceEditForm, setInvoiceEditForm] = useState({ invoiceNo: '', invoiceDate: '', invoiceCurrency: 'USD', exchangeRate: '' });

  const openEdit = (t) => {
    setEditForm({ brokeragePerMT: t.brokeragePerMT || 0, brokerageCurrency: t.brokerageCurrency || 'USD' });
    setEditDialog({ open: true, trade: t });
  };

  const saveEdit = async () => {
    if (!editDialog.trade) return;
    try {
      const res = await api.put(`/api/trades/${editDialog.trade.id}`, {
        brokeragePerMT: parseFloat(editForm.brokeragePerMT) || 0,
        brokerageCurrency: editForm.brokerageCurrency,
      });
      setTrades(prev => prev.map(t => t.id === editDialog.trade.id ? { ...t, ...res.data } : t));
      toast.success('Brokerage updated');
      setEditDialog({ open: false, trade: null });
    } catch { toast.error('Failed to update'); }
  };

  useEffect(() => {
    const fetch = async () => {
      try {
        const [tradesRes, banksRes] = await Promise.all([api.get('/api/trades'), api.get('/api/bank-accounts')]);
        setTrades(tradesRes.data);
        setBankAccounts(banksRes.data);
        if (banksRes.data.length > 0) {
          const dskUsd = banksRes.data.find(b => b.iban === 'BG47STSA93000029195856') || banksRes.data.find(b => b.bankName?.includes('DSK') && b.currency === 'USD');
          setSelectedBankIds(dskUsd ? [dskUsd.id] : [banksRes.data[0].id]);
        }
      } catch (err) { console.error(err); } finally { setLoading(false); }
    };
    fetch();
  }, []);

  const categorized = useMemo(() => {
    const withCommission = trades.filter(t => 
      (t.buyerPaymentDate && !['cancelled', 'washout'].includes(t.status)) ||
      (['cancelled', 'washout'].includes(t.status) && t.generateBrokerCommission)
    );
    return {
      pending: withCommission.filter(t => !t.invoicePaid),
      paid: withCommission.filter(t => t.invoicePaid),
    };
  }, [trades]);

  const filterOptions = useMemo(() => {
    const unique = (arr) => [...new Set(arr)].filter(Boolean).sort();
    return {
      sellers: unique(trades.map(t => t.sellerCode || t.sellerName).filter(Boolean)),
      buyers: unique(trades.map(t => t.buyerCode || t.buyerName).filter(Boolean)),
      commodities: unique(trades.map(t => t.commodityName).filter(Boolean)),
      origins: unique(trades.map(t => t.originName).filter(Boolean)),
      destinations: unique(trades.map(t => t.dischargePortCountry).filter(Boolean)),
    };
  }, [trades]);

  const applyFilters = (list) => {
    let result = list;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(t => (t.referenceNumber||'').toLowerCase().includes(q) || (t.commodityName||'').toLowerCase().includes(q) || (t.sellerCode||t.sellerName||'').toLowerCase().includes(q) || (t.buyerCode||t.buyerName||'').toLowerCase().includes(q));
    }
    if (filterSeller !== 'all') result = result.filter(t => (t.sellerCode || t.sellerName) === filterSeller);
    if (filterBuyer !== 'all') result = result.filter(t => (t.buyerCode || t.buyerName) === filterBuyer);
    if (filterCommodity !== 'all') result = result.filter(t => t.commodityName === filterCommodity);
    if (filterOrigin !== 'all') result = result.filter(t => t.originName === filterOrigin);
    if (filterDestination !== 'all') result = result.filter(t => t.dischargePortCountry === filterDestination);
    return result;
  };

  const hasActiveFilters = filterSeller !== 'all' || filterBuyer !== 'all' || filterCommodity !== 'all' || filterOrigin !== 'all' || filterDestination !== 'all';
  const clearAllFilters = () => { setFilterSeller('all'); setFilterBuyer('all'); setFilterCommodity('all'); setFilterOrigin('all'); setFilterDestination('all'); setSearch(''); };

  const stats = useMemo(() => {
    const calcComm = (t) => (t.blQuantity || t.quantity || 0) * (t.brokeragePerMT || 0);
    const filteredAll = applyFilters(trades).filter(t =>
      (t.buyerPaymentDate && !['cancelled', 'washout'].includes(t.status)) ||
      (['cancelled', 'washout'].includes(t.status) && t.generateBrokerCommission)
    );
    const filteredPending = filteredAll.filter(t => !t.invoicePaid);
    const filteredPaid = filteredAll.filter(t => t.invoicePaid);
    return {
      total: filteredAll.reduce((s, t) => s + calcComm(t), 0),
      pending: filteredPending.reduce((s, t) => s + calcComm(t), 0),
      paid: filteredPaid.reduce((s, t) => s + calcComm(t), 0),
      pendingCount: filteredPending.length,
      paidCount: filteredPaid.length,
    };
  }, [trades, search, filterSeller, filterBuyer, filterCommodity, filterOrigin, filterDestination]);

  const fmt = (n, cur = 'USD') => `${new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n)} ${cur}`;
  const fmtQty = (q) => `${(q||0).toLocaleString()} Mts`;
  const getBlCommission = (t) => {
    const base = (t.blQuantity || t.quantity || 0) * (t.brokeragePerMT || 0);
    if (t.invoiceCurrency === 'EUR' && t.exchangeRate) return base * t.exchangeRate;
    return base;
  };
  const getCommCurrency = (t) => t.invoiceCurrency || 'USD';

  const toggleInvoiceStatus = async (tradeId, currentPaid) => {
    if (!currentPaid) {
      const trade = trades.find(t => t.id === tradeId);
      if (!trade?.buyerPaymentDate) {
        toast.error('Set payment date before marking as PAID');
        return;
      }
    }
    try {
      await api.put(`/api/trades/${tradeId}`, { invoicePaid: !currentPaid });
      setTrades(prev => prev.map(t => t.id === tradeId ? { ...t, invoicePaid: !currentPaid } : t));
      toast.success(!currentPaid ? 'Marked as PAID' : 'Marked as PENDING');
    } catch { toast.error('Failed to update status'); }
  };

  const savePaymentDate = async (tradeId, dateStr) => {
    try {
      await api.put(`/api/trades/${tradeId}`, { buyerPaymentDate: dateStr, invoicePaid: true });
      setTrades(prev => prev.map(t => t.id === tradeId ? { ...t, buyerPaymentDate: dateStr, invoicePaid: true } : t));
      toast.success('Payment date saved & marked as PAID');
    } catch { toast.error('Failed to save payment date'); }
  };

  const clearPaymentDate = async (tradeId) => {
    try {
      await api.put(`/api/trades/${tradeId}`, { buyerPaymentDate: '', invoicePaid: false });
      setTrades(prev => prev.map(t => t.id === tradeId ? { ...t, buyerPaymentDate: '', invoicePaid: false } : t));
      toast.success('Payment date cleared & marked as PENDING');
    } catch { toast.error('Failed to clear payment date'); }
  };

  const openInvoiceEdit = (t) => {
    const autoNo = `COMM-${t.pirContractNumber || t.referenceNumber || ''}`;
    const autoDate = t.buyerPaymentDate || '';
    setInvoiceEditForm({
      invoiceNo: t.invoiceNo || autoNo,
      invoiceDate: t.invoiceDate || autoDate,
      invoiceCurrency: t.invoiceCurrency || 'USD',
      exchangeRate: t.exchangeRate || '',
    });
    setInvoiceEditDialog({ open: true, trade: t });
  };

  const saveInvoiceEdit = async () => {
    if (!invoiceEditDialog.trade) return;
    try {
      const data = {
        invoiceNo: invoiceEditForm.invoiceNo,
        invoiceDate: invoiceEditForm.invoiceDate,
        invoiceCurrency: invoiceEditForm.invoiceCurrency,
        exchangeRate: invoiceEditForm.exchangeRate ? parseFloat(invoiceEditForm.exchangeRate) : null,
      };
      await api.put(`/api/trades/${invoiceEditDialog.trade.id}`, data);
      setTrades(prev => prev.map(t => t.id === invoiceEditDialog.trade.id ? { ...t, ...data } : t));
      toast.success('Invoice updated');
      setInvoiceEditDialog({ open: false, trade: null });
    } catch { toast.error('Failed to update invoice'); }
  };

  const deleteInvoice = async (tradeId) => {
    try {
      await api.put(`/api/trades/${tradeId}`, { invoiceNo: '', invoiceDate: '', invoiceCurrency: 'USD', exchangeRate: null, invoicePaid: false, buyerPaymentDate: '' });
      setTrades(prev => prev.map(t => t.id === tradeId ? { ...t, invoiceNo: '', invoiceDate: '', invoiceCurrency: 'USD', exchangeRate: null, invoicePaid: false, buyerPaymentDate: '' } : t));
      toast.success('Invoice deleted');
    } catch { toast.error('Failed to delete invoice'); }
  };

  const openInvoiceDialog = (tradeId, account) => {
    setPendingInvoice({ tradeId, account: account || 'seller' });
    setBankDialogOpen(true);
  };

  const toggleBankId = (id) => {
    setSelectedBankIds(prev => prev.includes(id) ? prev.filter(b => b !== id) : [...prev, id]);
  };

  const downloadInvoice = async () => {
    if (!pendingInvoice) return;
    const { tradeId, account } = pendingInvoice;
    try {
      const bankParam = selectedBankIds.length > 0 ? `&bankIds=${selectedBankIds.join(',')}` : '';
      const res = await api.get(`/api/commission-invoice/${tradeId}?account=${account}${bankParam}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `Commission_Invoice_${tradeId}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success('Invoice downloaded');
    } catch (err) {
      toast.error('Failed to generate invoice');
    }
    setBankDialogOpen(false);
    setPendingInvoice(null);
  };

  const renderTable = (list, empty, showInvoice = false) => {
    const filtered = applyFilters(list).sort((a, b) => {
      const dateA = a.buyerPaymentDate || '';
      const dateB = b.buyerPaymentDate || '';
      if (!dateA && !dateB) return 0;
      if (!dateA) return 1;
      if (!dateB) return -1;
      // Parse dd/MM/yyyy for comparison
      const [dA, mA, yA] = dateA.split('/');
      const [dB, mB, yB] = dateB.split('/');
      return (yB + mB + dB).localeCompare(yA + mA + dA);
    });
    if (filtered.length === 0) return <div className="text-center py-6 text-muted-foreground text-sm">{empty}</div>;
    return (
      <div className="overflow-x-auto border rounded-lg">
        <Table className="trade-table">
          <TableHeader><TableRow className="bg-muted/50">
            <TableHead>Status</TableHead><TableHead>Invoice Date</TableHead><TableHead>Invoice No</TableHead><TableHead>Contract No</TableHead><TableHead>Commodity</TableHead>
            <TableHead className="text-center">Seller<hr className="my-0.5 border-muted-foreground/30"/>Buyer</TableHead>
            <TableHead className="text-center">Vessel<hr className="my-0.5 border-muted-foreground/30"/>B/L Qty</TableHead>
            <TableHead className="text-center">Loading Port<hr className="my-0.5 border-muted-foreground/30"/>Discharge Port</TableHead>
            <TableHead>Rate/MT<hr className="my-0.5 border-muted-foreground/30"/>Commission</TableHead>
            {showInvoice && <TableHead className="text-center">Invoice</TableHead>}
            <TableHead className="text-center">Payment Date</TableHead>
            <TableHead className="text-center">Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filtered.map((t, idx) => {
              const invoiceStatus = t.invoicePaid ? 'PAID' : 'PENDING';
              const invDate = t.invoiceDate || t.buyerPaymentDate || t.cancelledDate || '-';
              const invNo = t.invoiceNo || `COMM-${t.pirContractNumber || t.referenceNumber || ''}`;
              const commCur = getCommCurrency(t);
              return (
              <TableRow key={t.id} className={idx % 2 === 1 ? 'bg-muted/30' : ''}>
                <TableCell>
                  <div className="flex flex-col items-center gap-1">
                    <Badge className={`cursor-pointer select-none ${invoiceStatus === 'PAID' ? 'bg-green-100 text-green-800 border-green-200 hover:bg-green-200' : 'bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-200'}`} onClick={() => toggleInvoiceStatus(t.id, t.invoicePaid)} data-testid={`toggle-invoice-status-${t.id}`}>{invoiceStatus}</Badge>
                    {t.status === 'washout' && <Badge className="bg-purple-100 text-purple-800 border-purple-200 text-[10px] px-1.5">WASHOUT</Badge>}
                    {t.status === 'cancelled' && <Badge className="bg-red-100 text-red-800 border-red-200 text-[10px] px-1.5">CANCELLED</Badge>}
                  </div>
                </TableCell>
                <TableCell className="text-sm whitespace-nowrap">{invDate}</TableCell>
                <TableCell className="text-sm max-w-[120px]"><div className="break-all">{invNo}</div></TableCell>
                <TableCell className="font-medium text-primary"><Link to={`/trades/${t.id}`}>{(() => { const cn = t.pirContractNumber || t.referenceNumber || ''; return cn.length > 10 ? <>{cn.substring(0, cn.lastIndexOf(' ') > 0 ? cn.lastIndexOf(' ') : Math.ceil(cn.length/2))}<br/>{cn.substring(cn.lastIndexOf(' ') > 0 ? cn.lastIndexOf(' ') + 1 : Math.ceil(cn.length/2))}</> : cn; })()}</Link></TableCell>
                <TableCell className="text-sm max-w-[160px]">
                  <div>{t.commodityName||'-'}</div>
                </TableCell>
                <TableCell className="text-sm">
                  <div>{t.sellerCode||t.sellerName||'-'}</div>
                  <hr className="my-0.5 border-muted-foreground/20"/>
                  <div>{t.buyerCode||t.buyerName||'-'}</div>
                </TableCell>
                <TableCell className="text-sm">
                  <div className="font-bold">{t.vesselName||'-'}</div>
                  <hr className="my-0.5 border-muted-foreground/20"/>
                  <div>{t.blQuantity ? `${Number(t.blQuantity).toLocaleString()} Mts` : fmtQty(t.quantity)}</div>
                </TableCell>
                <TableCell className="text-sm whitespace-nowrap">
                  <div>{t.loadingPortName ? `${t.loadingPortName}${t.loadingPortCountry ? ', ' + t.loadingPortCountry : ''}` : '-'}</div>
                  <hr className="my-0.5 border-muted-foreground/20"/>
                  <div>{t.dischargePortName ? `${t.dischargePortName}${t.dischargePortCountry ? ', ' + t.dischargePortCountry : ''}` : '-'}</div>
                </TableCell>
                <TableCell className="text-sm">
                  <div className="cursor-pointer hover:text-primary hover:underline" onClick={() => openEdit(t)} data-testid={`edit-rate-${t.id}`}>{t.brokeragePerMT||0} {t.brokerageCurrency || 'USD'}</div>
                  <hr className="my-0.5 border-muted-foreground/20"/>
                  <div className="font-medium">{fmt(getBlCommission(t), commCur)}</div>
                </TableCell>
                {showInvoice && <TableCell className="text-center">
                  <Button variant="outline" size="sm" onClick={() => openInvoiceDialog(t.id, t.brokerageAccount)} data-testid={`download-invoice-${t.id}`}>
                    <FileDown className="h-3.5 w-3.5 mr-1" />PDF
                  </Button>
                </TableCell>}
                <TableCell className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="sm" className={cn('text-xs whitespace-nowrap', !t.buyerPaymentDate && 'text-muted-foreground')}>
                          <CalendarDays className="h-3.5 w-3.5 mr-1" />
                          {t.buyerPaymentDate || 'Set date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="end">
                        <Calendar mode="single" selected={t.buyerPaymentDate ? (() => { try { const [dd,mm,yyyy] = t.buyerPaymentDate.split('/'); return new Date(yyyy, mm-1, dd); } catch { return undefined; } })() : undefined} onSelect={(d) => { if (d) savePaymentDate(t.id, format(d, 'dd/MM/yyyy')); }} initialFocus />
                      </PopoverContent>
                    </Popover>
                    {t.buyerPaymentDate && <button className="text-destructive hover:text-destructive/80 text-xs p-0.5" onClick={() => clearPaymentDate(t.id)} title="Clear date">&times;</button>}
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openInvoiceEdit(t)} title="Edit invoice"><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:text-red-600" onClick={() => deleteInvoice(t.id)} title="Delete invoice"><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            );
            })}
            <TableRow className="bg-muted/30 font-semibold">
              <TableCell />
              <TableCell />
              <TableCell />
              <TableCell />
              <TableCell />
              <TableCell />
              <TableCell />
              <TableCell className="text-right">Total:</TableCell>
              <TableCell className="font-mono">{fmt(filtered.reduce((s,t)=>s+getBlCommission(t),0), filtered.length > 0 ? getCommCurrency(filtered[0]) : 'USD')}</TableCell>
              {showInvoice && <TableCell />}
              <TableCell />
              <TableCell />
            </TableRow>
          </TableBody>
        </Table>
      </div>
    );
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <div></div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Commission</CardTitle><DollarSign className="h-4 w-4 text-primary" /></CardHeader><CardContent><div className="text-2xl font-bold">{fmt(stats.total)}</div></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle><Clock className="h-4 w-4 text-amber-500" /></CardHeader><CardContent><div className="text-2xl font-bold text-amber-600">{fmt(stats.pending)}</div></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Paid</CardTitle><CheckCircle className="h-4 w-4 text-green-500" /></CardHeader><CardContent><div className="text-2xl font-bold text-green-600">{fmt(stats.paid)}</div></CardContent></Card>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="relative w-48">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" data-testid="commission-search" />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Seller</Label>
          <Select value={filterSeller} onValueChange={setFilterSeller}>
            <SelectTrigger className="h-9 w-[160px] text-sm" data-testid="filter-seller"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sellers</SelectItem>
              {filterOptions.sellers.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Buyer</Label>
          <Select value={filterBuyer} onValueChange={setFilterBuyer}>
            <SelectTrigger className="h-9 w-[160px] text-sm" data-testid="filter-buyer"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Buyers</SelectItem>
              {filterOptions.buyers.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Commodity</Label>
          <Select value={filterCommodity} onValueChange={setFilterCommodity}>
            <SelectTrigger className="h-9 w-[160px] text-sm" data-testid="filter-commodity"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Commodities</SelectItem>
              {filterOptions.commodities.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Origin</Label>
          <Select value={filterOrigin} onValueChange={setFilterOrigin}>
            <SelectTrigger className="h-9 w-[140px] text-sm" data-testid="filter-origin"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Origins</SelectItem>
              {filterOptions.origins.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Destination</Label>
          <Select value={filterDestination} onValueChange={setFilterDestination}>
            <SelectTrigger className="h-9 w-[140px] text-sm" data-testid="filter-destination"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Destinations</SelectItem>
              {filterOptions.destinations.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" className="h-9 text-xs text-muted-foreground" onClick={clearAllFilters} data-testid="clear-filters">
            <X className="h-3.5 w-3.5 mr-1" />Clear
          </Button>
        )}
      </div>

      <div className="space-y-4">
        <Card className="border-l-4 border-l-amber-500"><CardHeader className="pb-3"><CardTitle className="text-lg text-amber-800">Pending USD ({applyFilters(categorized.pending.filter(t => (t.invoiceCurrency || 'USD') === 'USD')).length})</CardTitle></CardHeader><CardContent>{renderTable(categorized.pending.filter(t => (t.invoiceCurrency || 'USD') === 'USD'), 'No pending USD invoices', true)}</CardContent></Card>
        {applyFilters(categorized.pending.filter(t => t.invoiceCurrency === 'EUR')).length > 0 && (
          <Card className="border-l-4 border-l-blue-500"><CardHeader className="pb-3"><CardTitle className="text-lg text-blue-800">Pending EUR ({applyFilters(categorized.pending.filter(t => t.invoiceCurrency === 'EUR')).length})</CardTitle></CardHeader><CardContent>{renderTable(categorized.pending.filter(t => t.invoiceCurrency === 'EUR'), 'No pending EUR invoices', true)}</CardContent></Card>
        )}
        <Card className="border-l-4 border-l-green-500"><CardHeader className="pb-3"><CardTitle className="text-lg text-green-800">Paid USD ({applyFilters(categorized.paid.filter(t => (t.invoiceCurrency || 'USD') === 'USD')).length})</CardTitle></CardHeader><CardContent>{renderTable(categorized.paid.filter(t => (t.invoiceCurrency || 'USD') === 'USD'), 'No paid USD invoices', true)}</CardContent></Card>
        {applyFilters(categorized.paid.filter(t => t.invoiceCurrency === 'EUR')).length > 0 && (
          <Card className="border-l-4 border-l-blue-500"><CardHeader className="pb-3"><CardTitle className="text-lg text-blue-800">Paid EUR ({applyFilters(categorized.paid.filter(t => t.invoiceCurrency === 'EUR')).length})</CardTitle></CardHeader><CardContent>{renderTable(categorized.paid.filter(t => t.invoiceCurrency === 'EUR'), 'No paid EUR invoices', true)}</CardContent></Card>
        )}
      </div>

      {/* Bank Account Selection Dialog */}
      <Dialog open={bankDialogOpen} onOpenChange={setBankDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" />Select Bank Account</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label className="text-sm text-muted-foreground">Bank account to include in the invoice:</Label>
            <Select value={selectedBankIds[0] || ''} onValueChange={(v) => setSelectedBankIds([v])}>
              <SelectTrigger data-testid="bank-account-select"><SelectValue placeholder="Select bank account" /></SelectTrigger>
              <SelectContent>
                {bankAccounts.map(bank => (
                  <SelectItem key={bank.id} value={bank.id}>
                    {bank.bankName} {bank.currency ? `(${bank.currency})` : ''} — {bank.iban}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {bankAccounts.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No bank accounts found. Default will be used.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBankDialogOpen(false)}>Cancel</Button>
            <Button onClick={downloadInvoice} data-testid="confirm-download-invoice"><FileDown className="h-4 w-4 mr-1" />Download PDF</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Brokerage Dialog */}
      <Dialog open={editDialog.open} onOpenChange={(o) => !o && setEditDialog({ open: false, trade: null })}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Pencil className="h-4 w-4" />Edit Brokerage</DialogTitle>
          </DialogHeader>
          {editDialog.trade && <p className="text-sm text-muted-foreground">{editDialog.trade.pirContractNumber || editDialog.trade.referenceNumber}</p>}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Rate per MT</Label>
              <Input type="number" step="0.01" value={editForm.brokeragePerMT} onChange={(e) => setEditForm(f => ({ ...f, brokeragePerMT: e.target.value }))} data-testid="edit-brokerage-rate" />
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <Select value={editForm.brokerageCurrency} onValueChange={(v) => setEditForm(f => ({ ...f, brokerageCurrency: v }))}>
                <SelectTrigger data-testid="edit-brokerage-currency"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog({ open: false, trade: null })}>Cancel</Button>
            <Button onClick={saveEdit} data-testid="save-brokerage-btn">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Invoice Dialog */}
      <Dialog open={invoiceEditDialog.open} onOpenChange={(o) => !o && setInvoiceEditDialog({ open: false, trade: null })}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Pencil className="h-4 w-4" />Edit Invoice</DialogTitle>
          </DialogHeader>
          {invoiceEditDialog.trade && <p className="text-sm text-muted-foreground">{invoiceEditDialog.trade.pirContractNumber || invoiceEditDialog.trade.referenceNumber}</p>}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Invoice No</Label>
              <Input value={invoiceEditForm.invoiceNo} onChange={(e) => setInvoiceEditForm(f => ({ ...f, invoiceNo: e.target.value }))} data-testid="edit-invoice-no" />
            </div>
            <div className="space-y-2">
              <Label>Invoice Date</Label>
              <Input value={invoiceEditForm.invoiceDate} onChange={(e) => setInvoiceEditForm(f => ({ ...f, invoiceDate: e.target.value }))} placeholder="dd/mm/yyyy" data-testid="edit-invoice-date" />
            </div>
            <div className="space-y-2">
              <Label>Invoice Currency</Label>
              <Select value={invoiceEditForm.invoiceCurrency} onValueChange={(v) => setInvoiceEditForm(f => ({ ...f, invoiceCurrency: v }))}>
                <SelectTrigger data-testid="edit-invoice-currency"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {invoiceEditForm.invoiceCurrency === 'EUR' && (
              <div className="space-y-2">
                <Label>Exchange Rate (EUR per 1 USD)</Label>
                <Input type="number" step="0.0001" value={invoiceEditForm.exchangeRate} onChange={(e) => setInvoiceEditForm(f => ({ ...f, exchangeRate: e.target.value }))} placeholder="e.g. 0.92" data-testid="edit-exchange-rate" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInvoiceEditDialog({ open: false, trade: null })}>Cancel</Button>
            <Button onClick={saveInvoiceEdit} data-testid="save-invoice-btn">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
