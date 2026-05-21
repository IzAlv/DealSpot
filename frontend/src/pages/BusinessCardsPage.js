import { useState, useEffect, useRef, useMemo } from 'react';
import api from '../lib/api';
import { normalizeTR } from '../lib/utils-tr';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Search, Loader2, Trash2, Pencil, Camera, User, Building2, Mail, Phone, Globe, MapPin, Tag, StickyNote, X, Briefcase, ChevronDown, ChevronRight, MessageCircle } from 'lucide-react';

export default function BusinessCardsPage() {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [scanning, setScanning] = useState(false);
  const [rescanning, setRescanning] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ name: '', title: '', company: '', email: '', phone: '', mobile: '', website: '', address: '', city: '', country: '', keywords: '', notes: '' });
  const [detailCard, setDetailCard] = useState(null);
  const [collapsedCountries, setCollapsedCountries] = useState({});
  const fileRef = useRef();

  const fetchCards = async () => {
    try { const res = await api.get('/api/business-cards'); setCards(res.data); }
    catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => { fetchCards(); }, []);

  const filtered = useMemo(() => {
    const q = normalizeTR(search);
    if (!q) return cards;
    return cards.filter(c =>
      normalizeTR(c.name).includes(q) || normalizeTR(c.company).includes(q) ||
      normalizeTR(c.email).includes(q) || (c.keywords||[]).some(k => normalizeTR(k).includes(q)) ||
      normalizeTR(c.country).includes(q) || normalizeTR(c.city).includes(q) ||
      normalizeTR(c.title).includes(q) || normalizeTR(c.mobile).includes(q) ||
      normalizeTR(c.website).includes(q) || normalizeTR(c.notes).includes(q)
    );
  }, [cards, search]);

  // Group by country
  const groupedByCountry = useMemo(() => {
    const groups = {};
    filtered.forEach(card => {
      const country = card.country?.trim() || 'Unknown';
      if (!groups[country]) groups[country] = [];
      groups[country].push(card);
    });
    // Sort countries alphabetically, "Unknown" last
    const sorted = Object.entries(groups).sort(([a], [b]) => {
      if (a === 'Unknown') return 1;
      if (b === 'Unknown') return -1;
      return a.localeCompare(b);
    });
    return sorted;
  }, [filtered]);

  const handleScan = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setScanning(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', '');
      formData.append('keywords', '');
      formData.append('notes', '');
      const res = await api.post('/api/business-cards', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setCards(prev => [res.data, ...prev]);
      toast.success('Business card scanned & saved!');
      setDetailCard(res.data);
    } catch (err) {
      toast.error('Failed to scan card');
    } finally { setScanning(false); e.target.value = ''; }
  };

  const openAdd = () => {
    setEditId(null);
    setForm({ name: '', title: '', company: '', email: '', phone: '', mobile: '', website: '', address: '', city: '', country: '', keywords: '', notes: '' });
    setDialogOpen(true);
  };

  const openEdit = (card, e) => {
    if (e) e.stopPropagation();
    setEditId(card.id);
    setForm({
      name: card.name || '', title: card.title || '', company: card.company || '',
      email: card.email || '', phone: card.phone || '', mobile: card.mobile || '',
      website: card.website || '', address: card.address || '', city: card.city || '',
      country: card.country || '', keywords: (card.keywords || []).join(', '), notes: card.notes || ''
    });
    setDialogOpen(true);
  };

  const handleRescan = async () => {
    if (!editId) return;
    setRescanning(true);
    try {
      const res = await api.post(`/api/business-cards/${editId}/rescan`);
      const d = res.data;
      if (d.error) { toast.error(d.error); return; }
      setForm(prev => ({
        name: d.name || prev.name, title: d.title || prev.title, company: d.company || prev.company,
        email: d.email || prev.email, phone: d.phone || prev.phone, mobile: d.mobile || prev.mobile,
        website: d.website || prev.website, address: d.address || prev.address, city: d.city || prev.city,
        country: d.country || prev.country, keywords: prev.keywords, notes: prev.notes
      }));
      toast.success('Fields auto-filled from card image');
    } catch { toast.error('AI scan failed'); }
    finally { setRescanning(false); }
  };

  const handleSave = async () => {
    const payload = { ...form, keywords: form.keywords.split(',').map(k => k.trim()).filter(Boolean) };
    try {
      if (editId) {
        const res = await api.put(`/api/business-cards/${editId}`, payload);
        setCards(prev => prev.map(c => c.id === editId ? res.data : c));
        if (detailCard?.id === editId) setDetailCard(res.data);
        toast.success('Card updated');
      } else {
        const formData = new FormData();
        Object.entries(payload).forEach(([k, v]) => formData.append(k, Array.isArray(v) ? v.join(',') : v));
        const res = await api.post('/api/business-cards', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
        setCards(prev => [res.data, ...prev]);
        toast.success('Card added');
      }
      setDialogOpen(false);
    } catch (err) { toast.error('Failed to save'); }
  };

  const handleDelete = async (id, e) => {
    if (e) e.stopPropagation();
    try {
      await api.delete(`/api/business-cards/${id}`);
      setCards(prev => prev.filter(c => c.id !== id));
      if (detailCard?.id === id) setDetailCard(null);
      toast.success('Card deleted');
    } catch (err) { toast.error('Failed to delete'); }
  };

  const toggleCountry = (country) => {
    setCollapsedCountries(prev => ({ ...prev, [country]: !prev[country] }));
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4" data-testid="business-cards-page">
      {/* Search & Actions */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name, company, country, keywords..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 pr-8" data-testid="search-cards" />
          {search && <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" data-testid="clear-search"><X className="h-4 w-4" /></button>}
        </div>
        <span className="text-xs text-muted-foreground" data-testid="cards-count">{filtered.length} contact{filtered.length !== 1 ? 's' : ''} across {groupedByCountry.length} {groupedByCountry.length === 1 ? 'country' : 'countries'}</span>
        <div className="flex gap-2 ml-auto">
          <label
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors ${
              scanning
                ? 'bg-muted text-muted-foreground cursor-wait'
                : 'bg-[#1A5276] text-white hover:bg-[#143D5C]'
            }`}
            data-testid="scan-card-btn"
          >
            {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
            {scanning ? 'Scanning...' : 'Scan Card'}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleScan} disabled={scanning} />
          </label>
          <Button variant="outline" onClick={openAdd} data-testid="add-card-btn" className="gap-1.5">
            <Plus className="h-4 w-4" />Add Manual
          </Button>
        </div>
      </div>

      {/* No data */}
      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center" data-testid="no-cards-state">
          <Camera className="w-12 h-12 text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground font-medium">{cards.length === 0 ? 'No business cards yet' : 'No cards match your search'}</p>
          <p className="text-sm text-muted-foreground/70 mt-1">{cards.length === 0 ? 'Scan a card or add one manually to get started' : 'Try a different search term'}</p>
        </div>
      )}

      {/* Country Tables */}
      {groupedByCountry.map(([country, countryCards]) => {
        const isCollapsed = collapsedCountries[country];
        return (
          <div key={country} className="border border-border rounded-lg overflow-hidden bg-card" data-testid={`country-table-${country.toLowerCase().replace(/\s+/g, '-')}`}>
            {/* Country header */}
            <button
              onClick={() => toggleCountry(country)}
              className="w-full flex items-center justify-between px-4 py-2.5 bg-[#1A5276]/10 hover:bg-[#1A5276]/15 transition-colors text-left"
              data-testid={`country-header-${country.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <div className="flex items-center gap-2">
                {isCollapsed ? <ChevronRight className="w-4 h-4 text-[#1A5276]" /> : <ChevronDown className="w-4 h-4 text-[#1A5276]" />}
                <MapPin className="w-4 h-4 text-[#1A5276]" />
                <span className="font-semibold text-sm text-foreground">{country}</span>
              </div>
              <Badge variant="secondary" className="bg-[#1A5276]/10 text-[#1A5276] border-[#1A5276]/20 text-xs">
                {countryCards.length} contact{countryCards.length !== 1 ? 's' : ''}
              </Badge>
            </button>

            {/* Table */}
            {!isCollapsed && (
              <div className="overflow-x-auto [&_th]:border [&_th]:border-muted [&_td]:border [&_td]:border-muted">
                <table className="w-full text-sm" style={{ tableLayout: 'fixed' }} data-testid={`cards-table-${country.toLowerCase().replace(/\s+/g, '-')}`}>
                  <colgroup>
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '13%' }} />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '15%' }} />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '8%' }} />
                    <col style={{ width: '7%' }} />
                    <col style={{ width: '6%' }} />
                    <col style={{ width: '3%' }} />
                  </colgroup>
                  <thead>
                    <tr className="bg-muted/50 border-b border-t border-border">
                      <th className="text-center px-3 py-2 font-bold text-[#1A5276] whitespace-nowrap">Name</th>
                      <th className="text-center px-3 py-2 font-bold text-[#1A5276] whitespace-nowrap">Company</th>
                      <th className="text-center px-3 py-2 font-bold text-[#1A5276] whitespace-nowrap">Position</th>
                      <th className="text-center px-3 py-2 font-bold text-[#1A5276] whitespace-nowrap">Email</th>
                      <th className="text-center px-3 py-2 font-bold text-[#1A5276] whitespace-nowrap">WhatsApp</th>
                      <th className="text-center px-3 py-2 font-bold text-[#1A5276] whitespace-nowrap">Website</th>
                      <th className="text-center px-3 py-2 font-bold text-[#1A5276] whitespace-nowrap">City</th>
                      <th className="text-center px-3 py-2 font-bold text-[#1A5276] whitespace-nowrap">Country</th>
                      <th className="text-center px-3 py-2 font-bold text-[#1A5276] whitespace-nowrap">Keywords</th>
                      <th className="text-center px-3 py-2 font-medium text-muted-foreground whitespace-nowrap"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {countryCards.map((card, i) => (
                      <tr
                        key={card.id}
                        className={`border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer ${i % 2 === 1 ? 'bg-muted/10' : ''}`}
                        onClick={() => setDetailCard(card)}
                        data-testid={`card-row-${card.id}`}
                      >
                        <td className="px-3 py-2 font-medium text-foreground truncate text-center" title={card.name}>{card.name || '-'}</td>
                        <td className="px-3 py-2 text-muted-foreground truncate text-center" title={card.company}>{card.company || '-'}</td>
                        <td className="px-3 py-2 text-muted-foreground truncate text-center" title={card.title}>{card.title || '-'}</td>
                        <td className="px-3 py-2 truncate text-center">
                          {card.email ? (
                            <a href={`mailto:${card.email}`} className="text-blue-600 hover:underline text-xs" title={card.email} onClick={e => e.stopPropagation()}>{card.email}</a>
                          ) : '-'}
                        </td>
                        <td className="px-3 py-2 truncate text-center">
                          {card.mobile ? (
                            <a href={`https://wa.me/${card.mobile.replace(/[^0-9+]/g, '')}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-1 text-green-600 hover:underline text-xs" onClick={e => e.stopPropagation()}>
                              <MessageCircle className="w-3 h-3 flex-shrink-0" /><span className="truncate">{card.mobile}</span>
                            </a>
                          ) : '-'}
                        </td>
                        <td className="px-3 py-2 truncate text-center">
                          {card.website ? (
                            <a href={card.website?.startsWith('http') ? card.website : `https://${card.website}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs truncate block text-center" title={card.website} onClick={e => e.stopPropagation()}>{card.website}</a>
                          ) : '-'}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground truncate text-center" title={card.city}>{card.city || '-'}</td>
                        <td className="px-3 py-2 text-muted-foreground truncate text-center" title={card.country}>{card.country || '-'}</td>
                        <td className="px-3 py-2 text-center">
                          {card.keywords?.length > 0 ? (
                            <div className="flex flex-wrap gap-1 justify-center">
                              {card.keywords.slice(0, 2).map((k, ki) => (
                                <Badge key={ki} variant="secondary" className="text-[10px] px-1.5 py-0 font-normal">{k}</Badge>
                              ))}
                              {card.keywords.length > 2 && <span className="text-[10px] text-muted-foreground">+{card.keywords.length - 2}</span>}
                            </div>
                          ) : '-'}
                        </td>
                        <td className="px-3 py-2 text-center" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-0.5">
                            <button className="p-1 rounded hover:bg-muted transition-colors" onClick={(e) => openEdit(card, e)} data-testid={`edit-btn-${card.id}`}>
                              <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                            </button>
                            <button className="p-1 rounded hover:bg-red-50 transition-colors" onClick={(e) => handleDelete(card.id, e)} data-testid={`delete-btn-${card.id}`}>
                              <Trash2 className="w-3.5 h-3.5 text-red-500" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}

      {/* Detail Dialog */}
      <Dialog open={!!detailCard} onOpenChange={(o) => !o && setDetailCard(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto" hideCloseButton>
          <DialogHeader>
            <DialogTitle className="text-lg">Contact Details</DialogTitle>
          </DialogHeader>
          {detailCard && (
            <div className="space-y-3">
              {detailCard.imageUrl && (
                <img src={`${process.env.REACT_APP_BACKEND_URL}${detailCard.imageUrl}`} alt="" className="w-full rounded-lg border object-contain max-h-64" />
              )}
              <div className="space-y-2.5">
                <DetailRow icon={User} label="Name" value={detailCard.name} />
                {detailCard.title && <DetailRow icon={Briefcase} label="Position" value={detailCard.title} />}
                <DetailRow icon={Building2} label="Company" value={detailCard.company} />
                <DetailRow icon={Mail} label="Email" value={detailCard.email} link={detailCard.email ? `mailto:${detailCard.email}` : null} />
                <DetailRow icon={Phone} label="Phone" value={detailCard.phone} />
                {detailCard.mobile && <DetailRow icon={MessageCircle} label="WhatsApp" value={detailCard.mobile} link={`https://wa.me/${detailCard.mobile.replace(/[^0-9+]/g, '')}`} isWhatsApp />}
                {detailCard.website && <DetailRow icon={Globe} label="Website" value={detailCard.website} link={detailCard.website?.startsWith('http') ? detailCard.website : `https://${detailCard.website}`} />}
                <DetailRow icon={MapPin} label="Address" value={[detailCard.address, detailCard.city, detailCard.country].filter(Boolean).join(', ')} />
              </div>
              {detailCard.keywords?.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1"><Tag className="h-3 w-3" />Keywords</p>
                  <div className="flex flex-wrap gap-1.5">{detailCard.keywords.map((k, i) => <Badge key={i} variant="secondary" className="text-xs bg-blue-50 text-blue-700">{k}</Badge>)}</div>
                </div>
              )}
              {detailCard.notes && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1"><StickyNote className="h-3 w-3" />Notes</p>
                  <p className="text-sm bg-muted/50 rounded-lg p-2.5 whitespace-pre-wrap">{detailCard.notes}</p>
                </div>
              )}
              {/* Action buttons at bottom right */}
              <div className="flex items-center justify-between pt-3 border-t">
                <Button variant="outline" size="sm" onClick={() => setDetailCard(null)} data-testid="close-detail-btn">Close</Button>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => openEdit(detailCard)} data-testid="edit-detail-btn">
                    <Pencil className="h-3.5 w-3.5" />Edit
                  </Button>
                  <Button variant="destructive" size="sm" className="gap-1.5" onClick={() => handleDelete(detailCard.id)} data-testid="delete-detail-btn">
                    <Trash2 className="h-3.5 w-3.5" />Delete
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>{editId ? 'Edit' : 'Add'} Business Card</DialogTitle>
              {editId && <Button variant="outline" size="sm" className="gap-1.5" onClick={handleRescan} disabled={rescanning} data-testid="rescan-btn">
                {rescanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                {rescanning ? 'Scanning...' : 'AI Scan'}
              </Button>}
            </div>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} /></div>
            <div className="space-y-1"><Label>Position</Label><Input value={form.title} onChange={(e) => setForm({...form, title: e.target.value})} placeholder="e.g. CEO, Manager" /></div>
            <div className="col-span-2 space-y-1"><Label>Company</Label><Input value={form.company} onChange={(e) => setForm({...form, company: e.target.value})} /></div>
            <div className="space-y-1"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({...form, email: e.target.value})} /></div>
            <div className="space-y-1"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({...form, phone: e.target.value})} /></div>
            <div className="space-y-1"><Label>WhatsApp</Label><Input value={form.mobile} onChange={(e) => setForm({...form, mobile: e.target.value})} placeholder="+90 530 000 0000" /></div>
            <div className="space-y-1"><Label>Website</Label><Input value={form.website} onChange={(e) => setForm({...form, website: e.target.value})} /></div>
            <div className="col-span-2 space-y-1"><Label>Address</Label><Input value={form.address} onChange={(e) => setForm({...form, address: e.target.value})} /></div>
            <div className="space-y-1"><Label>City</Label><Input value={form.city} onChange={(e) => setForm({...form, city: e.target.value})} /></div>
            <div className="space-y-1"><Label>Country</Label><Input value={form.country} onChange={(e) => setForm({...form, country: e.target.value})} /></div>
            <div className="col-span-2 space-y-1"><Label>Keywords</Label><Input value={form.keywords} onChange={(e) => setForm({...form, keywords: e.target.value})} placeholder="e.g. wheat, Istanbul conference, logistics" /></div>
            <div className="col-span-2 space-y-1"><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({...form, notes: e.target.value})} rows={3} placeholder="Meeting notes, follow-ups..." /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button><Button onClick={handleSave} data-testid="save-card-btn">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailRow({ icon: Icon, label, value, link, isWhatsApp }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2">
      <Icon className={`h-3.5 w-3.5 ${isWhatsApp ? 'text-green-600' : 'text-muted-foreground'} mt-0.5 flex-shrink-0`} />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        {link ? <a href={link} target="_blank" rel="noopener noreferrer" className={`text-sm ${isWhatsApp ? 'text-green-600' : 'text-primary'} hover:underline break-all`}>{value}</a> : <p className="text-sm break-all">{value}</p>}
      </div>
    </div>
  );
}
