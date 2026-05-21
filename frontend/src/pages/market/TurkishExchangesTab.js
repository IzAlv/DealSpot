import { useState, useEffect } from 'react';
import api from '../../lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Building2, RefreshCw, Plus, Loader2, Calendar, ChevronLeft } from 'lucide-react';
import { toast } from 'sonner';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function TurkishExchangesTab() {
  const [turkishPrices, setTurkishPrices] = useState([]);
  const [scrapingKTB, setScrapingKTB] = useState(false);
  const [turkishDialogOpen, setTurkishDialogOpen] = useState(false);
  const [turkishForm, setTurkishForm] = useState({ exchange: 'KTB', product: '', price: '', unit: 'TRY/KG', date: '', category: '' });
  
  // Historical navigation state
  const [viewMode, setViewMode] = useState('latest'); // 'latest', 'daily', 'monthly'
  const [availableDates, setAvailableDates] = useState({ KTB: [], GTB: [] });
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [monthlyData, setMonthlyData] = useState({ KTB: null, GTB: null });
  const [monthlyLoading, setMonthlyLoading] = useState(false);

  useEffect(() => {
    fetchTurkishPrices();
    fetchAvailableDates();
  }, []);

  const fetchTurkishPrices = async (date) => {
    try {
      const params = date ? `?date=${date}` : '';
      const res = await api.get(`/api/market/turkish-exchanges${params}`);
      setTurkishPrices(res.data);
    } catch (err) {
      console.error('Failed to load Turkish prices');
    }
  };

  const fetchAvailableDates = async () => {
    try {
      const res = await api.get('/api/market/turkish-exchanges/dates');
      setAvailableDates(res.data);
    } catch (err) {
      console.error('Failed to load available dates');
    }
  };

  const fetchMonthlyData = async (year, month) => {
    setMonthlyLoading(true);
    try {
      const [ktbRes, gtbRes] = await Promise.all([
        api.get(`/api/market/turkish-exchanges/monthly?exchange=KTB&year=${year}&month=${month}`),
        api.get(`/api/market/turkish-exchanges/monthly?exchange=GTB&year=${year}&month=${month}`),
      ]);
      setMonthlyData({ KTB: ktbRes.data, GTB: gtbRes.data });
    } catch (err) {
      console.error('Failed to load monthly data');
    } finally {
      setMonthlyLoading(false);
    }
  };

  const handleScrapeExchanges = async () => {
    setScrapingKTB(true);
    try {
      const res = await api.get('/api/market/turkish-exchanges/scrape');
      toast.success(`Fetched ${res.data.ktb?.length || 0} KTB + ${res.data.gtb?.length || 0} GTB prices`);
      fetchTurkishPrices();
      fetchAvailableDates();
    } catch (err) {
      toast.error('Failed to fetch exchange prices');
    } finally {
      setScrapingKTB(false);
    }
  };

  const handleSaveTurkishPrice = async () => {
    try {
      await api.post('/api/market/turkish-exchanges', {
        ...turkishForm,
        price: parseFloat(turkishForm.price),
        date: turkishForm.date || new Date().toISOString().split('T')[0]
      });
      toast.success('Price added');
      setTurkishDialogOpen(false);
      setTurkishForm({ exchange: 'KTB', product: '', price: '', unit: 'TRY/KG', date: '', category: '' });
      fetchTurkishPrices();
      fetchAvailableDates();
    } catch (err) {
      toast.error('Failed to add price');
    }
  };

  const handleDateSelect = (date) => {
    setSelectedDate(date);
    setViewMode('daily');
    fetchTurkishPrices(date);
  };

  const handleMonthSelect = (year, month) => {
    setSelectedYear(year);
    setSelectedMonth(month);
    setViewMode('monthly');
    fetchMonthlyData(year, month);
  };

  const handleBackToLatest = () => {
    setViewMode('latest');
    setSelectedDate(null);
    fetchTurkishPrices();
  };

  // Get unique years from available dates
  const getYears = () => {
    const yearsSet = new Set();
    [...(availableDates.KTB || []), ...(availableDates.GTB || [])].forEach(d => {
      const parts = d.split('.');
      if (parts.length === 3) yearsSet.add(parseInt(parts[2]));
    });
    return Array.from(yearsSet).sort((a, b) => b - a);
  };

  // Get months with data for a given year
  const getMonthsForYear = (year) => {
    const monthsSet = new Set();
    [...(availableDates.KTB || []), ...(availableDates.GTB || [])].forEach(d => {
      const parts = d.split('.');
      if (parts.length === 3 && parseInt(parts[2]) === year) {
        monthsSet.add(parseInt(parts[1]));
      }
    });
    return Array.from(monthsSet).sort((a, b) => a - b);
  };

  // Get dates for a given year and month
  const getDatesForMonth = (year, month) => {
    const dates = [];
    [...(availableDates.KTB || []), ...(availableDates.GTB || [])].forEach(d => {
      const parts = d.split('.');
      if (parts.length === 3 && parseInt(parts[2]) === year && parseInt(parts[1]) === month) {
        if (!dates.includes(d)) dates.push(d);
      }
    });
    return dates.sort((a, b) => {
      const dayA = parseInt(a.split('.')[0]);
      const dayB = parseInt(b.split('.')[0]);
      return dayA - dayB;
    });
  };

  const ktbPrices = turkishPrices.filter(p => p.exchange === 'KTB');
  const gtbPrices = turkishPrices.filter(p => p.exchange === 'GTB');

  const renderExchangeTable = (prices, exchange, testId) => {
    if (prices.length === 0) {
      return (
        <div className="text-center py-6">
          <Building2 className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No prices recorded</p>
          <p className="text-xs text-muted-foreground mt-1">Click "Fetch Prices" to get daily prices</p>
        </div>
      );
    }
    return (
      <Table data-testid={testId}>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead className="text-right">Min</TableHead>
            <TableHead className="text-right">Max</TableHead>
            <TableHead className="text-right">Avg</TableHead>
            <TableHead>Date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {prices.slice(0, 15).map((price, idx) => (
            <TableRow key={price.id || idx}>
              <TableCell>
                <div>
                  <span className="font-medium">{price.product}</span>
                  {price.productEn && price.productEn !== price.product && (
                    <span className="text-xs text-muted-foreground ml-2">({price.productEn})</span>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-right font-mono text-sm">
                {price.minPrice?.toFixed(4) || price.price?.toLocaleString()} {price.unit}
              </TableCell>
              <TableCell className="text-right font-mono text-sm">
                {price.maxPrice?.toFixed(4) || '-'} {price.maxPrice ? price.unit : ''}
              </TableCell>
              <TableCell className="text-right font-mono text-sm font-medium">
                {price.avgPrice?.toFixed(4) || '-'} {price.avgPrice ? price.unit : ''}
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">{price.date}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  };

  const renderMonthlyTable = (data, exchange) => {
    if (!data || !data.products || data.products.length === 0) {
      return (
        <div className="text-center py-6">
          <Building2 className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No data for this month</p>
        </div>
      );
    }
    return (
      <Table data-testid={`${exchange.toLowerCase()}-monthly-table`}>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead className="text-right">Min</TableHead>
            <TableHead className="text-right">Max</TableHead>
            <TableHead className="text-right">Avg</TableHead>
            <TableHead className="text-right">Data Points</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.products.map((p, idx) => (
            <TableRow key={idx}>
              <TableCell>
                <div>
                  <span className="font-medium">{p.product}</span>
                  {p.productEn && p.productEn !== p.product && (
                    <span className="text-xs text-muted-foreground ml-2">({p.productEn})</span>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-right font-mono text-sm">{p.minPrice?.toFixed(4)} {p.unit}</TableCell>
              <TableCell className="text-right font-mono text-sm">{p.maxPrice?.toFixed(4)} {p.unit}</TableCell>
              <TableCell className="text-right font-mono text-sm font-medium">{p.avgPrice?.toFixed(4)} {p.unit}</TableCell>
              <TableCell className="text-right text-sm text-muted-foreground">{p.dataPoints} day(s)</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  };

  const years = getYears();

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-center">
        <h2 className="text-lg font-semibold text-green-700" data-testid="turkish-exchanges-title">Turkish Commodity Exchange Prices</h2>
      </div>
      <div className="flex items-center justify-end gap-2">
          <Button onClick={handleScrapeExchanges} disabled={scrapingKTB} size="sm" variant="outline" data-testid="fetch-prices-btn">
            {scrapingKTB ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Fetch Prices
          </Button>
          <Button onClick={() => setTurkishDialogOpen(true)} size="sm" data-testid="add-price-btn">
            <Plus className="h-4 w-4 mr-2" />Add Price
          </Button>
      </div>

      {/* Historical Navigation */}
      <Card className="p-3">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Historical Data</span>
            {viewMode !== 'latest' && (
              <Button variant="ghost" size="sm" className="h-7 ml-auto" onClick={handleBackToLatest} data-testid="back-to-latest-btn">
                <ChevronLeft className="h-4 w-4 mr-1" />Back to Latest
              </Button>
            )}
          </div>

          {/* View Mode Tabs */}
          <div className="flex gap-2">
            <Button size="sm" variant={viewMode === 'latest' ? 'default' : 'outline'} onClick={handleBackToLatest} data-testid="view-latest-btn">Latest</Button>
            <Button size="sm" variant={viewMode === 'daily' ? 'default' : 'outline'} 
              onClick={() => setViewMode(viewMode === 'daily' ? 'latest' : 'daily')} data-testid="view-daily-btn">Daily</Button>
            <Button size="sm" variant={viewMode === 'monthly' ? 'default' : 'outline'} 
              onClick={() => { setViewMode('monthly'); fetchMonthlyData(selectedYear, selectedMonth); }} data-testid="view-monthly-btn">Monthly</Button>
          </div>

          {/* Daily View: Year > Month > Date navigation */}
          {viewMode === 'daily' && years.length > 0 && (
            <div className="space-y-2">
              {/* Year selector */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-muted-foreground mr-1">Year:</span>
                {years.map(y => (
                  <Button key={y} size="sm" variant={selectedYear === y ? 'default' : 'outline'} className="h-7 text-xs"
                    onClick={() => setSelectedYear(y)} data-testid={`hist-year-${y}`}>
                    {y}
                  </Button>
                ))}
              </div>
              {/* Month selector */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-muted-foreground mr-1">Month:</span>
                {getMonthsForYear(selectedYear).map(m => (
                  <Button key={m} size="sm" variant={selectedMonth === m ? 'default' : 'outline'} className="h-7 text-xs"
                    onClick={() => setSelectedMonth(m)} data-testid={`hist-month-${m}`}>
                    {MONTHS_SHORT[m - 1]}
                  </Button>
                ))}
              </div>
              {/* Date selector */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-muted-foreground mr-1">Date:</span>
                {getDatesForMonth(selectedYear, selectedMonth).map(d => (
                  <Button key={d} size="sm" variant={selectedDate === d ? 'default' : 'outline'} className="h-7 text-xs"
                    onClick={() => handleDateSelect(d)} data-testid={`hist-date-${d}`}>
                    {d.split('.')[0]} {MONTHS_SHORT[parseInt(d.split('.')[1]) - 1]}
                  </Button>
                ))}
                {getDatesForMonth(selectedYear, selectedMonth).length === 0 && (
                  <span className="text-xs text-muted-foreground">No data for this period</span>
                )}
              </div>
            </div>
          )}

          {/* Monthly View: Year > Month navigation */}
          {viewMode === 'monthly' && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-muted-foreground mr-1">Year:</span>
                {(years.length > 0 ? years : [new Date().getFullYear()]).map(y => (
                  <Button key={y} size="sm" variant={selectedYear === y ? 'default' : 'outline'} className="h-7 text-xs"
                    onClick={() => { setSelectedYear(y); fetchMonthlyData(y, selectedMonth); }}>
                    {y}
                  </Button>
                ))}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-muted-foreground mr-1">Month:</span>
                {MONTHS_SHORT.map((m, idx) => {
                  const monthNum = idx + 1;
                  const hasData = getMonthsForYear(selectedYear).includes(monthNum);
                  return (
                    <Button key={m} size="sm" variant={selectedMonth === monthNum ? 'default' : 'outline'}
                      className={`h-7 text-xs ${!hasData ? 'opacity-50' : ''}`}
                      disabled={!hasData}
                      onClick={() => handleMonthSelect(selectedYear, monthNum)}>
                      {m}
                    </Button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Current View Label */}
      {viewMode === 'daily' && selectedDate && (
        <div className="text-center">
          <p className="text-sm font-medium text-muted-foreground">
            Showing prices for: <span className="text-foreground font-semibold">{selectedDate}</span>
          </p>
        </div>
      )}
      {viewMode === 'monthly' && (
        <div className="text-center">
          <p className="text-sm font-medium text-muted-foreground">
            Monthly Average: <span className="text-foreground font-semibold">{MONTHS[selectedMonth - 1]} {selectedYear}</span>
          </p>
        </div>
      )}

      {/* KTB Card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Konya Ticaret Borsasi (KTB)
          </CardTitle>
          <CardDescription>Source: ktb.org.tr</CardDescription>
        </CardHeader>
        <CardContent>
          {viewMode === 'monthly' ? (
            monthlyLoading ? (
              <div className="flex items-center justify-center py-6"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : renderMonthlyTable(monthlyData.KTB, 'KTB')
          ) : renderExchangeTable(ktbPrices, 'KTB', 'ktb-prices-table')}
        </CardContent>
      </Card>

      {/* GTB Card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Gaziantep Ticaret Borsasi (GTB)
          </CardTitle>
          <CardDescription>Source: gtb.org.tr - Salon Satis Fiyatlari</CardDescription>
        </CardHeader>
        <CardContent>
          {viewMode === 'monthly' ? (
            monthlyLoading ? (
              <div className="flex items-center justify-center py-6"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : renderMonthlyTable(monthlyData.GTB, 'GTB')
          ) : renderExchangeTable(gtbPrices, 'GTB', 'gtb-prices-table')}
        </CardContent>
      </Card>

      {/* Add Price Dialog */}
      <Dialog open={turkishDialogOpen} onOpenChange={setTurkishDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Turkish Exchange Price</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Exchange</Label>
                <Select value={turkishForm.exchange} onValueChange={(v) => setTurkishForm({ ...turkishForm, exchange: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="KTB">Konya (KTB)</SelectItem>
                    <SelectItem value="GTB">Gaziantep (GTB)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={turkishForm.date} onChange={(e) => setTurkishForm({ ...turkishForm, date: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Product</Label>
              <Input value={turkishForm.product} onChange={(e) => setTurkishForm({ ...turkishForm, product: e.target.value })} placeholder="e.g., Bugday, Misir" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Price</Label>
                <Input type="number" value={turkishForm.price} onChange={(e) => setTurkishForm({ ...turkishForm, price: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Unit</Label>
                <Select value={turkishForm.unit} onValueChange={(v) => setTurkishForm({ ...turkishForm, unit: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TRY/KG">TRY/KG</SelectItem>
                    <SelectItem value="TRY/TON">TRY/TON</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Category (optional)</Label>
              <Input value={turkishForm.category} onChange={(e) => setTurkishForm({ ...turkishForm, category: e.target.value })} placeholder="e.g., Ekmeklik, Makarnalk" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTurkishDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveTurkishPrice} data-testid="save-turkish-price-btn">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
