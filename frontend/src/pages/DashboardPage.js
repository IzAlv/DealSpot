import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Progress } from '../components/ui/progress';
import { TRADE_STATUS_CONFIG } from '../lib/constants';
import {
  ArrowUpRight, TrendingUp, Plus, CheckCircle2, Clock, AlertCircle,
  Ship, CalendarDays, DollarSign, Users, Building, Box
} from 'lucide-react';
import { format, isAfter, startOfDay, parseISO } from 'date-fns';

export default function DashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [events, setEvents] = useState([]);
  const [trades, setTrades] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, eventsRes, tradesRes, invoicesRes] = await Promise.all([
          api.get('/api/trades/stats/overview'),
          api.get('/api/events'),
          api.get('/api/trades'),
          api.get('/api/invoices'),
        ]);
        setStats(statsRes.data);
        setEvents(eventsRes.data);
        setTrades(tradesRes.data);
        setInvoices(invoicesRes.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const upcomingEvents = useMemo(() => {
    const today = startOfDay(new Date());
    return events.filter(e => {
      try {
        const d = parseISO(e.date);
        return isAfter(d, today) || format(d, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd');
      } catch { return false; }
    }).sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [events]);

  const pendingInvoices = useMemo(() => {
    return invoices.filter(i => i.status === 'pending').sort((a, b) => {
      try { return new Date(a.dueDate) - new Date(b.dueDate); } catch { return 0; }
    });
  }, [invoices]);

  const upcomingItems = useMemo(() => {
    const items = [];
    pendingInvoices.forEach(inv => {
      items.push({ id: inv.id, type: 'invoice', title: `Invoice ${inv.invoiceNumber} - ${inv.vendorName}`, subtitle: `${inv.currency} ${inv.amount?.toLocaleString()}`, date: inv.dueDate, icon: 'payment' });
    });
    upcomingEvents.forEach(evt => {
      items.push({ id: evt.id, type: 'event', title: evt.title, subtitle: evt.type, date: evt.date, icon: evt.type });
    });
    items.sort((a, b) => { try { return new Date(a.date) - new Date(b.date); } catch { return 0; } });
    return items;
  }, [pendingInvoices, upcomingEvents]);

  const completionRate = stats ? stats.completionRate : 0;
  const recentTrades = trades.slice(0, 5);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div className="space-y-6" data-testid="dashboard-page">

      {/* KPI Cards + Upcoming Events as 4th card */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card className="relative overflow-hidden p-1.5 md:p-2 cursor-pointer hover:shadow-md transition-shadow" data-testid="kpi-ongoing-trades" onClick={() => navigate('/trades', { state: { scrollTo: 'trades-ongoing' } })}>
          <CardHeader className="flex flex-row items-center justify-between pb-1 pt-1">
            <CardTitle className="text-xs md:text-sm font-semibold text-muted-foreground">Ongoing Trades</CardTitle>
            <div className="flex h-7 w-7 md:h-8 md:w-8 items-center justify-center rounded-lg bg-blue-100">
              <Ship className="h-3.5 w-3.5 md:h-4 md:w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent className="pb-2">
            <div className="text-2xl md:text-3xl font-bold mt-1">{stats?.activeTrades || 0}</div>
            <div className="mt-1 flex items-center gap-1 text-xs text-secondary"><TrendingUp className="h-3 w-3" /><span>In transit</span></div>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden p-1.5 md:p-2 cursor-pointer hover:shadow-md transition-shadow" data-testid="kpi-pending-trades" onClick={() => navigate('/trades', { state: { scrollTo: 'trades-pending' } })}>
          <CardHeader className="flex flex-row items-center justify-between pb-1 pt-1">
            <CardTitle className="text-xs md:text-sm font-semibold text-muted-foreground">Pending Trades</CardTitle>
            <div className="flex h-7 w-7 md:h-8 md:w-8 items-center justify-center rounded-lg bg-amber-100">
              <Clock className="h-3.5 w-3.5 md:h-4 md:w-4 text-amber-600" />
            </div>
          </CardHeader>
          <CardContent className="pb-2">
            <div className="text-2xl md:text-3xl font-bold mt-1">{stats?.pendingTrades || 0}</div>
            <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><AlertCircle className="h-3 w-3" /><span>Awaiting confirmation</span></div>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden p-1.5 md:p-2 cursor-pointer hover:shadow-md transition-shadow" data-testid="kpi-completed-trades" onClick={() => navigate('/trades', { state: { scrollTo: 'trades-completed' } })}>
          <CardHeader className="flex flex-row items-center justify-between pb-1 pt-1">
            <CardTitle className="text-xs md:text-sm font-semibold text-muted-foreground">Completed Trades</CardTitle>
            <div className="flex h-7 w-7 md:h-8 md:w-8 items-center justify-center rounded-lg bg-green-50">
              <CheckCircle2 className="h-3.5 w-3.5 md:h-4 md:w-4 text-secondary" />
            </div>
          </CardHeader>
          <CardContent className="pb-2">
            <div className="text-2xl md:text-3xl font-bold mt-1">{stats?.completedTrades || 0}</div>
            <div className="mt-1 flex items-center gap-1 text-xs text-secondary"><TrendingUp className="h-3 w-3" /><span>Increased from last month</span></div>
          </CardContent>
        </Card>

        {/* Upcoming Payments & Events - 4th card */}
        <Card data-testid="upcoming-payments-events" className="relative overflow-hidden p-1.5 md:p-2 cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/calendar')}>
          <CardHeader className="pb-1 pt-1">
            <CardTitle className="text-xs md:text-sm font-semibold text-muted-foreground text-center">Upcoming Payments & Events</CardTitle>
            <CardDescription className="text-xs text-center">Due invoices, meetings, and conferences</CardDescription>
          </CardHeader>
          <CardContent>
            {upcomingItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-4 text-center">
                <Button variant="outline" size="sm" className="mb-4 rounded-full" onClick={(e) => { e.stopPropagation(); navigate('/calendar'); }}>View Calendar <ArrowUpRight className="ml-1 h-3 w-3" /></Button>
                <CalendarDays className="h-10 w-10 text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">No upcoming items</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {upcomingItems.slice(0, 3).map((item) => (
                  <div key={`${item.type}-${item.id}`} className="flex items-center gap-2 p-2 rounded-lg border bg-muted/30">
                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                      item.icon === 'payment' || item.type === 'invoice' ? 'bg-green-100' :
                      item.icon === 'meeting' ? 'bg-blue-100' :
                      item.icon === 'conference' ? 'bg-purple-100' : 'bg-gray-100'
                    }`}>
                      {item.icon === 'payment' || item.type === 'invoice' ? <DollarSign className="h-3.5 w-3.5 text-green-600" /> :
                       item.icon === 'meeting' ? <Users className="h-3.5 w-3.5 text-blue-600" /> :
                       item.icon === 'conference' ? <Building className="h-3.5 w-3.5 text-purple-600" /> :
                       <CalendarDays className="h-3.5 w-3.5 text-gray-600" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{item.title}</p>
                      <p className="text-[10px] text-muted-foreground">{(() => { try { return format(parseISO(item.date), 'MMM d, yyyy'); } catch { return ''; }})()}</p>
                    </div>
                  </div>
                ))}
                {upcomingItems.length > 3 && (
                  <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => navigate('/calendar')}>+{upcomingItems.length - 3} more</Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Trade Progress - Full Width */}
      <Card data-testid="trade-progress">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Trade Progress</CardTitle>
              <CardDescription>Overall completion rate</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate('/trades')}>View All <ArrowUpRight className="ml-1 h-3 w-3" /></Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-6">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{completionRate}% Trades Completed</span>
            </div>
            <Progress value={completionRate} className="h-3" />
            <div className="mt-4 flex gap-6">
              <div className="flex items-center gap-2"><div className="h-3 w-3 rounded-full bg-secondary" /><span className="text-sm text-muted-foreground">Completed</span></div>
              <div className="flex items-center gap-2"><div className="h-3 w-3 rounded-full bg-primary" /><span className="text-sm text-muted-foreground">In Progress</span></div>
              <div className="flex items-center gap-2"><div className="h-3 w-3 rounded-full bg-amber-400" /><span className="text-sm text-muted-foreground">Pending</span></div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {recentTrades.length === 0 ? (
              <div className="col-span-full flex flex-col items-center justify-center py-8 text-center">
                <Box className="mb-3 h-10 w-10 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">No trades yet</p>
              </div>
            ) : (
              recentTrades.map((trade) => (
                <div key={trade.id} className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/50 cursor-pointer" onClick={() => navigate('/trades')}>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><Box className="h-5 w-5 text-primary" /></div>
                    <div>
                      <p className="font-medium">{trade.commodityDisplayName || trade.commodityName || 'Unknown'}</p>
                      <p className="text-xs text-muted-foreground">Due: {(() => { try { return format(parseISO(trade.shipmentWindowEnd), 'MMM d, yyyy'); } catch { return '-'; } })()}</p>
                    </div>
                  </div>
                  <Badge className={TRADE_STATUS_CONFIG[trade.status]?.color || 'bg-slate-100 text-slate-600'}>
                    {TRADE_STATUS_CONFIG[trade.status]?.label || trade.status}
                  </Badge>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
