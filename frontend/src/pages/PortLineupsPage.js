import { useState, useEffect, useMemo, useCallback } from 'react';
import { Upload, Ship, Anchor, Calendar, Search, ChevronDown, Loader2, AlertCircle, Clock, X, FileSpreadsheet, Trash2, Download, Eye } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { normalizeTR } from '../lib/utils-tr';
import api from '../lib/api';

const STATUS_COLORS = {
  'RIHTIMDA': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  'DEMIR': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  'DEMİR': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  'AYRILDI': 'bg-slate-100 text-slate-500 dark:bg-slate-800/30 dark:text-slate-400',
};

function parseDateStr(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.trim().split('.');
  if (parts.length === 3) {
    return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  }
  return null;
}

function calcDaysSince(arrivalDateStr, reportDateStr) {
  const arrival = parseDateStr(arrivalDateStr);
  const report = parseDateStr(reportDateStr);
  if (!arrival || !report) return null;
  const diffMs = report - arrival;
  if (diffMs < 0) return null;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

const OP_MAP = { 'TAHLİYE': 'DISCHARGE', 'TAHLIYE': 'DISCHARGE', 'YÜKLEME': 'LOADING', 'YUKLEME': 'LOADING' };

const CARGO_MAP = [
  { keys: ['AYÇİÇEK TOHUMU KÜSPESİ', 'AYÇEKİRDEĞİ KÜSPESİ', 'AYCICEK TOHUMU KUSPESI', 'AYCEKIRDEGI KUSPESI'], en: 'SUNFLOWER MEAL PELLETS' },
  { keys: ['BUĞDAY KEPEĞİ', 'BUGDAY KEPEGI', 'BUGDAY KEPEĞİ'], en: 'WHEAT BRAN PELLETS' },
  { keys: ['SOYA FASÜLYESİ KÜSPESİ', 'SOYA FASULYESI KUSPESI'], en: 'SOYBEAN MEAL' },
  { keys: ['SOYA FASÜLYESİ', 'SOYA FASULYESI'], en: 'SOYBEANS' },
  { keys: ['MISIR GLUTENI', 'MISIR GLUTENİ'], en: 'CORN GLUTEN MEAL' },
  { keys: ['AYÇİÇEK TOHUMU', 'AYCICEK TOHUMU', 'AYÇEKİRDEĞİ TOHUMU'], en: 'SUNFLOWER SEEDS' },
  { keys: ['MELAS (ŞEKER PEKMEZİ)', 'MELAS'], en: 'MOLASSES' },
  { keys: ['AYÇİÇEK YAĞI', 'AYCICEK YAGI'], en: 'SUNFLOWER OIL' },
  { keys: ['KOLZA TOHUMU KÜSPESİ', 'KOLZA TOHUMU KUSPESI'], en: 'CANOLA MEAL' },
  { keys: ['PRİNÇ KEPEĞİ', 'PRINC KEPEGI'], en: 'RICE BRAN' },
  { keys: ['BUĞDAY', 'BUGDAY'], en: 'WHEAT' },
  { keys: ['MISIR'], en: 'CORN' },
];

function translateOp(op) {
  if (!op) return '-';
  return OP_MAP[op.toUpperCase()] || op;
}

function translateCargo(cargo) {
  if (!cargo) return '-';
  const upper = cargo.toUpperCase().trim();
  for (const entry of CARGO_MAP) {
    if (entry.keys.some(k => k.toUpperCase() === upper)) return entry.en;
  }
  return cargo;
}

/* ════════════════════════════════════════════════
   DAILY LINE-UP (existing functionality)
   ════════════════════════════════════════════════ */
function DailyLineUp({ onLastUpdate }) {
  const [dates, setDates] = useState([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [reportData, setReportData] = useState(null);
  const [selectedPort, setSelectedPort] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterLoadPort, setFilterLoadPort] = useState('all');
  const [filterCommodity, setFilterCommodity] = useState('all');
  const [filterBuyer, setFilterBuyer] = useState('all');
  const [filterSeller, setFilterSeller] = useState('all');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [uploadResult, setUploadResult] = useState(null);

  const fetchDates = useCallback(async () => {
    try {
      const res = await api.get('/api/port-lineups/dates');
      setDates(res.data.dates || []);
      if (res.data.dates?.length > 0) {
        if (!selectedDate) setSelectedDate(res.data.dates[0]);
        onLastUpdate?.(res.data.dates[0]);
      }
    } catch { /* No data yet */ }
  }, []);

  useEffect(() => { fetchDates(); }, [fetchDates]);

  useEffect(() => {
    if (!selectedDate) return;
    if (selectedDate === 'ALL') {
      // Load all dates and merge vessels
      setLoading(true); setError('');
      Promise.all(dates.map(d => api.get(`/api/port-lineups/report/${encodeURIComponent(d)}`).then(r => r.data).catch(() => null)))
        .then(results => {
          const allPorts = {};
          results.filter(Boolean).forEach(r => {
            (r.ports || []).forEach(p => {
              if (!allPorts[p.portName]) allPorts[p.portName] = { portName: p.portName, vessels: [] };
              allPorts[p.portName].vessels.push(...p.vessels);
            });
          });
          setReportData({ reportDate: 'ALL', ports: Object.values(allPorts) });
          setSelectedPort('ALL');
        })
        .catch(() => setError('Failed to load reports'))
        .finally(() => setLoading(false));
      return;
    }
    setLoading(true);
    setError('');
    api.get(`/api/port-lineups/report/${encodeURIComponent(selectedDate)}`)
      .then(res => { setReportData(res.data); setSelectedPort('ALL'); })
      .catch(() => setError('Failed to load report data'))
      .finally(() => setLoading(false));
  }, [selectedDate, dates]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setError(''); setUploadResult(null);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await api.post('/api/port-lineups/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000 });
      setUploadResult(res.data);
      await fetchDates();
      if (res.data.dates?.length > 0) setSelectedDate(res.data.dates[0]);
    } catch (err) { setError(err.response?.data?.detail || 'Upload failed'); }
    finally { setUploading(false); e.target.value = ''; }
  };

  const currentPortData = useMemo(() => {
    if (!reportData) return null;
    if (selectedPort === 'ALL') {
      return { portName: 'ALL', vessels: (reportData.ports || []).flatMap(p => p.vessels) };
    }
    return reportData.ports?.find(p => p.portName === selectedPort) || null;
  }, [reportData, selectedPort]);

  const filterOptions = useMemo(() => {
    if (!currentPortData) return { loadPorts: [], commodities: [], buyers: [], sellers: [] };
    const lp = new Set(), cm = new Set(), bu = new Set(), se = new Set();
    currentPortData.vessels.forEach(v => {
      if (v.loadingPort) lp.add(v.loadingPort.trim());
      if (v.cargo) cm.add(translateCargo(v.cargo));
      if (v.buyer) bu.add(v.buyer.trim());
      if (v.seller) se.add(v.seller.trim());
    });
    return {
      loadPorts: [...lp].sort((a, b) => a.localeCompare(b, 'tr')),
      commodities: [...cm].sort((a, b) => a.localeCompare(b)),
      buyers: [...bu].sort((a, b) => a.localeCompare(b, 'tr')),
      sellers: [...se].sort((a, b) => a.localeCompare(b, 'tr')),
    };
  }, [currentPortData]);

  const filteredVessels = useMemo(() => {
    if (!currentPortData) return [];
    const term = normalizeTR(searchTerm);
    let result = currentPortData.vessels;
    if (term) {
      result = result.filter(v =>
        normalizeTR(v.vesselName).includes(term) || normalizeTR(v.loadingPort).includes(term) ||
        normalizeTR(v.cargo).includes(term) || normalizeTR(v.buyer).includes(term) || normalizeTR(v.seller).includes(term)
      );
    }
    if (filterLoadPort !== 'all') result = result.filter(v => v.loadingPort?.trim() === filterLoadPort);
    if (filterCommodity !== 'all') result = result.filter(v => translateCargo(v.cargo) === filterCommodity);
    if (filterBuyer !== 'all') result = result.filter(v => v.buyer?.trim() === filterBuyer);
    if (filterSeller !== 'all') result = result.filter(v => v.seller?.trim() === filterSeller);
    return [...result].sort((a, b) => {
      const daysA = calcDaysSince(a.arrivalDate, selectedDate);
      const daysB = calcDaysSince(b.arrivalDate, selectedDate);
      if (daysA === null && daysB === null) return 0;
      if (daysA === null) return 1;
      if (daysB === null) return -1;
      return daysA - daysB;
    });
  }, [currentPortData, searchTerm, selectedDate, filterLoadPort, filterCommodity, filterBuyer, filterSeller]);

  const vesselSummary = useMemo(() => {
    if (!filteredVessels.length) return [];
    const grouped = {};
    filteredVessels.forEach(v => {
      const key = v.vesselName || '(unnamed)';
      if (!grouped[key]) grouped[key] = { ...v, totalTonnage: v.blTonnage || 0, rowCount: 1, rows: [v] };
      else { grouped[key].totalTonnage += (v.blTonnage || 0); grouped[key].rowCount += 1; grouped[key].rows.push(v); }
    });
    return Object.values(grouped);
  }, [filteredVessels]);

  const portVesselCounts = useMemo(() => {
    if (!reportData) return {};
    const counts = {};
    let allTotal = 0;
    reportData.ports?.forEach(p => {
      const uniqueVessels = new Set(p.vessels.map(v => v.vesselName).filter(Boolean));
      counts[p.portName] = uniqueVessels.size;
      allTotal += uniqueVessels.size;
    });
    counts['ALL'] = allTotal;
    return counts;
  }, [reportData]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Daily port report summary from Fey Shipping</p>
        <label className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors ${uploading ? 'bg-muted text-muted-foreground cursor-wait' : 'bg-[#1A5276] text-white hover:bg-[#15632F]'}`} data-testid="upload-daily-button">
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {uploading ? 'Uploading...' : 'Upload Report'}
          <input type="file" accept=".xlsx,.xls" onChange={handleUpload} className="hidden" disabled={uploading} />
        </label>
      </div>

      {uploadResult && (
        <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3 text-sm text-emerald-800 dark:text-emerald-200">
          {uploadResult.message} - {uploadResult.totalVessels} vessel records across {uploadResult.totalPorts} port sections
        </div>
      )}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />{error}
        </div>
      )}

      {dates.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Ship className="w-12 h-12 text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground font-medium">No port reports uploaded yet</p>
          <p className="text-sm text-muted-foreground/70 mt-1">Upload an Excel report to get started</p>
        </div>
      )}

      {dates.length > 0 && (
        <>
          {/* Date selector + Filters */}
          <div className="flex flex-nowrap items-center gap-2 overflow-x-auto">
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <select value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="pl-9 pr-8 py-2 bg-card border border-border rounded-lg text-sm appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#1A5276]/30 min-w-[150px]" data-testid="date-selector">
                <option value="ALL">All Dates</option>
                {dates.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            </div>
            <div className="relative max-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input type="text" placeholder="Search vessels..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-9 pr-3 py-2 bg-card border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A5276]/30" data-testid="vessel-search-input" />
            </div>
            <div className="relative">
              <select value={filterLoadPort} onChange={e => setFilterLoadPort(e.target.value)} className="pl-3 pr-7 py-2 bg-card border border-border rounded-lg text-sm appearance-none cursor-pointer focus:outline-none min-w-[120px]">
                <option value="all">All Load Ports</option>
                {filterOptions.loadPorts.map(lp => <option key={lp} value={lp}>{lp}</option>)}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            </div>
            <div className="relative">
              <select value={filterCommodity} onChange={e => setFilterCommodity(e.target.value)} className="pl-3 pr-7 py-2 bg-card border border-border rounded-lg text-sm appearance-none cursor-pointer focus:outline-none min-w-[130px]">
                <option value="all">All Commodities</option>
                {filterOptions.commodities.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            </div>
            <div className="relative">
              <select value={filterBuyer} onChange={e => setFilterBuyer(e.target.value)} className="pl-3 pr-7 py-2 bg-card border border-border rounded-lg text-sm appearance-none cursor-pointer focus:outline-none min-w-[120px]">
                <option value="all">All Buyers</option>
                {filterOptions.buyers.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            </div>
            <div className="relative">
              <select value={filterSeller} onChange={e => setFilterSeller(e.target.value)} className="pl-3 pr-7 py-2 bg-card border border-border rounded-lg text-sm appearance-none cursor-pointer focus:outline-none min-w-[120px]">
                <option value="all">All Sellers</option>
                {filterOptions.sellers.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            </div>
            {(searchTerm || filterLoadPort !== 'all' || filterCommodity !== 'all' || filterBuyer !== 'all' || filterSeller !== 'all') && (
              <button onClick={() => { setSearchTerm(''); setFilterLoadPort('all'); setFilterCommodity('all'); setFilterBuyer('all'); setFilterSeller('all'); }} className="flex items-center gap-1 px-2.5 py-2 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors whitespace-nowrap">
                <X className="w-3.5 h-3.5" />Clear
              </button>
            )}
          </div>

          {/* Port tabs */}
          {reportData && (
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin" data-testid="port-tabs">
              <button onClick={() => { setSelectedPort('ALL'); setSearchTerm(''); setFilterLoadPort('all'); setFilterCommodity('all'); setFilterBuyer('all'); setFilterSeller('all'); }} className={`flex-shrink-0 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${selectedPort === 'ALL' ? 'bg-[#1A5276] text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`} data-testid="port-tab-all">
                ALL<span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] ${selectedPort === 'ALL' ? 'bg-white/20 text-white' : 'bg-background text-muted-foreground'}`}>{portVesselCounts['ALL'] || 0}</span>
              </button>
              {reportData.ports?.slice().sort((a, b) => {
                const countA = new Set(a.vessels.map(v => v.vesselName).filter(Boolean)).size;
                const countB = new Set(b.vessels.map(v => v.vesselName).filter(Boolean)).size;
                return countB - countA;
              }).map(port => (
                <button key={port.portName} onClick={() => { setSelectedPort(port.portName); setSearchTerm(''); setFilterLoadPort('all'); setFilterCommodity('all'); setFilterBuyer('all'); setFilterSeller('all'); }} className={`flex-shrink-0 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${selectedPort === port.portName ? 'bg-[#1A5276] text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
                  {port.portName}<span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] ${selectedPort === port.portName ? 'bg-white/20 text-white' : 'bg-background text-muted-foreground'}`}>{portVesselCounts[port.portName] || 0}</span>
                </button>
              ))}
            </div>
          )}

          {loading && <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}

          {!loading && currentPortData && (
            <div className="overflow-x-auto border rounded-lg" data-testid="vessel-table-container">
              <Table className="trade-table">
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-center">Arrival</TableHead>
                    <TableHead className="text-center">Vessel</TableHead>
                    <TableHead className="text-center">Loading Port</TableHead>
                    <TableHead className="text-center">Days</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-center">Op.</TableHead>
                    <TableHead className="text-center">Commodity</TableHead>
                    <TableHead className="text-center">B/L Tonnage</TableHead>
                    <TableHead className="text-center">Buyer</TableHead>
                    <TableHead className="text-center">Seller</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredVessels.length === 0 ? (
                    <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">{searchTerm ? 'No vessels match your search' : 'No vessels in this port'}</TableCell></TableRow>
                  ) : (() => {
                    let vesselColorIndex = 0;
                    let lastVessel = null;
                    const vesselGroupMap = {};
                    filteredVessels.forEach(v => {
                      const name = v.vesselName || '(unnamed)';
                      if (name !== lastVessel) { if (lastVessel !== null) vesselColorIndex++; lastVessel = name; }
                      if (!(name in vesselGroupMap)) vesselGroupMap[name] = vesselColorIndex;
                    });
                    return filteredVessels.map((v, i) => {
                      const days = calcDaysSince(v.arrivalDate, selectedDate);
                      const statusClass = STATUS_COLORS[v.status?.toUpperCase()] || 'bg-muted text-muted-foreground';
                      const groupIdx = vesselGroupMap[v.vesselName || '(unnamed)'] || 0;
                      const isAlt = groupIdx % 2 === 1;
                      return (
                        <TableRow key={i} className={isAlt ? 'bg-muted/30' : ''}>
                          <TableCell className="text-center text-muted-foreground whitespace-nowrap">{v.arrivalDate || '-'}</TableCell>
                          <TableCell className="text-center font-medium whitespace-nowrap">{v.vesselName || '-'}</TableCell>
                          <TableCell className="text-center text-muted-foreground whitespace-nowrap">{v.loadingPort || '-'}</TableCell>
                          <TableCell className="text-center">
                            {days !== null ? (
                              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${days > 10 ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' : days > 5 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'}`}>
                                <Clock className="w-3 h-3" />{days}
                              </span>
                            ) : '-'}
                          </TableCell>
                          <TableCell className="text-center">{v.status ? <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${statusClass}`}>{v.status}</span> : '-'}</TableCell>
                          <TableCell className="text-center text-muted-foreground text-xs">{translateOp(v.operation)}</TableCell>
                          <TableCell className="text-center text-muted-foreground whitespace-nowrap">{translateCargo(v.cargo)}</TableCell>
                          <TableCell className="text-center font-mono text-muted-foreground whitespace-nowrap">{v.blTonnage != null ? `${v.blTonnage.toLocaleString('en-US', { maximumFractionDigits: 0 })} MTS` : '-'}</TableCell>
                          <TableCell className="text-center text-muted-foreground" title={v.buyer}>{v.buyer || '-'}</TableCell>
                          <TableCell className="text-center text-muted-foreground" title={v.seller}>{v.seller || '-'}</TableCell>
                        </TableRow>
                      );
                    });
                  })()}
                </TableBody>
              </Table>
              {filteredVessels.length > 0 && (
                <div className="px-3 py-2 bg-muted/30 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                  <span>{filteredVessels.length} records ({vesselSummary.length} unique vessels)</span>
                  <span>Total B/L: {filteredVessels.reduce((sum, v) => sum + (v.blTonnage || 0), 0).toLocaleString('en-US', { maximumFractionDigits: 0 })} MTS</span>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════
   MONTHLY LINE-UP (new)
   ════════════════════════════════════════════════ */
function MonthlyLineUp({ onLastUpdate }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFileId, setSelectedFileId] = useState('');
  const [docData, setDocData] = useState(null);
  const [selectedPort, setSelectedPort] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState('');

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/port-lineups/monthly/list');
      setFiles(res.data || []);
      if (res.data?.length > 0) {
        if (!selectedFileId) setSelectedFileId(res.data[0].id);
        if (res.data[0].uploadedAt) onLastUpdate?.(new Date(res.data[0].uploadedAt).toLocaleDateString('en-GB'));
      }
    } catch { /* empty */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  useEffect(() => {
    if (!selectedFileId) return;
    setLoading(true);
    api.get(`/api/port-lineups/monthly/${selectedFileId}`)
      .then(res => { setDocData(res.data); setSelectedPort('ALL'); })
      .catch(() => setError('Failed to load document'))
      .finally(() => setLoading(false));
  }, [selectedFileId]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setError('');
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await api.post('/api/port-lineups/monthly/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000 });
      await fetchFiles();
      if (res.data?.id) setSelectedFileId(res.data.id);
    } catch (err) { setError(err.response?.data?.detail || 'Upload failed'); }
    finally { setUploading(false); e.target.value = ''; }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this monthly lineup?')) return;
    try {
      await api.delete(`/api/port-lineups/monthly/${id}`);
      if (selectedFileId === id) { setSelectedFileId(''); setDocData(null); }
      fetchFiles();
    } catch { setError('Failed to delete'); }
  };

  const allVessels = useMemo(() => {
    if (!docData?.ports) return [];
    return docData.ports.flatMap(p => p.vessels.map(v => ({ ...v, portName: p.portName })));
  }, [docData]);

  const filteredVessels = useMemo(() => {
    let result = selectedPort === 'ALL' ? allVessels : allVessels.filter(v => v.portName === selectedPort);
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      result = result.filter(v =>
        (v.vesselName || '').toLowerCase().includes(q) ||
        (v.loadingPort || '').toLowerCase().includes(q) ||
        (v.cargo || '').toLowerCase().includes(q) ||
        (v.buyer || '').toLowerCase().includes(q) ||
        (v.seller || '').toLowerCase().includes(q)
      );
    }
    return [...result].sort((a, b) => {
      const parseD = (s) => { if (!s) return 0; const p = s.split(/[./\-]/); return p.length === 3 ? (p[2].length === 4 ? new Date(p[2], p[1]-1, p[0]) : new Date(p[0], p[1]-1, p[2])) : 0; };
      return parseD(b.reportDate) - parseD(a.reportDate);
    });
  }, [allVessels, selectedPort, searchTerm]);

  const vesselSummary = useMemo(() => {
    const map = new Map();
    filteredVessels.forEach(v => { if (v.vesselName && !map.has(v.vesselName)) map.set(v.vesselName, true); });
    return [...map.keys()];
  }, [filteredVessels]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Monthly port lineup reports</p>
        <div className="flex items-center gap-2">
          {selectedFileId && docData && (
            <>
              <button onClick={() => handleDelete(selectedFileId)} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-destructive border border-border hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"><Trash2 className="w-4 h-4" />Delete</button>
            </>
          )}
          <label className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors ${uploading ? 'bg-muted text-muted-foreground cursor-wait' : 'bg-[#1A5276] text-white hover:bg-[#15632F]'}`} data-testid="upload-monthly-button">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? 'Uploading...' : 'Upload Excel'}
            <input type="file" accept=".xlsx,.xls" onChange={handleUpload} className="hidden" disabled={uploading} />
          </label>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />{error}
        </div>
      )}

      {files.length === 0 && !loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FileSpreadsheet className="w-12 h-12 text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground font-medium">No monthly lineups uploaded yet</p>
          <p className="text-sm text-muted-foreground/70 mt-1">Upload an Excel file to get started</p>
        </div>
      ) : (
        <>
          {/* File selector + search */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <FileSpreadsheet className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <select value={selectedFileId} onChange={e => setSelectedFileId(e.target.value)} className="pl-9 pr-8 py-2 bg-card border border-border rounded-lg text-sm appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#1A5276]/30 min-w-[280px]" data-testid="monthly-file-selector">
                {files.map(f => <option key={f.id} value={f.id}>{f.fileName}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            </div>
            <div className="relative max-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input type="text" placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-9 pr-3 py-2 bg-card border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A5276]/30" />
            </div>
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="flex items-center gap-1 px-2.5 py-2 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors whitespace-nowrap">
                <X className="w-3.5 h-3.5" />Clear
              </button>
            )}
          </div>

          {/* Port tabs */}
          {docData?.ports?.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              <button onClick={() => { setSelectedPort('ALL'); setSearchTerm(''); }} className={`flex-shrink-0 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${selectedPort === 'ALL' ? 'bg-[#1A5276] text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
                ALL <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] ${selectedPort === 'ALL' ? 'bg-white/20 text-white' : 'bg-background text-muted-foreground'}`}>{allVessels.length}</span>
              </button>
              {docData.ports.map(p => (
                <button key={p.portName} onClick={() => { setSelectedPort(p.portName); setSearchTerm(''); }} className={`flex-shrink-0 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${selectedPort === p.portName ? 'bg-[#1A5276] text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
                  {p.portName} <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] ${selectedPort === p.portName ? 'bg-white/20 text-white' : 'bg-background text-muted-foreground'}`}>{p.vessels.length}</span>
                </button>
              ))}
            </div>
          )}

          {loading && <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}

          {/* Data table - same style as Daily */}
          {!loading && docData?.ports && (
            <div className="overflow-x-auto border rounded-lg" data-testid="monthly-table-container">
              <Table className="trade-table">
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-center whitespace-nowrap w-[100px]">Report Date</TableHead>
                    <TableHead className="text-center whitespace-nowrap">Vessel</TableHead>
                    <TableHead className="text-center whitespace-nowrap">Loading Port</TableHead>
                    <TableHead className="text-center whitespace-nowrap w-[100px]">Arrival</TableHead>
                    <TableHead className="text-center whitespace-nowrap">Op.</TableHead>
                    <TableHead className="text-center whitespace-nowrap">Commodity</TableHead>
                    <TableHead className="text-center whitespace-nowrap">B/L Tonnage</TableHead>
                    <TableHead className="text-center whitespace-nowrap">Buyer</TableHead>
                    <TableHead className="text-center whitespace-nowrap">Seller</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredVessels.length === 0 ? (
                    <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">{searchTerm ? 'No vessels match your search' : 'No data available'}</TableCell></TableRow>
                  ) : filteredVessels.map((v, i) => (
                    <TableRow key={i} className={i % 2 === 1 ? 'bg-muted/30' : ''}>
                      <TableCell className="text-center whitespace-nowrap text-xs">{v.reportDate || '-'}</TableCell>
                      <TableCell className="text-center whitespace-nowrap text-sm font-semibold">{v.vesselName || '-'}</TableCell>
                      <TableCell className="text-center whitespace-nowrap text-sm">{v.loadingPort || '-'}</TableCell>
                      <TableCell className="text-center whitespace-nowrap text-xs">{v.arrivalDate || '-'}</TableCell>
                      <TableCell className="text-center whitespace-nowrap text-xs">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${v.operation === 'TAHLIYE' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}`}>{v.operation || '-'}</span>
                      </TableCell>
                      <TableCell className="text-center whitespace-nowrap text-sm">{v.cargo || '-'}</TableCell>
                      <TableCell className="text-center whitespace-nowrap text-sm font-medium">{v.blTonnage ? v.blTonnage.toLocaleString() : '-'}</TableCell>
                      <TableCell className="text-center text-xs max-w-[180px] truncate" title={v.buyer}>{v.buyer || '-'}</TableCell>
                      <TableCell className="text-center text-xs max-w-[180px] truncate" title={v.seller}>{v.seller || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {filteredVessels.length > 0 && (
                <div className="px-3 py-2 bg-muted/30 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                  <span>{filteredVessels.length} records ({vesselSummary.length} unique vessels)</span>
                  <span>Total B/L: {filteredVessels.reduce((sum, v) => sum + (v.blTonnage || 0), 0).toLocaleString('en-US', { maximumFractionDigits: 0 })} MTS</span>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════
   MAIN PAGE
   ════════════════════════════════════════════════ */
export default function PortLineupsPage() {
  const [dailyLastUpdate, setDailyLastUpdate] = useState('');
  const [monthlyLastUpdate, setMonthlyLastUpdate] = useState('');

  return (
    <div className="space-y-4" data-testid="port-lineups-page">
      <Tabs defaultValue="daily" className="w-full">
        <TabsList>
          <TabsTrigger value="daily" className="flex-col items-center gap-0 py-2 data-[state=active]:bg-green-700 data-[state=active]:text-white">
            <span className="flex items-center"><Ship className="w-3.5 h-3.5 mr-1.5" />Daily Line-Up</span>
            {dailyLastUpdate && <span className="text-[10px] font-normal data-[state=active]:text-green-100" style={{color: 'inherit', opacity: 0.8}}>Last Update: {dailyLastUpdate}</span>}
          </TabsTrigger>
          <TabsTrigger value="monthly" className="flex-col items-center gap-0 py-2 data-[state=active]:bg-green-700 data-[state=active]:text-white">
            <span className="flex items-center"><Calendar className="w-3.5 h-3.5 mr-1.5" />Monthly Line-Up</span>
            {monthlyLastUpdate && <span className="text-[10px] font-normal" style={{color: 'inherit', opacity: 0.8}}>Last Update: {monthlyLastUpdate}</span>}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="daily"><DailyLineUp onLastUpdate={setDailyLastUpdate} /></TabsContent>
        <TabsContent value="monthly"><MonthlyLineUp onLastUpdate={setMonthlyLastUpdate} /></TabsContent>
      </Tabs>
    </div>
  );
}
