import { useState, useEffect } from 'react';
import api from '../../lib/api';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';
import { Calendar as CalendarPicker } from '../../components/ui/calendar';
import { format, parse } from 'date-fns';
import { Plus, Trash2, Pencil, ChevronDown, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import { toast } from 'sonner';

const CATEGORIES = [
  { value: 'tmo', label: 'Turkiye - TMO Tenders', title: 'TMO / Turkish Grain Board - Tenders & Results' },
  { value: 'sago', label: 'Saudi Arabia - SAGO Tenders', title: 'SAGO / Saudi Grains Organization - Tenders & Results' },
  { value: 'algeria', label: 'Algeria - OAIC Tenders', title: 'Algeria (OAIC) - Tenders & Results' },
  { value: 'jordan', label: 'Jordan - MIT Tenders', title: 'Jordan MIT (Ministry of Industry and Trade) Tenders & Results' },
];

const TMO_PORTS = [
  'Iskenderun', 'Bandirma', 'Tekirdag', 'Karasu', 'Izmir', 'Samsun', 'Mersin', 'Adana', 'Trabzon'
];

const SAGO_PORTS = ['Jeddah', 'Dammam', 'Jubail', 'Yanbu'];
const ALGERIA_PORTS = ['Algiers', 'Oran', 'Annaba', 'Bejaia', 'Skikda', 'Mostaganem', 'Djen Djen'];
const JORDAN_PORTS = ['Aqaba'];

const PORT_MAP = {
  tmo: TMO_PORTS,
  sago: SAGO_PORTS,
  algeria: ALGERIA_PORTS,
  jordan: JORDAN_PORTS,
};

export default function TMOTendersTab() {
  const [activeCategory, setActiveCategory] = useState('tmo');
  const [tenders, setTenders] = useState([]);
  const [tenderDialogOpen, setTenderDialogOpen] = useState(false);
  const [tenderForm, setTenderForm] = useState({ 
    tenderDate: '', commodity: 'Feed Barley', totalQuantity: 0, tenderType: 'Import',
    shipmentPeriodStart: '', shipmentPeriodEnd: '', status: 'open', results: [], category: 'tmo'
  });
  const [editingTender, setEditingTender] = useState(null);
  const [resultDialogOpen, setResultDialogOpen] = useState(false);
  const [resultForm, setResultForm] = useState({ port: '', company: '', quantity: '', cifPrice: '', exwPrice: '' });
  const [selectedTenderForResult, setSelectedTenderForResult] = useState(null);
  const [editingResultIndex, setEditingResultIndex] = useState(null);
  const [expandedTenders, setExpandedTenders] = useState({});

  useEffect(() => { fetchTenders(); }, []);

  const fetchTenders = async () => {
    try {
      const res = await api.get('/api/market/tenders');
      setTenders(res.data);
    } catch (err) { console.error('Failed to load tenders'); }
  };

  const categoryTenders = tenders
    .filter(t => (t.category || 'tmo') === activeCategory)
    .sort((a, b) => {
      const parseDate = (d) => { if (!d) return 0; const parts = d.split('/'); if (parts.length === 3) return new Date(parts[2], parts[1] - 1, parts[0]).getTime(); return 0; };
      return parseDate(b.tenderDate) - parseDate(a.tenderDate);
    });

  const activeCategoryInfo = CATEGORIES.find(c => c.value === activeCategory);
  const activePorts = PORT_MAP[activeCategory] || TMO_PORTS;

  const handleSaveTender = async () => {
    try {
      const payload = { ...tenderForm, category: activeCategory };
      if (editingTender) {
        await api.put(`/api/market/tenders/${editingTender.id}`, payload);
        toast.success('Tender updated');
      } else {
        await api.post('/api/market/tenders', payload);
        toast.success('Tender created');
      }
      setTenderDialogOpen(false);
      setTenderForm({ tenderDate: '', commodity: 'Feed Barley', totalQuantity: 0, tenderType: 'Import', shipmentPeriodStart: '', shipmentPeriodEnd: '', status: 'open', results: [], category: activeCategory });
      setEditingTender(null);
      fetchTenders();
    } catch (err) { toast.error('Failed to save tender'); }
  };

  const handleAddResult = async () => {
    if (!selectedTenderForResult) return;
    try {
      const payload = {
        port: resultForm.port, company: resultForm.company,
        quantity: parseFloat(resultForm.quantity) || 0,
        cifPrice: resultForm.cifPrice ? parseFloat(resultForm.cifPrice) : null,
        exwPrice: resultForm.exwPrice ? parseFloat(resultForm.exwPrice) : null,
      };
      if (editingResultIndex !== null) {
        await api.put(`/api/market/tenders/${selectedTenderForResult.id}/results/${editingResultIndex}`, payload);
        toast.success('Result updated');
      } else {
        await api.post(`/api/market/tenders/${selectedTenderForResult.id}/results`, payload);
        toast.success('Result added');
      }
      setResultDialogOpen(false);
      setResultForm({ port: '', company: '', quantity: '', cifPrice: '', exwPrice: '' });
      setSelectedTenderForResult(null);
      setEditingResultIndex(null);
      fetchTenders();
    } catch (err) { toast.error('Failed to save result'); }
  };

  const handleDeleteResult = async (tender, resultIdx) => {
    try { await api.delete(`/api/market/tenders/${tender.id}/results/${resultIdx}`); toast.success('Result deleted'); fetchTenders(); } catch (err) { toast.error('Failed to delete result'); }
  };

  const handleDeleteTender = async (tenderId) => {
    try { await api.delete(`/api/market/tenders/${tenderId}`); toast.success('Tender deleted'); fetchTenders(); } catch (err) { toast.error('Failed to delete tender'); }
  };

  return (
    <div className="space-y-4 mt-4">
      <Tabs value={activeCategory} onValueChange={setActiveCategory}>
        <TabsList className="w-full flex" data-testid="tender-category-tabs">
          {CATEGORIES.map(c => (
            <TabsTrigger key={c.value} value={c.value} className="flex-1" data-testid={`tender-cat-${c.value}`}>{c.label}</TabsTrigger>
          ))}
        </TabsList>

        {CATEGORIES.map(cat => (
          <TabsContent key={cat.value} value={cat.value}>
            <div className="space-y-4 mt-8">
              <div className="flex items-center justify-between">
                <div className="flex-1" />
                <h2 className="text-lg font-semibold text-green-700" data-testid="tenders-title">{cat.title}</h2>
                <div className="flex-1 flex justify-end">
                  <Button data-testid="new-tender-btn" onClick={() => {
                    setTenderForm({ tenderDate: '', commodity: 'Feed Barley', totalQuantity: 0, tenderType: 'Import', shipmentPeriodStart: '', shipmentPeriodEnd: '', status: 'open', results: [], category: cat.value });
                    setEditingTender(null);
                    setTenderDialogOpen(true);
                  }} size="sm">
                    <Plus className="h-4 w-4 mr-2" />New Tender
                  </Button>
                </div>
              </div>

              {categoryTenders.length === 0 ? (
                <Card><CardContent className="py-8"><p className="text-center text-muted-foreground">No {cat.label.toLowerCase()} recorded yet.</p></CardContent></Card>
              ) : (
                <div className="space-y-6">
                  {categoryTenders.map((tender) => {
                    const totalQty = tender.results?.reduce((sum, r) => sum + (parseFloat(r.quantity) || parseFloat(r.sizeKMT) || 0), 0) || 0;
                    return (
                      <Card key={tender.id} className="overflow-hidden border-2 border-border" data-testid={`tender-card-${tender.id}`}>
                        <div className="cursor-pointer select-none" onClick={() => setExpandedTenders(prev => ({ ...prev, [tender.id]: !prev[tender.id] }))}>
                          <div className="bg-muted border-b border-border px-4 py-2 flex items-center">
                            {expandedTenders[tender.id] ? <ChevronDown className="h-5 w-5 mr-2 text-muted-foreground shrink-0" /> : <ChevronRight className="h-5 w-5 mr-2 text-muted-foreground shrink-0" />}
                            <h3 className="font-bold text-sm tracking-wide text-center flex-1 text-green-700 dark:text-green-400">
                              {(tender.totalQuantity || 0).toLocaleString('en-US')} Mts {tender.commodity} {tender.tenderType || 'Import'} Tender - Dated: {tender.tenderDate}
                            </h3>
                          </div>
                          <div className="bg-muted border-b border-border px-4 py-1.5 text-center">
                            <p className="font-medium text-sm text-muted-foreground">
                              {tender.shipmentPeriodStart && tender.shipmentPeriodEnd
                                ? `Shipment Period: ${tender.shipmentPeriodStart} - ${tender.shipmentPeriodEnd}`
                                : 'Shipment Period: TBD'}
                            </p>
                          </div>
                        </div>

                        {expandedTenders[tender.id] && (
                          <>
                            <CardContent className="p-0">
                              <Table className="border-collapse [&_th]:border [&_th]:border-border [&_td]:border [&_td]:border-border [&_th]:align-middle [&_td]:align-middle">
                                <TableHeader>
                                  <TableRow className="bg-muted">
                                    <TableHead className="font-bold text-green-700 dark:text-green-400 text-sm text-center">Company</TableHead>
                                    <TableHead className="font-bold text-green-700 dark:text-green-400 text-sm text-center">Port</TableHead>
                                    <TableHead className="font-bold text-green-700 dark:text-green-400 text-sm text-center">Quantity (Mts)</TableHead>
                                    <TableHead className="font-bold text-green-700 dark:text-green-400 text-sm text-center">CIF</TableHead>
                                    <TableHead className="font-bold text-green-700 dark:text-green-400 text-sm text-center">EXW</TableHead>
                                    <TableHead className="font-bold text-sm text-center w-20"></TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {tender.results?.length > 0 ? (
                                    <>
                                      {tender.results.map((result, idx) => (
                                        <TableRow key={idx}>
                                          <TableCell className="font-medium py-4 text-center">{result.company || result.winner}</TableCell>
                                          <TableCell className="py-4 text-center">{result.port}</TableCell>
                                          <TableCell className="text-center font-mono py-4">{(parseFloat(result.quantity) || parseFloat(result.sizeKMT) || 0).toLocaleString('de-DE')}</TableCell>
                                          <TableCell className="text-center font-mono py-4">
                                            {result.cifPrice != null ? parseFloat(result.cifPrice).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''}
                                          </TableCell>
                                          <TableCell className="text-center font-mono py-4">
                                            {result.exwPrice != null ? `$${parseFloat(result.exwPrice).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ''}
                                          </TableCell>
                                          <TableCell className="text-center py-4">
                                            <div className="flex items-center justify-center gap-1">
                                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation();
                                                setSelectedTenderForResult(tender); setEditingResultIndex(idx);
                                                setResultForm({ port: result.port || '', company: result.company || result.winner || '', quantity: String(result.quantity || result.sizeKMT || ''), cifPrice: result.cifPrice != null ? String(result.cifPrice) : '', exwPrice: result.exwPrice != null ? String(result.exwPrice) : '' });
                                                setResultDialogOpen(true);
                                              }}><Pencil className="h-3.5 w-3.5 text-muted-foreground" /></Button>
                                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); handleDeleteResult(tender, idx); }}>
                                                <Trash2 className="h-3.5 w-3.5 text-red-500" />
                                              </Button>
                                            </div>
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                      <TableRow className="font-bold">
                                        <TableCell className="font-bold text-base py-4 text-center">TOTAL</TableCell>
                                        <TableCell className="py-4 text-center"></TableCell>
                                        <TableCell className="text-center font-mono font-bold text-base py-4">{totalQty.toLocaleString('de-DE')}</TableCell>
                                        <TableCell className="py-4 text-center"></TableCell>
                                        <TableCell className="py-4 text-center"></TableCell>
                                        <TableCell className="py-4 text-center"></TableCell>
                                      </TableRow>
                                    </>
                                  ) : (
                                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No results added yet</TableCell></TableRow>
                                  )}
                                </TableBody>
                              </Table>
                            </CardContent>
                            <div className="px-4 py-2 bg-muted/20 flex items-center justify-between border-t">
                              <Badge variant={tender.status === 'awarded' ? 'default' : 'secondary'} className={tender.status === 'awarded' ? 'bg-green-600 text-white' : ''}>
                                {tender.status?.toUpperCase()}
                              </Badge>
                              <div className="flex gap-2">
                                <Button variant="outline" size="sm" data-testid={`add-result-btn-${tender.id}`} onClick={() => {
                                  setSelectedTenderForResult(tender); setEditingResultIndex(null);
                                  setResultForm({ port: '', company: '', quantity: '', cifPrice: '', exwPrice: '' });
                                  setResultDialogOpen(true);
                                }}><Plus className="h-4 w-4 mr-1" />Add Result</Button>
                                <Button variant="ghost" size="sm" data-testid={`edit-tender-btn-${tender.id}`} onClick={() => { setEditingTender(tender); setTenderForm(tender); setTenderDialogOpen(true); }}>
                                  <Pencil className="h-4 w-4 mr-1" />Edit
                                </Button>
                                <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700" data-testid={`delete-tender-btn-${tender.id}`} onClick={() => handleDeleteTender(tender.id)}>
                                  <Trash2 className="h-4 w-4 mr-1" />Delete
                                </Button>
                              </div>
                            </div>
                          </>
                        )}
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </TabsContent>
        ))}
      </Tabs>

      {/* Tender Dialog */}
      <Dialog open={tenderDialogOpen} onOpenChange={setTenderDialogOpen}>
        <DialogContent className="sm:max-w-lg mx-auto">
          <DialogHeader>
            <DialogTitle className="text-center">{editingTender ? 'Edit Tender' : `New ${activeCategoryInfo?.label || 'Tender'}`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tender Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" data-testid="tender-date-input" className="w-full justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />{tenderForm.tenderDate || 'Pick a date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarPicker mode="single" selected={tenderForm.tenderDate ? parse(tenderForm.tenderDate, 'dd/MM/yyyy', new Date()) : undefined} onSelect={(date) => { if (date) setTenderForm({ ...tenderForm, tenderDate: format(date, 'dd/MM/yyyy') }); }} initialFocus />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>Commodity</Label>
                <Select value={tenderForm.commodity} onValueChange={(v) => setTenderForm({ ...tenderForm, commodity: v })}>
                  <SelectTrigger data-testid="tender-commodity-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Feed Barley">Feed Barley</SelectItem>
                    <SelectItem value="Wheat">Wheat</SelectItem>
                    <SelectItem value="Feed Corn">Feed Corn</SelectItem>
                    <SelectItem value="Durum Wheat">Durum Wheat</SelectItem>
                    <SelectItem value="Milling Wheat">Milling Wheat</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Quantity (Mts)</Label>
                <Input data-testid="tender-quantity-input" type="number" value={tenderForm.totalQuantity || ''} onChange={(e) => setTenderForm({ ...tenderForm, totalQuantity: parseFloat(e.target.value) || 0 })} placeholder="e.g., 220000" />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={tenderForm.tenderType || 'Import'} onValueChange={(v) => setTenderForm({ ...tenderForm, tenderType: v })}>
                  <SelectTrigger data-testid="tender-type-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Import">Import</SelectItem>
                    <SelectItem value="Export">Export</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Shipment Period From</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" data-testid="tender-shipment-start" className="w-full justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />{tenderForm.shipmentPeriodStart || 'Pick a date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarPicker mode="single" selected={tenderForm.shipmentPeriodStart ? parse(tenderForm.shipmentPeriodStart, 'dd/MM/yyyy', new Date()) : undefined} onSelect={(date) => { if (date) setTenderForm({ ...tenderForm, shipmentPeriodStart: format(date, 'dd/MM/yyyy') }); }} initialFocus />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>Shipment Period To</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" data-testid="tender-shipment-end" className="w-full justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />{tenderForm.shipmentPeriodEnd || 'Pick a date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarPicker mode="single" selected={tenderForm.shipmentPeriodEnd ? parse(tenderForm.shipmentPeriodEnd, 'dd/MM/yyyy', new Date()) : undefined} onSelect={(date) => { if (date) setTenderForm({ ...tenderForm, shipmentPeriodEnd: format(date, 'dd/MM/yyyy') }); }} initialFocus />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={tenderForm.status} onValueChange={(v) => setTenderForm({ ...tenderForm, status: v })}>
                <SelectTrigger data-testid="tender-status-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                  <SelectItem value="awarded">Awarded</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTenderDialogOpen(false)}>Cancel</Button>
            <Button data-testid="save-tender-btn" onClick={handleSaveTender}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Result Dialog */}
      <Dialog open={resultDialogOpen} onOpenChange={setResultDialogOpen}>
        <DialogContent className="sm:max-w-md mx-auto">
          <DialogHeader>
            <DialogTitle className="text-center">{editingResultIndex !== null ? 'Edit Tender Result' : 'Add Tender Result'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Company</Label>
                <Input data-testid="result-company-input" value={resultForm.company} onChange={(e) => setResultForm({ ...resultForm, company: e.target.value })} placeholder="e.g., Arion, Bunge" />
              </div>
              <div className="space-y-2">
                <Label>Port</Label>
                <Select value={resultForm.port} onValueChange={(v) => setResultForm({ ...resultForm, port: v })}>
                  <SelectTrigger data-testid="result-port-input"><SelectValue placeholder="Select port" /></SelectTrigger>
                  <SelectContent>
                    {activePorts.map((port) => (<SelectItem key={port} value={port}>{port}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Quantity (MTS)</Label>
              <Input data-testid="result-quantity-input" type="number" step="0.1" value={resultForm.quantity} onChange={(e) => setResultForm({ ...resultForm, quantity: e.target.value })} placeholder="e.g., 25000" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>CIF Price (USD/MT)</Label>
                <Input data-testid="result-cif-input" type="number" step="0.01" value={resultForm.cifPrice} onChange={(e) => setResultForm({ ...resultForm, cifPrice: e.target.value })} placeholder="e.g., 326.70" />
              </div>
              <div className="space-y-2">
                <Label>EXW Price (USD/MT)</Label>
                <Input data-testid="result-exw-input" type="number" step="0.01" value={resultForm.exwPrice} onChange={(e) => setResultForm({ ...resultForm, exwPrice: e.target.value })} placeholder="e.g., 329.50" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Fill in CIF or EXW price (or both). Leave blank if not applicable.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResultDialogOpen(false)}>Cancel</Button>
            <Button data-testid="add-result-submit-btn" onClick={handleAddResult}>{editingResultIndex !== null ? 'Save' : 'Add Result'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
