import { useState, useEffect, useMemo } from 'react';
import api from '../../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { TrendingUp, Loader2, RefreshCw, Wheat, Circle, Fuel, DollarSign } from 'lucide-react';
import { toast } from 'sonner';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

const COMMODITY_COLORS = {
  WHEAT: '#F59E0B',
  CORN: '#EAB308',
  SOYBEAN: '#84CC16',
  GOLD: '#FCD34D',
  CRUDE_OIL: '#1F2937',
  EUR_USD: '#3B82F6',
  USD_RUB: '#EF4444',
  USD_TRY: '#DC2626',
  USD_UAH: '#10B981',
};

const AUTO_REFRESH_INTERVAL = 15 * 60 * 1000;

export default function PricesTab() {
  const [prices, setPrices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [selectedCommodity, setSelectedCommodity] = useState(null);
  const [chartPeriod, setChartPeriod] = useState('daily');
  const [chartData, setChartData] = useState([]);
  const [chartLoading, setChartLoading] = useState(false);

  useEffect(() => {
    fetchPrices();
    const interval = setInterval(refreshPrices, AUTO_REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (selectedCommodity) {
      fetchChartData(selectedCommodity, chartPeriod);
    }
  }, [selectedCommodity, chartPeriod]);

  const fetchPrices = async () => {
    try {
      const res = await api.get('/api/market/prices');
      setPrices(res.data);
      setLastUpdated(new Date());
      if (res.data.length > 0 && !selectedCommodity) {
        setSelectedCommodity(res.data[0].symbol);
      }
    } catch (err) {
      toast.error('Failed to load prices');
    } finally {
      setLoading(false);
    }
  };

  const refreshPrices = async () => {
    setRefreshing(true);
    try {
      const res = await api.get('/api/market/prices');
      setPrices(res.data);
      setLastUpdated(new Date());
      toast.success('Prices refreshed');
    } catch (err) {
      toast.error('Failed to refresh prices');
    } finally {
      setRefreshing(false);
    }
  };

  const fetchChartData = async (symbol, period) => {
    setChartLoading(true);
    try {
      const res = await api.get(`/api/market/prices/${symbol}/history?period=${period}`);
      setChartData(res.data.history || []);
    } catch (err) {
      console.error('Failed to load chart data');
    } finally {
      setChartLoading(false);
    }
  };

  const groupedPrices = useMemo(() => ({
    agricultural: prices.filter(p => p.type === 'agricultural'),
    commodities: prices.filter(p => p.type === 'commodity'),
    currencies: prices.filter(p => p.type === 'currency'),
  }), [prices]);

  const selectedPrice = prices.find(p => p.symbol === selectedCommodity);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-center">
        <h2 className="text-lg font-semibold text-green-700" data-testid="live-prices-title">CBOT & Exchange Rates - Live Market Prices</h2>
      </div>
      <div className="flex items-center justify-end gap-3">
        {lastUpdated && (
          <span className="text-sm text-muted-foreground">
            Updated: {lastUpdated.toLocaleTimeString()}
          </span>
        )}
        <Button onClick={refreshPrices} disabled={refreshing} variant="outline" size="sm" data-testid="refresh-prices-btn">
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh Now
        </Button>
      </div>
      <Card>
        <CardContent className="pt-4">
          <Table data-testid="prices-table">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[200px]">Market</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Change</TableHead>
                <TableHead className="text-right">% Change</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groupedPrices.agricultural.map((item) => (
                <TableRow key={item.symbol} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedCommodity(item.symbol)}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <Wheat className="h-4 w-4 text-amber-600" />
                      CBOT - {item.name}
                      {item.source === 'Barchart' && <Badge variant="default" className="text-[10px] bg-green-600 ml-1">Live</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold">${item.price?.toLocaleString()}</TableCell>
                  <TableCell className={`text-right font-mono ${item.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {item.change >= 0 ? '+' : ''}{item.change?.toFixed(2)}
                  </TableCell>
                  <TableCell className={`text-right font-mono ${item.changePercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {item.changePercent >= 0 ? '+' : ''}{item.changePercent?.toFixed(2)}%
                  </TableCell>
                </TableRow>
              ))}
              {groupedPrices.commodities.map((item) => (
                <TableRow key={item.symbol} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedCommodity(item.symbol)}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {item.symbol === 'GOLD' ? <Circle className="h-4 w-4 text-yellow-500" /> : <Fuel className="h-4 w-4 text-gray-700" />}
                      {item.name}
                      {item.source === 'Barchart' && <Badge variant="default" className="text-[10px] bg-green-600 ml-1">Live</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold">${item.price?.toLocaleString()}</TableCell>
                  <TableCell className={`text-right font-mono ${item.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {item.change >= 0 ? '+' : ''}{item.change?.toFixed(2)}
                  </TableCell>
                  <TableCell className={`text-right font-mono ${item.changePercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {item.changePercent >= 0 ? '+' : ''}{item.changePercent?.toFixed(2)}%
                  </TableCell>
                </TableRow>
              ))}
              {groupedPrices.currencies.map((item) => (
                <TableRow key={item.symbol} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedCommodity(item.symbol)}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-blue-500" />
                      {item.name}
                      {item.source === 'Barchart' && <Badge variant="default" className="text-[10px] bg-green-600 ml-1">Live</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold">{item.price?.toFixed(4)}</TableCell>
                  <TableCell className={`text-right font-mono ${item.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {item.change >= 0 ? '+' : ''}{item.change?.toFixed(4)}
                  </TableCell>
                  <TableCell className={`text-right font-mono ${item.changePercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {item.changePercent >= 0 ? '+' : ''}{item.changePercent?.toFixed(2)}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {selectedCommodity && selectedPrice && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">{selectedPrice.name} Price Chart</CardTitle>
              <div className="flex gap-1">
                {['daily', 'monthly', 'yearly'].map((period) => (
                  <Button key={period} size="sm" variant={chartPeriod === period ? 'default' : 'outline'} onClick={() => setChartPeriod(period)} className="capitalize">
                    {period}
                  </Button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {chartLoading ? (
              <div className="h-64 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COMMODITY_COLORS[selectedCommodity] || '#1A5276'} stopOpacity={0.3}/>
                      <stop offset="95%" stopColor={COMMODITY_COLORS[selectedCommodity] || '#1A5276'} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} domain={['auto', 'auto']} />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} labelStyle={{ color: 'hsl(var(--foreground))' }} />
                  <Area type="monotone" dataKey="price" stroke={COMMODITY_COLORS[selectedCommodity] || '#1A5276'} fillOpacity={1} fill="url(#colorPrice)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
