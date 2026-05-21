import { useState, useEffect, useMemo } from 'react';
import api from '../lib/api';
import { DOCUMENT_TYPES } from '../lib/constants';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { FolderOpen, Search, CheckCircle2, Clock, AlertCircle, Loader2, Filter, Ship } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function DocumentsPage() {
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    const fetch = async () => {
      try {
        const [tr] = await Promise.all([api.get('/api/trades')]);
        setTrades(tr.data);
      } catch (err) { console.error(err); } finally { setLoading(false); }
    };
    fetch();
  }, []);

  const tradeDocData = useMemo(() => {
    return trades.map(trade => {
      const uploaded = 0; // We track doc status via trade metadata
      const total = DOCUMENT_TYPES.length;
      return { trade, uploadedCount: uploaded, totalCount: total, status: 'pending' };
    });
  }, [trades]);

  const stats = useMemo(() => {
    const total = trades.length * DOCUMENT_TYPES.length;
    return { total, uploaded: 0, pending: total };
  }, [trades]);

  const filtered = useMemo(() => {
    let list = tradeDocData;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(d => d.trade.referenceNumber?.toLowerCase().includes(q) || d.trade.commodityName?.toLowerCase().includes(q) || d.trade.sellerName?.toLowerCase().includes(q) || d.trade.buyerName?.toLowerCase().includes(q));
    }
    return list;
  }, [tradeDocData, search]);

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <div></div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Required</CardTitle><FolderOpen className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{stats.total}</div></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Uploaded</CardTitle><CheckCircle2 className="h-4 w-4 text-green-500" /></CardHeader><CardContent><div className="text-2xl font-bold text-green-600">{stats.uploaded}</div></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle><Clock className="h-4 w-4 text-amber-500" /></CardHeader><CardContent><div className="text-2xl font-bold text-amber-600">{stats.pending}</div></CardContent></Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1 max-w-xs"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Search by contract, commodity, or partner..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" /></div>
          </div>

          <div className="overflow-x-auto border rounded-lg">
            <Table className="trade-table">
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Contract No</TableHead>
                  <TableHead>Commodity</TableHead>
                  <TableHead>Seller</TableHead>
                  <TableHead>Buyer</TableHead>
                  <TableHead>Vessel</TableHead>
                  {DOCUMENT_TYPES.map(dt => <TableHead key={dt.id} className="text-center text-xs">{dt.shortName}</TableHead>)}
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={7 + DOCUMENT_TYPES.length} className="text-center py-8 text-muted-foreground">No trades found</TableCell></TableRow>
                ) : filtered.map(({ trade }) => (
                  <TableRow key={trade.id}>
                    <TableCell className="font-medium text-primary">{trade.referenceNumber}</TableCell>
                    <TableCell className="text-sm max-w-[160px]">{trade.commodityName || '-'}</TableCell>
                    <TableCell className="text-sm">{trade.sellerCode || trade.sellerName || '-'}</TableCell>
                    <TableCell className="text-sm">{trade.buyerCode || trade.buyerName || '-'}</TableCell>
                    <TableCell className="text-sm uppercase">{trade.vesselName || '-'}</TableCell>
                    {DOCUMENT_TYPES.map(dt => (
                      <TableCell key={dt.id} className="text-center">
                        <Clock className="h-4 w-4 text-amber-400 mx-auto" />
                      </TableCell>
                    ))}
                    <TableCell className="text-center">
                      <Badge variant="secondary" className="bg-amber-100 text-amber-800">Pending</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
