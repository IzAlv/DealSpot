import { useState, useEffect } from 'react';
import api from '../../lib/api';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';
import { Send, Trash2, Plus, X, CalendarDays, Pencil, Check } from 'lucide-react';
import { toast } from 'sonner';

export default function IndicationsTab() {
  const [marketNews, setMarketNews] = useState({ Wheat: [], Corn: [], Barley: [], Others: [] });
  const [newsInput, setNewsInput] = useState({ Wheat: '', Corn: '', Barley: '', Others: '' });
  const [editingNote, setEditingNote] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [newsPeriod, setNewsPeriod] = useState(() => {
    const now = new Date();
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${String(now.getDate()).padStart(2,'0')}_${months[now.getMonth()]}_${now.getFullYear()}`;
  });
  const [archiveYears, setArchiveYears] = useState([]);
  const [newsNavLevel, setNewsNavLevel] = useState('day');
  const [newsSelectedYear, setNewsSelectedYear] = useState(new Date().getFullYear());
  const [newsSelectedMonth, setNewsSelectedMonth] = useState(new Date().getMonth());

  useEffect(() => {
    fetchMarketNews();
    fetchArchiveYears();
  }, [newsPeriod]);

  const fetchMarketNews = async (period) => {
    const p = period || newsPeriod;
    try {
      const categories = ['Wheat', 'Corn', 'Barley', 'Others'];
      const results = {};
      for (const cat of categories) {
        const res = await api.get(`/api/market/notes?commodity=${cat}&period=${p}`);
        results[cat] = res.data;
      }
      setMarketNews(results);
    } catch (err) {
      console.error('Failed to load market news');
    }
  };

  const fetchArchiveYears = async () => {
    try {
      const res = await api.get('/api/market/notes/years');
      setArchiveYears(res.data);
    } catch (err) {
      console.error('Failed to load archive years');
    }
  };

  const MONTHS3 = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const FROM_DAYS = [1, 5, 7, 10, 15, 20, 25];
  const TO_DAYS = [5, 7, 10, 15, 20, 25, 30, 31];
  const QUANTITIES = ['3K', '5K', '3-5K', '6K', '10K', '25K'];

  const COMMODITIES = [
    '11.5% Pro. MW', '12.5% Pro. MW', '13.5% Pro. MW', '14.5% Pro. MW', '15.3% Pro. MW',
    'Corn', 'Barley', 'Wheat Bran Pellets', 'Yellow Peas', 'Chickpeas'
  ];
  const BASE_PORTS = [
    { value: 'CIF Marmara', label: 'CIF Marmara' },
    { value: 'CIF Mersin', label: 'CIF Mersin' },
    { value: 'FOB POC', label: 'FOB POC' },
    { value: 'FOB Azov/Rostov', label: 'FOB Azov/Rostov' },
    { value: 'FOB Giurgiulesti', label: 'FOB Giurgiulesti' },
    { value: 'FOB Izmail', label: 'FOB Izmail' },
    { value: 'FOB Novorossiysk', label: 'FOB Novorossiysk' },
    { value: 'FOB Kavkaz', label: 'FOB Kavkaz' },
  ];
  const ORIGINS = ['Russia', 'Ukraine', 'Moldova'];

  const defaultIndForm = { side: 'Seller', commodity: '11.5% Pro. MW', basePort: 'CIF Marmara', origin: 'Russia', shipment: '', quantity: '', price: '', currency: 'USD' };
  const [indForm, setIndForm] = useState({ Wheat: { ...defaultIndForm }, Corn: { ...defaultIndForm, commodity: 'Corn' }, Barley: { ...defaultIndForm, commodity: 'Barley' }, Others: { ...defaultIndForm } });
  const [showForm, setShowForm] = useState({ Wheat: false, Corn: false, Barley: false, Others: false });

  const buildIndicationText = (f) => {
    const parts = [];
    parts.push(f.side);
    if (f.quantity) parts.push(`${f.quantity}`);
    if (f.origin) parts.push(f.origin.toLowerCase().substring(0, 4));
    if (f.commodity) parts.push(f.commodity);
    const sym = f.currency === 'EUR' ? '€' : '$';
    if (f.price) parts.push(`${sym}${f.price}`);
    if (f.basePort) parts.push(f.basePort);
    if (f.shipment) parts.push(f.shipment);
    return parts.join(' ');
  };

  const handlePostIndication = async (category) => {
    const f = indForm[category];
    const content = buildIndicationText(f);
    if (!content || content === f.side) { toast.error('Fill in at least some fields'); return; }
    try {
      await api.post('/api/market/notes', { commodity: category, period: newsPeriod, content, tags: [] });
      setIndForm(prev => ({ ...prev, [category]: { ...defaultIndForm, commodity: category === 'Wheat' ? '11.5% Pro. MW' : category === 'Corn' ? 'Corn' : category === 'Barley' ? 'Barley' : defaultIndForm.commodity } }));
      setShowForm(prev => ({ ...prev, [category]: false }));
      fetchMarketNews();
    } catch (err) {
      toast.error('Failed to post');
    }
  };

  const handlePostComment = async (category) => {
    const content = newsInput[category]?.trim();
    if (!content) return;
    try {
      await api.post('/api/market/notes', { commodity: category, period: newsPeriod, content, tags: [] });
      setNewsInput(prev => ({ ...prev, [category]: '' }));
      fetchMarketNews();
    } catch (err) {
      toast.error('Failed to post comment');
    }
  };

  const handleDeleteComment = async (noteId) => {
    try {
      await api.delete(`/api/market/notes/${noteId}`);
      toast.success('Comment deleted');
      fetchMarketNews();
    } catch (err) {
      toast.error('Failed to delete comment');
    }
  };

  const handleEditComment = async (noteId) => {
    if (!editContent.trim()) return;
    try {
      await api.put(`/api/market/notes/${noteId}`, { content: editContent.trim(), commodity: '', period: '', tags: [] });
      toast.success('Comment updated');
      setEditingNote(null);
      setEditContent('');
      fetchMarketNews();
    } catch (err) {
      toast.error('Failed to update comment');
    }
  };

  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  const getWeekdays = (year, month) => {
    const days = [];
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const dow = date.getDay();
      if (dow >= 1 && dow <= 5) {
        days.push({
          label: `${String(d).padStart(2,'0')} ${months[month]} ${year}`,
          key: `${String(d).padStart(2,'0')}_${months[month]}_${year}`
        });
      }
    }
    return days;
  };

  const years = [currentYear];
  archiveYears.forEach(y => { if (!years.includes(Number(y))) years.push(Number(y)); });
  years.sort((a, b) => b - a);

  return (
    <div className="space-y-4 mt-4">
      <div className="text-center mb-4">
        <h2 className="text-lg font-semibold text-green-700 dark:text-green-400" data-testid="indications-title">Indications - Market Commentary</h2>
      </div>

      {/* Period Navigation - Drill Down */}
      <div className="space-y-3 mb-4">
        <div className="flex items-center justify-center gap-1 text-sm text-muted-foreground">
          <button className="hover:text-foreground font-medium" onClick={() => setNewsNavLevel('year')} data-testid="nav-years">Years</button>
          {(newsNavLevel === 'month' || newsNavLevel === 'day') && (
            <>
              <span>/</span>
              <button className="hover:text-foreground font-medium" onClick={() => setNewsNavLevel('month')} data-testid="nav-year-selected">
                {newsSelectedYear}
              </button>
            </>
          )}
          {newsNavLevel === 'day' && (
            <>
              <span>/</span>
              <span className="font-medium text-foreground" data-testid="nav-month-selected">{months[newsSelectedMonth]} {newsSelectedYear}</span>
            </>
          )}
        </div>

        {newsNavLevel === 'year' && (
          <div className="flex items-center justify-center gap-2 flex-wrap" data-testid="nav-year-list">
            {years.map(y => (
              <Button key={y} size="sm" variant="outline" onClick={() => {
                setNewsSelectedYear(y);
                setNewsNavLevel('month');
              }}>
                {y}
              </Button>
            ))}
          </div>
        )}

        {newsNavLevel === 'month' && (
          <div className="flex items-center justify-center gap-2 flex-wrap" data-testid="nav-month-list">
            {months.map((m, idx) => {
              if (newsSelectedYear === currentYear && idx > currentMonth) return null;
              return (
                <Button key={m} size="sm"
                  variant={newsPeriod === 'monthly' && newsSelectedMonth === idx && newsSelectedYear === currentYear ? 'default' : 'outline'}
                  onClick={() => {
                    setNewsSelectedMonth(idx);
                    setNewsNavLevel('day');
                  }}
                >
                  {m} {newsSelectedYear}
                </Button>
              );
            })}
          </div>
        )}

        {newsNavLevel === 'day' && (
          <div className="flex items-center justify-center gap-1.5 flex-wrap" data-testid="nav-day-list">
            {getWeekdays(newsSelectedYear, newsSelectedMonth).map(day => {
              const dayNum = parseInt(day.label.split(' ')[0]);
              if (newsSelectedYear === currentYear && newsSelectedMonth === currentMonth && dayNum > now.getDate()) return null;
              const isActive = newsPeriod === day.key;
              return (
                <Button key={day.key} size="sm"
                  variant={isActive ? 'default' : 'outline'}
                  className="text-xs px-2 py-1 h-7"
                  onClick={() => setNewsPeriod(day.key)}
                >
                  {day.label}
                </Button>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {['Wheat', 'Corn', 'Barley', 'Others'].map((category) => (
          <Card key={category} className="border" data-testid={`news-card-${category.toLowerCase()}`}>
            <div className="bg-muted px-4 py-2 border-b">
              <h3 className="font-bold text-base text-foreground">{category}</h3>
            </div>
            <CardContent className="p-3 space-y-3">
              <div className="space-y-0 max-h-64 overflow-y-auto">
                {(marketNews[category] || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-2">No comments yet</p>
                ) : (
                  (marketNews[category] || []).map((note) => (
                    <div key={note.id} className="py-1.5 border-b border-border group">
                      {editingNote === note.id ? (
                        <div className="flex items-center gap-1.5">
                          <Input value={editContent} onChange={(e) => setEditContent(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleEditComment(note.id); if (e.key === 'Escape') { setEditingNote(null); setEditContent(''); } }} className="text-sm h-7" autoFocus />
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0" onClick={() => handleEditComment(note.id)}><Check className="h-3.5 w-3.5 text-green-600" /></Button>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0" onClick={() => { setEditingNote(null); setEditContent(''); }}><X className="h-3.5 w-3.5 text-muted-foreground" /></Button>
                        </div>
                      ) : (
                        <>
                          <p className="text-sm">{note.content}</p>
                          <div className="flex items-center justify-between mt-0.5">
                            <span className="text-[11px] text-muted-foreground italic">
                              {note.createdByName || note.createdBy} &bull; {new Date(note.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Europe/Istanbul' })} - {new Date(note.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Istanbul' })} {new Date(note.createdAt).getHours() >= 12 ? 'PM' : 'AM'}
                            </span>
                            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button variant="ghost" size="sm" className="h-5 w-5 p-0 shrink-0" onClick={() => { setEditingNote(note.id); setEditContent(note.content); }}>
                                <Pencil className="h-3 w-3 text-blue-500" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-5 w-5 p-0 shrink-0" onClick={() => handleDeleteComment(note.id)}>
                                <Trash2 className="h-3 w-3 text-red-500" />
                              </Button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
              <div className="space-y-2">
                {!showForm[category] ? (
                  <div className="flex gap-2">
                    <Input
                      data-testid={`news-input-${category.toLowerCase()}`}
                      placeholder="Type your commentary..."
                      value={newsInput[category] || ''}
                      onChange={(e) => setNewsInput(prev => ({ ...prev, [category]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === 'Enter') handlePostComment(category); }}
                      className="text-sm"
                    />
                    <Button size="sm" data-testid={`news-send-${category.toLowerCase()}`} onClick={() => handlePostComment(category)}>
                      <Send className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setShowForm(prev => ({ ...prev, [category]: true }))} title="Structured indication">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="border rounded-lg p-3 bg-muted/20 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground">New Indication</span>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setShowForm(prev => ({ ...prev, [category]: false }))}><X className="h-3.5 w-3.5" /></Button>
                    </div>
                    <div className="flex flex-wrap gap-2 items-end">
                      <Select value={indForm[category].side} onValueChange={(v) => setIndForm(prev => ({ ...prev, [category]: { ...prev[category], side: v } }))}>
                        <SelectTrigger className="h-8 text-xs w-[80px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Seller">Seller</SelectItem>
                          <SelectItem value="Buyer">Buyer</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={indForm[category].quantity} onValueChange={(v) => setIndForm(prev => ({ ...prev, [category]: { ...prev[category], quantity: v } }))}>
                        <SelectTrigger className="h-8 text-xs w-[70px]"><SelectValue placeholder="Qty" /></SelectTrigger>
                        <SelectContent>
                          {QUANTITIES.map(q => <SelectItem key={q} value={q}>{q}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Select value={indForm[category].origin} onValueChange={(v) => setIndForm(prev => ({ ...prev, [category]: { ...prev[category], origin: v } }))}>
                        <SelectTrigger className="h-8 text-xs w-[90px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ORIGINS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Select value={indForm[category].commodity} onValueChange={(v) => setIndForm(prev => ({ ...prev, [category]: { ...prev[category], commodity: v } }))}>
                        <SelectTrigger className="h-8 text-xs w-[155px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {COMMODITIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <div className="flex items-center gap-0">
                        <Select value={indForm[category].currency || 'USD'} onValueChange={(v) => setIndForm(prev => ({ ...prev, [category]: { ...prev[category], currency: v } }))}>
                          <SelectTrigger className="h-8 text-xs w-[52px] rounded-r-none border-r-0"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="USD">$</SelectItem>
                            <SelectItem value="EUR">€</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input placeholder="Price" value={indForm[category].price} onChange={(e) => setIndForm(prev => ({ ...prev, [category]: { ...prev[category], price: e.target.value } }))} className="h-8 text-xs w-[65px] rounded-l-none" />
                      </div>
                      <Select value={indForm[category].basePort} onValueChange={(v) => setIndForm(prev => ({ ...prev, [category]: { ...prev[category], basePort: v } }))}>
                        <SelectTrigger className="h-8 text-xs w-[140px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {BASE_PORTS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="h-8 text-xs px-2 min-w-[110px] justify-start">
                            <CalendarDays className="h-3 w-3 mr-1 shrink-0" />
                            {indForm[category].shipment || 'Shipment'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-3" align="start">
                          <div className="space-y-2">
                            <div className="text-xs font-medium text-muted-foreground">Shipment Period</div>
                            <div className="flex items-center gap-1.5">
                              <Select value={indForm[category]._fromDay || ''} onValueChange={(v) => setIndForm(prev => ({ ...prev, [category]: { ...prev[category], _fromDay: v } }))}>
                                <SelectTrigger className="h-7 w-[56px] text-xs"><SelectValue placeholder="Day" /></SelectTrigger>
                                <SelectContent>{FROM_DAYS.map(d => <SelectItem key={d} value={String(d)}>{d}</SelectItem>)}</SelectContent>
                              </Select>
                              <Select value={indForm[category]._fromMon || ''} onValueChange={(v) => setIndForm(prev => ({ ...prev, [category]: { ...prev[category], _fromMon: v } }))}>
                                <SelectTrigger className="h-7 w-[70px] text-xs"><SelectValue placeholder="Mon" /></SelectTrigger>
                                <SelectContent>{MONTHS3.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                              </Select>
                              <span className="text-xs font-medium">—</span>
                              <Select value={indForm[category]._toDay || ''} onValueChange={(v) => setIndForm(prev => ({ ...prev, [category]: { ...prev[category], _toDay: v } }))}>
                                <SelectTrigger className="h-7 w-[56px] text-xs"><SelectValue placeholder="Day" /></SelectTrigger>
                                <SelectContent>{TO_DAYS.map(d => <SelectItem key={d} value={String(d)}>{d}</SelectItem>)}</SelectContent>
                              </Select>
                              <Select value={indForm[category]._toMon || ''} onValueChange={(v) => setIndForm(prev => ({ ...prev, [category]: { ...prev[category], _toMon: v } }))}>
                                <SelectTrigger className="h-7 w-[70px] text-xs"><SelectValue placeholder="Mon" /></SelectTrigger>
                                <SelectContent>{MONTHS3.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                              </Select>
                            </div>
                            <Button size="sm" className="h-6 text-xs w-full" onClick={() => {
                              const f = indForm[category];
                              if (f._fromDay && f._fromMon && f._toDay && f._toMon) {
                                setIndForm(prev => ({ ...prev, [category]: { ...prev[category], shipment: `${f._fromDay} ${f._fromMon}-${f._toDay} ${f._toMon}` } }));
                              } else if (f._fromDay && f._fromMon) {
                                setIndForm(prev => ({ ...prev, [category]: { ...prev[category], shipment: `${f._fromDay} ${f._fromMon}` } }));
                              }
                            }}>Apply</Button>
                          </div>
                        </PopoverContent>
                      </Popover>
                      <Button size="sm" onClick={() => handlePostIndication(category)} className="h-8"><Send className="h-3.5 w-3.5 mr-1" />Post</Button>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{buildIndicationText(indForm[category])}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
