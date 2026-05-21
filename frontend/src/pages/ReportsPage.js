import { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Button } from '../components/ui/button';
import { TRADE_STATUS_CONFIG, COMPLETED_STATUSES, CANCELLED_STATUSES, WASHOUT_STATUSES } from '../lib/constants';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Loader2, BarChart3, TrendingUp, Users, Wheat, Globe, Anchor, DollarSign, Ship, CalendarDays, Filter, X } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

const COLORS = ['#1A5276', '#C4A54D', '#2563EB', '#DC2626', '#7C3AED', '#059669', '#D97706', '#0891B2', '#BE185D', '#65A30D'];
const GREEN = '#1A5276';
const GOLD = '#C4A54D';

function fmt(n) { return typeof n === 'number' ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '0'; }
function fmtUsd(n) { return `$${typeof n === 'number' ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '0'}`; }

function KpiCard({ label, value, icon: Icon, color = 'text-primary' }) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4 flex items-center gap-3">
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg bg-muted`}><Icon className={`h-4 w-4 ${color}`} /></div>
        <div><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-bold">{value}</p></div>
      </CardContent>
    </Card>
  );
}

function TopChart({ title, description, data, dataKey, nameKey = 'name', fill = GREEN, formatter, icon: Icon }) {
  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="bg-background border rounded-lg p-2 shadow-lg text-sm">
        <p className="font-medium">{d.fullName || d[nameKey]}</p>
        <p className="text-muted-foreground">{formatter ? formatter(payload[0].value) : payload[0].value.toLocaleString()}</p>
      </div>
    );
  };
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">{Icon && <Icon className="h-4 w-4 text-primary" />}{title}</CardTitle>
        {description && <CardDescription className="text-xs">{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        {data.length === 0 ? <p className="text-center py-8 text-muted-foreground text-sm">No data</p> : (
          <ResponsiveContainer width="100%" height={Math.max(200, data.length * 36)}>
            <BarChart data={data} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 15% 90%)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={formatter || ((v) => v.toLocaleString())} />
              <YAxis type="category" dataKey={nameKey} tick={{ fontSize: 11 }} width={140} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey={dataKey} fill={fill} radius={[0, 4, 4, 0]} barSize={20} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

// Map name fields to their code counterparts
const CODE_MAP = {
  sellerName: 'sellerCode', buyerName: 'buyerCode', brokerName: 'brokerCode',
  coBrokerName: 'coBrokerCode', commodityName: 'commodityCode',
};

function buildTop10(trades, field, valueField = 'quantity') {
  const codeField = CODE_MAP[field];
  const agg = {};
  trades.forEach(t => {
    const key = t[field] || 'Unknown';
    if (key === 'Unknown') return;
    const label = (codeField && t[codeField]) ? t[codeField] : key;
    if (!agg[key]) agg[key] = { name: label, fullName: key, quantity: 0, value: 0, commission: 0, count: 0 };
    const qty = t.blQuantity || t.quantity || 0;
    agg[key].quantity += qty;
    agg[key].value += qty * (t.pricePerMT || 0);
    agg[key].commission += t.totalCommission || 0;
    agg[key].count += 1;
  });
  const arr = Object.values(agg);
  arr.sort((a, b) => b[valueField] - a[valueField]);
  return arr.slice(0, 10);
}

function DetailBreakdown({ trades, filterField, codeField, label, breakdowns }) {
  const [selected, setSelected] = useState('');
  const uniqueItems = useMemo(() => {
    const seen = {};
    trades.forEach(t => {
      const val = t[filterField];
      if (val && !seen[val]) {
        seen[val] = (codeField && t[codeField]) ? t[codeField] : val;
      }
    });
    return Object.entries(seen).sort((a, b) => a[1].localeCompare(b[1]));
  }, [trades, filterField, codeField]);

  const filtered = useMemo(() => selected ? trades.filter(t => t[filterField] === selected) : [], [trades, selected, filterField]);

  const totalQty = filtered.reduce((s, t) => s + (t.blQuantity || t.quantity || 0), 0);
  const totalVal = filtered.reduce((s, t) => s + ((t.blQuantity || t.quantity || 0) * (t.pricePerMT || 0)), 0);
  const totalComm = filtered.reduce((s, t) => s + (t.totalCommission || 0), 0);

  return (
    <div className="space-y-4 mt-6">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm font-semibold">Detailed report for:</span>
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger className="w-[260px]"><SelectValue placeholder={`Select ${label}`} /></SelectTrigger>
          <SelectContent>{uniqueItems.map(([val, code]) => <SelectItem key={val} value={val}>{code}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {selected && filtered.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <KpiCard label="Quantity" value={`${fmt(totalQty)} Mts`} icon={Ship} color="text-blue-600" />
            <KpiCard label="Trade Value" value={fmtUsd(totalVal)} icon={DollarSign} color="text-green-600" />
            <KpiCard label="Commission" value={fmtUsd(totalComm)} icon={TrendingUp} color="text-amber-600" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {breakdowns.map(({ title, field, fill, icon }) => (
              <TopChart key={title} title={title} description="Quantity (Mts)" data={buildTop10(filtered, field, 'quantity')} dataKey="quantity" fill={fill} formatter={fmt} icon={icon} />
            ))}
          </div>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Trade List</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto border rounded-lg">
                <Table>
                  <TableHeader><TableRow className="bg-muted/50">
                    <TableHead>Contract</TableHead><TableHead>Commodity</TableHead><TableHead>Seller</TableHead><TableHead>Buyer</TableHead>
                    <TableHead>Origin</TableHead><TableHead>Destination</TableHead><TableHead className="text-right">Qty (Mts)</TableHead><TableHead className="text-right">Value ($)</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {filtered.map(t => (
                      <TableRow key={t.id}>
                        <TableCell className="font-medium text-xs">{t.pirContractNumber || t.referenceNumber}</TableCell>
                        <TableCell className="text-xs max-w-[150px]">{t.commodityName || '-'}</TableCell>
                        <TableCell className="text-xs">{t.sellerCode || t.sellerName || '-'}</TableCell>
                        <TableCell className="text-xs">{t.buyerCode || t.buyerName || '-'}</TableCell>
                        <TableCell className="text-xs">{t.originName || '-'}</TableCell>
                        <TableCell className="text-xs">{t.dischargePortName || '-'}</TableCell>
                        <TableCell className="text-right text-xs">{fmt(t.blQuantity || t.quantity || 0)}</TableCell>
                        <TableCell className="text-right text-xs">{fmtUsd((t.blQuantity || t.quantity || 0) * (t.pricePerMT || 0))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
      {selected && filtered.length === 0 && <p className="text-muted-foreground text-sm py-4">No trades found.</p>}
    </div>
  );
}

export default function ReportsPage() {
  const [trades, setTrades] = useState([]);
  const [partners, setPartners] = useState([]);
  const [commodities, setCommodities] = useState([]);
  const [origins, setOrigins] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');
  const [metricType, setMetricType] = useState('quantity');

  // Filters
  const [filterYear, setFilterYear] = useState(new Date().getFullYear().toString());
  const [filterSeller, setFilterSeller] = useState('all');
  const [filterBuyer, setFilterBuyer] = useState('all');
  const [filterCommodity, setFilterCommodity] = useState('all');
  const [filterOrigin, setFilterOrigin] = useState('all');

  useEffect(() => {
    const fetch = async () => {
      try {
        const [s, t, p, c, o] = await Promise.all([
          api.get('/api/trades/stats/overview'), api.get('/api/trades'),
          api.get('/api/partners'), api.get('/api/commodities'), api.get('/api/origins'),
        ]);
        setStats(s.data); setTrades(t.data); setPartners(p.data); setCommodities(c.data); setOrigins(o.data);
      } catch (err) { console.error(err); } finally { setLoading(false); }
    };
    fetch();
  }, []);

  const currentYear = new Date().getFullYear().toString();
  const hasActiveFilters = filterYear !== currentYear || filterSeller !== 'all' || filterBuyer !== 'all' || filterCommodity !== 'all' || filterOrigin !== 'all';
  const clearFilters = () => { setFilterYear(currentYear); setFilterSeller('all'); setFilterBuyer('all'); setFilterCommodity('all'); setFilterOrigin('all'); };

  const getTradeYear = useCallback((trade) => {
    const d = trade.contractDate || trade.createdAt || '';
    const slashMatch = d.match(/^\d{2}\/\d{2}\/(\d{4})$/);
    if (slashMatch) return slashMatch[1];
    if (d.length >= 4) return d.substring(0, 4);
    return '';
  }, []);

  const sellers = useMemo(() => partners.filter(p => String(p.type || '').toLowerCase() === 'seller'), [partners]);
  const buyers = useMemo(() => partners.filter(p => String(p.type || '').toLowerCase() === 'buyer'), [partners]);

  const filteredTrades = useMemo(() => {
    let result = trades;
    // Year filter
    if (filterYear !== 'all') {
      result = result.filter(t => {
        const tradeYear = getTradeYear(t);
        if (tradeYear === filterYear) return true;
        if (filterYear === currentYear) {
          return !COMPLETED_STATUSES.includes(t.status) && !CANCELLED_STATUSES.includes(t.status) && !WASHOUT_STATUSES.includes(t.status);
        }
        return false;
      });
    }
    // Entity filters
    if (filterSeller !== 'all') result = result.filter(t => t.sellerId === filterSeller);
    if (filterBuyer !== 'all') result = result.filter(t => t.buyerId === filterBuyer);
    if (filterCommodity !== 'all') result = result.filter(t => t.commodityId === filterCommodity);
    if (filterOrigin !== 'all') result = result.filter(t => t.originId === filterOrigin);
    return result;
  }, [trades, filterYear, filterSeller, filterBuyer, filterCommodity, filterOrigin, currentYear, getTradeYear]);

  const totalVolume = useMemo(() => filteredTrades.reduce((s, t) => s + (t.blQuantity || t.quantity || 0), 0), [filteredTrades]);
  const totalValue = useMemo(() => filteredTrades.reduce((s, t) => s + ((t.blQuantity || t.quantity || 0) * (t.pricePerMT || 0)), 0), [filteredTrades]);
  const totalComm = useMemo(() => filteredTrades.reduce((s, t) => s + (t.totalCommission || 0), 0), [filteredTrades]);

  const topSellers = useMemo(() => buildTop10(filteredTrades, 'sellerName', metricType), [filteredTrades, metricType]);
  const topBuyers = useMemo(() => buildTop10(filteredTrades, 'buyerName', metricType), [filteredTrades, metricType]);
  const topCommodities = useMemo(() => buildTop10(filteredTrades, 'commodityName', metricType), [filteredTrades, metricType]);
  const topOrigins = useMemo(() => buildTop10(filteredTrades, 'originName', metricType), [filteredTrades, metricType]);
  const topDischPorts = useMemo(() => buildTop10(filteredTrades, 'dischargePortName', metricType), [filteredTrades, metricType]);
  const topCoBrokers = useMemo(() => buildTop10(filteredTrades, 'coBrokerName', metricType), [filteredTrades, metricType]);
  const topBrokers = useMemo(() => buildTop10(filteredTrades, 'brokerName', metricType), [filteredTrades, metricType]);
  const topLoadPorts = useMemo(() => buildTop10(filteredTrades, 'loadingPortName', metricType), [filteredTrades, metricType]);

  const statusData = useMemo(() => {
    const dist = {};
    filteredTrades.forEach(t => { dist[t.status] = (dist[t.status] || 0) + 1; });
    return Object.entries(dist).map(([key, value]) => ({ name: TRADE_STATUS_CONFIG[key]?.label || key, value }));
  }, [filteredTrades]);

  const metricLabel = metricType === 'quantity' ? 'Quantity (Mts)' : metricType === 'value' ? 'Trade Value ($)' : metricType === 'commission' ? 'Commission ($)' : 'Trades';
  const metricFormatter = metricType === 'value' || metricType === 'commission' ? fmtUsd : fmt;

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div></div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="flex items-center gap-3 overflow-x-auto">
            <Select value={filterYear} onValueChange={setFilterYear}>
              <SelectTrigger className="w-[100px] shrink-0" data-testid="reports-year-filter"><CalendarDays className="h-3.5 w-3.5 mr-1 text-muted-foreground" /><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Years</SelectItem>
                <SelectItem value="2026">2026</SelectItem>
                <SelectItem value="2025">2025</SelectItem>
                <SelectItem value="2024">2024</SelectItem>
              </SelectContent>
            </Select>
            {hasActiveFilters && <Button variant="ghost" size="sm" onClick={clearFilters} className="shrink-0 text-destructive hover:text-destructive" data-testid="reports-clear-filter"><X className="h-4 w-4 mr-1" />Clear</Button>}
            <Select value={filterSeller} onValueChange={setFilterSeller}>
              <SelectTrigger className="w-[150px] shrink-0" data-testid="reports-seller-filter"><SelectValue placeholder="Seller" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sellers</SelectItem>
                {sellers.map(s => <SelectItem key={s.id} value={s.id}>{s.companyName}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterBuyer} onValueChange={setFilterBuyer}>
              <SelectTrigger className="w-[150px] shrink-0" data-testid="reports-buyer-filter"><SelectValue placeholder="Buyer" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Buyers</SelectItem>
                {buyers.map(b => <SelectItem key={b.id} value={b.id}>{b.companyName}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterCommodity} onValueChange={setFilterCommodity}>
              <SelectTrigger className="w-[160px] shrink-0" data-testid="reports-commodity-filter"><SelectValue placeholder="Commodity" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Commodities</SelectItem>
                {commodities.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterOrigin} onValueChange={setFilterOrigin}>
              <SelectTrigger className="w-[140px] shrink-0" data-testid="reports-origin-filter"><SelectValue placeholder="Origin" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Origins</SelectItem>
                {origins.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Total Trades" value={filteredTrades.length} icon={BarChart3} />
        <KpiCard label="Total Volume" value={`${fmt(totalVolume)} Mts`} icon={Ship} color="text-blue-600" />
        <KpiCard label="Total Value" value={fmtUsd(totalValue)} icon={DollarSign} color="text-green-600" />
        <KpiCard label="Total Commission" value={fmtUsd(totalComm)} icon={TrendingUp} color="text-amber-600" />
      </div>

      {/* Metric Selector */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-muted-foreground">Compare by:</span>
        <Select value={metricType} onValueChange={setMetricType}>
          <SelectTrigger className="w-[180px]" data-testid="metric-selector"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="quantity">Quantity (Mts)</SelectItem>
            <SelectItem value="value">Trade Value ($)</SelectItem>
            <SelectItem value="commission">Commission ($)</SelectItem>
            <SelectItem value="count">Number of Trades</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="sellers">Sellers</TabsTrigger>
          <TabsTrigger value="buyers">Buyers</TabsTrigger>
          <TabsTrigger value="commodities">Commodities</TabsTrigger>
          <TabsTrigger value="brokers">Brokers</TabsTrigger>
          <TabsTrigger value="origins">Origins</TabsTrigger>
          <TabsTrigger value="ports">Ports</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Trade Status Distribution</CardTitle></CardHeader>
              <CardContent>{statusData.length === 0 ? <p className="text-center py-8 text-muted-foreground text-sm">No data</p> : (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart><Pie data={statusData} cx="50%" cy="50%" innerRadius={55} outerRadius={95} paddingAngle={2} dataKey="value">
                    {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie><Tooltip /><Legend wrapperStyle={{ fontSize: 12 }} /></PieChart>
                </ResponsiveContainer>
              )}</CardContent>
            </Card>
            <TopChart title="Top 10 Commodities" description={metricLabel} data={topCommodities} dataKey={metricType} fill={GREEN} formatter={metricFormatter} icon={Wheat} />
            <TopChart title="Top 10 Sellers" description={metricLabel} data={topSellers} dataKey={metricType} fill="#2563EB" formatter={metricFormatter} icon={Users} />
            <TopChart title="Top 10 Buyers" description={metricLabel} data={topBuyers} dataKey={metricType} fill={GOLD} formatter={metricFormatter} icon={Users} />
          </div>
        </TabsContent>

        <TabsContent value="sellers">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TopChart title="Top 10 Sellers by Quantity" description="Mts" data={buildTop10(filteredTrades, 'sellerName', 'quantity')} dataKey="quantity" fill="#2563EB" formatter={fmt} icon={Users} />
            <TopChart title="Top 10 Sellers by Trade Value" description="USD" data={buildTop10(filteredTrades, 'sellerName', 'value')} dataKey="value" fill={GREEN} formatter={fmtUsd} icon={DollarSign} />
            <TopChart title="Top 10 Sellers by Commission" description="USD" data={buildTop10(filteredTrades, 'sellerName', 'commission')} dataKey="commission" fill={GOLD} formatter={fmtUsd} icon={TrendingUp} />
            <TopChart title="Top 10 Sellers by Trade Count" description="Trades" data={buildTop10(filteredTrades, 'sellerName', 'count')} dataKey="count" fill="#7C3AED" formatter={fmt} icon={BarChart3} />
          </div>
          <DetailBreakdown trades={filteredTrades} filterField="sellerName" codeField="sellerCode" label="Seller" breakdowns={[
            { title: 'By Commodity', field: 'commodityName', fill: GREEN, icon: Wheat },
            { title: 'By Origin', field: 'originName', fill: '#2563EB', icon: Globe },
            { title: 'By Discharge Port', field: 'dischargePortName', fill: GOLD, icon: Anchor },
            { title: 'By Buyer', field: 'buyerName', fill: '#DC2626', icon: Users },
          ]} />
        </TabsContent>

        <TabsContent value="buyers">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TopChart title="Top 10 Buyers by Quantity" description="Mts" data={buildTop10(filteredTrades, 'buyerName', 'quantity')} dataKey="quantity" fill={GOLD} formatter={fmt} icon={Users} />
            <TopChart title="Top 10 Buyers by Trade Value" description="USD" data={buildTop10(filteredTrades, 'buyerName', 'value')} dataKey="value" fill={GREEN} formatter={fmtUsd} icon={DollarSign} />
            <TopChart title="Top 10 Buyers by Commission" description="USD" data={buildTop10(filteredTrades, 'buyerName', 'commission')} dataKey="commission" fill="#DC2626" formatter={fmtUsd} icon={TrendingUp} />
            <TopChart title="Top 10 Buyers by Trade Count" description="Trades" data={buildTop10(filteredTrades, 'buyerName', 'count')} dataKey="count" fill="#7C3AED" formatter={fmt} icon={BarChart3} />
          </div>
          <DetailBreakdown trades={filteredTrades} filterField="buyerName" codeField="buyerCode" label="Buyer" breakdowns={[
            { title: 'By Commodity', field: 'commodityName', fill: GREEN, icon: Wheat },
            { title: 'By Origin', field: 'originName', fill: '#2563EB', icon: Globe },
            { title: 'By Load Port', field: 'loadingPortName', fill: GOLD, icon: Anchor },
            { title: 'By Seller', field: 'sellerName', fill: '#DC2626', icon: Users },
          ]} />
        </TabsContent>

        <TabsContent value="commodities">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TopChart title="Top 10 Commodities by Quantity" description="Mts" data={buildTop10(filteredTrades, 'commodityName', 'quantity')} dataKey="quantity" fill={GREEN} formatter={fmt} icon={Wheat} />
            <TopChart title="Top 10 Commodities by Trade Value" description="USD" data={buildTop10(filteredTrades, 'commodityName', 'value')} dataKey="value" fill="#2563EB" formatter={fmtUsd} icon={DollarSign} />
            <TopChart title="Top 10 Commodities by Commission" description="USD" data={buildTop10(filteredTrades, 'commodityName', 'commission')} dataKey="commission" fill={GOLD} formatter={fmtUsd} icon={TrendingUp} />
            <TopChart title="Top 10 Commodities by Trade Count" description="Trades" data={buildTop10(filteredTrades, 'commodityName', 'count')} dataKey="count" fill="#7C3AED" formatter={fmt} icon={BarChart3} />
          </div>
        </TabsContent>

        <TabsContent value="brokers">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TopChart title="Top 10 Brokers by Commission" description="USD" data={buildTop10(filteredTrades, 'brokerName', 'commission')} dataKey="commission" fill={GREEN} formatter={fmtUsd} icon={TrendingUp} />
            <TopChart title="Top 10 Co-Brokers by Commission" description="USD" data={buildTop10(filteredTrades, 'coBrokerName', 'commission')} dataKey="commission" fill={GOLD} formatter={fmtUsd} icon={TrendingUp} />
            <TopChart title="Top 10 Brokers by Trade Count" description="Trades" data={buildTop10(filteredTrades, 'brokerName', 'count')} dataKey="count" fill="#2563EB" formatter={fmt} icon={BarChart3} />
            <TopChart title="Top 10 Co-Brokers by Quantity" description="Mts" data={buildTop10(filteredTrades, 'coBrokerName', 'quantity')} dataKey="quantity" fill="#7C3AED" formatter={fmt} icon={Ship} />
          </div>
        </TabsContent>

        <TabsContent value="origins">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TopChart title="Top 10 Origins by Quantity" description="Mts" data={buildTop10(filteredTrades, 'originName', 'quantity')} dataKey="quantity" fill={GREEN} formatter={fmt} icon={Globe} />
            <TopChart title="Top 10 Origins by Trade Value" description="USD" data={buildTop10(filteredTrades, 'originName', 'value')} dataKey="value" fill="#2563EB" formatter={fmtUsd} icon={DollarSign} />
            <TopChart title="Top 10 Origins by Commission" description="USD" data={buildTop10(filteredTrades, 'originName', 'commission')} dataKey="commission" fill={GOLD} formatter={fmtUsd} icon={TrendingUp} />
            <TopChart title="Top 10 Origins by Trade Count" description="Trades" data={buildTop10(filteredTrades, 'originName', 'count')} dataKey="count" fill="#7C3AED" formatter={fmt} icon={BarChart3} />
          </div>
          <DetailBreakdown trades={filteredTrades} filterField="originName" codeField={null} label="Origin" breakdowns={[
            { title: 'By Seller', field: 'sellerName', fill: '#2563EB', icon: Users },
            { title: 'By Buyer', field: 'buyerName', fill: GOLD, icon: Users },
            { title: 'By Commodity', field: 'commodityName', fill: GREEN, icon: Wheat },
            { title: 'By Discharge Port', field: 'dischargePortName', fill: '#DC2626', icon: Anchor },
          ]} />
        </TabsContent>

        <TabsContent value="ports">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TopChart title="Top 10 Load Ports by Quantity" description="Mts" data={buildTop10(filteredTrades, 'loadingPortName', 'quantity')} dataKey="quantity" fill={GREEN} formatter={fmt} icon={Anchor} />
            <TopChart title="Top 10 Discharge Ports by Quantity" description="Mts" data={buildTop10(filteredTrades, 'dischargePortName', 'quantity')} dataKey="quantity" fill="#2563EB" formatter={fmt} icon={Anchor} />
            <TopChart title="Top 10 Load Ports by Trade Value" description="USD" data={buildTop10(filteredTrades, 'loadingPortName', 'value')} dataKey="value" fill={GOLD} formatter={fmtUsd} icon={DollarSign} />
            <TopChart title="Top 10 Discharge Ports by Trade Value" description="USD" data={buildTop10(filteredTrades, 'dischargePortName', 'value')} dataKey="value" fill="#DC2626" formatter={fmtUsd} icon={DollarSign} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
