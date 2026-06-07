import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Plus, Search, Mail, Phone, Pencil, Trash2, Loader2, Eye, Building2, User, MessageCircle, Globe, UserPlus, Briefcase, X, FileText, Send } from 'lucide-react';
import { normalizeTR } from '../lib/utils-tr';
import { toast } from 'sonner';
import { Separator } from '../components/ui/separator';

const TYPE_CONFIG = {
  seller: { label: 'Seller', color: 'bg-blue-100 text-blue-800', kind: 'trading' },
  buyer: { label: 'Buyer', color: 'bg-green-100 text-green-800', kind: 'trading' },
  'co-broker': { label: 'Co-Broker', color: 'bg-amber-100 text-amber-800', kind: 'trading' },
  shipping_agent: { label: 'Shipping Agent', color: 'bg-cyan-100 text-cyan-800', kind: 'service' },
  surveyor: { label: 'Surveyor', color: 'bg-teal-100 text-teal-800', kind: 'service' },
  customs: { label: 'Customs', color: 'bg-indigo-100 text-indigo-800', kind: 'service' },
  logistics: { label: 'Logistics', color: 'bg-sky-100 text-sky-800', kind: 'service' },
  bank: { label: 'Bank', color: 'bg-emerald-100 text-emerald-800', kind: 'service' },
  lawyer: { label: 'Lawyer', color: 'bg-rose-100 text-rose-800', kind: 'service' },
  inspection: { label: 'Inspection', color: 'bg-fuchsia-100 text-fuchsia-800', kind: 'service' },
  insurance: { label: 'Insurance', color: 'bg-orange-100 text-orange-800', kind: 'service' },
  association: { label: 'Association', color: 'bg-stone-100 text-stone-800', kind: 'service' },
  other: { label: 'Other', color: 'bg-gray-100 text-gray-800', kind: 'network' },
};

const KIND_OPTIONS = [
  { value: 'trading', label: 'Trading' },
  { value: 'service', label: 'Service' },
  { value: 'network', label: 'My Network' },
];

const emptyContact = { name: '', email: '', phone: '' };

const emptyForm = {
  companyName: '', companyCode: '', contactPerson: '', address: '', city: '', country: '',
  email: '', phone: '', whatsapp: '', type: [], kind: 'trading', origins: '', notes: '',
  taxIdNo: '', taxOffice: '',
  website: '', companyDomain: '', linkedinUrl: '', industry: '', description: '',
  hubspotId: '', lifecycleStage: '',
  notesTimeline: [],
  tradeContacts: [], executionContacts: [],
};

function ContactRow({ contact, onChange, onRemove }) {
  return (
    <div className="flex items-start gap-2 p-2 rounded-md border bg-muted/30" data-testid="contact-row">
      <div className="grid grid-cols-3 gap-2 flex-1 min-w-0">
        <Input placeholder="Name" value={contact.name} onChange={(e) => onChange({ ...contact, name: e.target.value })} className="h-8 text-sm" data-testid="contact-name" />
        <Input placeholder="Email" value={contact.email} onChange={(e) => onChange({ ...contact, email: e.target.value })} className="h-8 text-sm" data-testid="contact-email" />
        <Input placeholder="Phone" value={contact.phone} onChange={(e) => onChange({ ...contact, phone: e.target.value })} className="h-8 text-sm" data-testid="contact-phone" />
      </div>
      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-destructive hover:text-destructive" onClick={onRemove} data-testid="contact-remove"><X className="h-3.5 w-3.5" /></Button>
    </div>
  );
}

function ContactSection({ title, icon: Icon, contacts, onChange, testIdPrefix }) {
  const addContact = () => onChange([...contacts, { ...emptyContact }]);
  const updateContact = (idx, updated) => {
    const next = [...contacts];
    next[idx] = updated;
    onChange(next);
  };
  const removeContact = (idx) => onChange(contacts.filter((_, i) => i !== idx));

  return (
    <div className="col-span-2 space-y-2" data-testid={`${testIdPrefix}-section`}>
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-1.5"><Icon className="h-3.5 w-3.5" />{title}</Label>
        <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={addContact} data-testid={`${testIdPrefix}-add-btn`}>
          <UserPlus className="h-3 w-3 mr-1" />Add
        </Button>
      </div>
      {contacts.length === 0 ? (
        <div className="text-xs text-muted-foreground italic py-1">No contacts added yet</div>
      ) : (
        <div className="space-y-2">
          {contacts.length > 0 && (
            <div className="grid grid-cols-[1fr_1fr_1fr_32px] gap-2 px-2 text-[11px] text-muted-foreground font-medium">
              <span>Name</span><span>Email</span><span>Phone</span><span />
            </div>
          )}
          {contacts.map((c, i) => (
            <ContactRow key={i} contact={c} onChange={(u) => updateContact(i, u)} onRemove={() => removeContact(i)} />
          ))}
        </div>
      )}
    </div>
  );
}

function ContactDisplay({ title, icon: Icon, contacts }) {
  if (!contacts || contacts.length === 0) return null;
  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium"><Icon className="h-4 w-4 text-primary" />{title} ({contacts.length})</div>
      <div className="space-y-2">
        {contacts.map((c, i) => (
          <div key={i} className="ml-1 text-sm border-l-2 border-primary/20 pl-3 py-1">
            <div className="font-medium">{c.name || 'Unnamed'}</div>
            <div className="text-muted-foreground space-y-0.5">
              {c.email && <div className="flex items-center gap-1.5"><Mail className="h-3 w-3" />{c.email}</div>}
              {c.phone && <div className="flex items-center gap-1.5"><Phone className="h-3 w-3" />{c.phone}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PartnersPage({ filterType }) {
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState(filterType || 'all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPartner, setEditingPartner] = useState(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [detailPartner, setDetailPartner] = useState(null);
  const [newNote, setNewNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const fetchPartners = useCallback(async () => {
    try {
      const res = await api.get('/api/partners');
      setPartners(res.data);
      return res.data;
    } catch (err) { toast.error('Failed to load partners'); return []; }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchPartners().then(data => {
      const detailId = searchParams.get('detail');
      if (detailId && data.length) {
        const p = data.find(x => x.id === detailId);
        if (p) { setDetailPartner(p); setSearchParams({}, { replace: true }); }
      }
    });
  }, [fetchPartners, searchParams, setSearchParams]);
  useEffect(() => { if (filterType) setTab(filterType); }, [filterType]);

  const filtered = useMemo(() => {
    let list = partners;
    if (tab === 'service' || tab === 'network' || tab === 'trading') {
      list = list.filter(p => (p.kind || 'trading') === tab);
    } else if (tab !== 'all') {
      list = list.filter(p => {
        const types = Array.isArray(p.type) ? p.type : [p.type];
        return types.includes(tab);
      });
    }
    if (search) {
      const q = normalizeTR(search);
      list = list.filter(p => normalizeTR(p.companyName).includes(q) || normalizeTR(p.contactPerson).includes(q) || normalizeTR(p.email).includes(q) || normalizeTR(p.companyCode).includes(q));
    }
    return list;
  }, [partners, tab, search]);

  const counts = useMemo(() => {
    const byKind = (k) => partners.filter(p => (p.kind || 'trading') === k).length;
    const byType = (t) => partners.filter(p => { const ts = Array.isArray(p.type) ? p.type : [p.type]; return ts.includes(t); }).length;
    return {
      all: partners.length,
      seller: byType('seller'),
      buyer: byType('buyer'),
      'co-broker': byType('co-broker'),
      service: byKind('service'),
      network: byKind('network'),
    };
  }, [partners]);

  const openCreate = () => {
    setEditingPartner(null);
    setForm({ ...emptyForm, type: filterType ? [filterType] : [] });
    setDialogOpen(true);
  };

  const openEdit = (p) => {
    setEditingPartner(p);
    setForm({
      companyName: p.companyName || '', companyCode: p.companyCode || '',
      contactPerson: p.contactPerson || '', address: p.address || '',
      city: p.city || '', country: p.country || '',
      email: p.email || '', phone: p.phone || '', whatsapp: p.whatsapp || '',
      type: Array.isArray(p.type) ? p.type : (p.type ? [p.type] : ['buyer']),
      kind: p.kind || 'trading',
      origins: (p.origins || []).join(', '),
      notes: p.notes || '', taxIdNo: p.taxIdNo || '', taxOffice: p.taxOffice || '',
      website: p.website || '', companyDomain: p.companyDomain || '',
      linkedinUrl: p.linkedinUrl || '', industry: p.industry || '',
      description: p.description || '', hubspotId: p.hubspotId || '',
      lifecycleStage: p.lifecycleStage || '',
      notesTimeline: p.notesTimeline || [],
      tradeContacts: (p.tradeContacts || []).map(c => ({ name: c.name || '', email: c.email || '', phone: c.phone || '' })),
      executionContacts: (p.executionContacts || []).map(c => ({ name: c.name || '', email: c.email || '', phone: c.phone || '' })),
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.companyName.trim()) { toast.error('Company name is required'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        origins: form.origins ? form.origins.split(',').map(o => o.trim()).filter(Boolean) : [],
        tradeContacts: form.tradeContacts.filter(c => c.name || c.email || c.phone),
        executionContacts: form.executionContacts.filter(c => c.name || c.email || c.phone),
      };
      if (editingPartner) {
        await api.put(`/api/partners/${editingPartner.id}`, payload);
        toast.success('Counterparty updated');
      } else {
        await api.post('/api/partners', payload);
        toast.success('Counterparty created');
      }
      setDialogOpen(false); fetchPartners();
    } catch (err) { toast.error('Failed to save counterparty'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    try { await api.delete(`/api/partners/${id}`); toast.success('Deleted'); fetchPartners(); }
    catch (err) { toast.error('Failed to delete'); }
  };

  const handleAddNote = async () => {
    const text = newNote.trim();
    if (!detailPartner || !text) return;
    setSavingNote(true);
    try {
      const res = await api.post(`/api/partners/${detailPartner.id}/notes`, { text });
      setDetailPartner(res.data);
      setPartners(prev => prev.map(p => (p.id === res.data.id ? res.data : p)));
      setNewNote('');
      toast.success('Note added');
    } catch (err) {
      toast.error('Failed to add note');
    } finally {
      setSavingNote(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div></div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4 mb-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search partners..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" data-testid="partners-search-input" />
            </div>
            {search && (
              <Button variant="ghost" size="sm" className="h-9 text-xs text-muted-foreground" onClick={() => setSearch('')}>
                <X className="h-3.5 w-3.5 mr-1" />Clear
              </Button>
            )}
            {!filterType && (
              <Tabs value={tab} onValueChange={setTab}>
                <TabsList>
                  <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
                  <TabsTrigger value="seller">Sellers ({counts.seller})</TabsTrigger>
                  <TabsTrigger value="buyer">Buyers ({counts.buyer})</TabsTrigger>
                  <TabsTrigger value="co-broker">Co-Brokers ({counts['co-broker']})</TabsTrigger>
                  <TabsTrigger value="service">Services ({counts.service})</TabsTrigger>
                  <TabsTrigger value="network">My Network ({counts.network})</TabsTrigger>
                </TabsList>
              </Tabs>
            )}
            <div className="ml-auto">
              <Button onClick={openCreate} data-testid="partners-new-button"><Plus className="mr-2 h-4 w-4" />Add Counterparty</Button>
            </div>
          </div>

          {loading ? <div className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div> : (
            <div className="overflow-x-auto border rounded-lg [&_th]:border [&_th]:border-muted [&_td]:border [&_td]:border-muted">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="!text-center !font-bold !text-[#1A5276]">Company</TableHead>
                    <TableHead className="!text-center !font-bold !text-[#1A5276]">Company Code</TableHead>
                    <TableHead className="!text-center !font-bold !text-[#1A5276]">Company Type</TableHead>
                    <TableHead className="!text-center !font-bold !text-[#1A5276]">Address</TableHead>
                    <TableHead className="!text-center !font-bold !text-[#1A5276]">Tax ID No</TableHead>
                    <TableHead className="!text-center !font-bold !text-[#1A5276] whitespace-nowrap">Tax Office</TableHead>
                    <TableHead className="!text-center !font-bold !text-[#1A5276] w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No partners found</TableCell></TableRow>
                  ) : filtered.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="!text-center">
                        <button
                          className="font-medium text-primary hover:underline hover:text-primary/80 cursor-pointer bg-transparent border-none p-0"
                          onClick={() => setDetailPartner(p)}
                        >
                          {p.companyName}
                        </button>
                      </TableCell>
                      <TableCell className="text-sm !text-center">{p.companyCode || '-'}</TableCell>
                      <TableCell className="!text-center"><div className="flex flex-wrap gap-1 justify-center">{(Array.isArray(p.type) ? p.type : [p.type]).map((t, i) => <Badge key={i} className={TYPE_CONFIG[t]?.color || 'bg-muted'}>{TYPE_CONFIG[t]?.label || t}</Badge>)}</div></TableCell>
                      <TableCell className="text-sm !text-center"><div>{p.address || '-'}</div>{(p.city || p.country) && <div className="text-muted-foreground">{[p.city, p.country].filter(Boolean).join(', ')}</div>}</TableCell>
                      <TableCell className="text-sm !text-center">{p.taxIdNo || '-'}</TableCell>
                      <TableCell className="text-sm !text-center">{p.taxOffice || '-'}</TableCell>
                      <TableCell className="!text-center">
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDetailPartner(p)} data-testid={`partner-view-${p.id}`}><Eye className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(p.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col">
          <DialogHeader><DialogTitle className="text-center">{editingPartner ? 'Edit Counterparty' : 'Add New Counterparty'}</DialogTitle><DialogDescription className="text-center">Fill in the details below.</DialogDescription></DialogHeader>
          <div className="overflow-y-auto flex-1 pr-2" style={{ maxHeight: 'calc(90vh - 140px)' }}>
            <div className="grid grid-cols-2 gap-4 py-4">
              <div className="col-span-2 space-y-2"><Label>Company Name *</Label><Input value={form.companyName} onChange={(e) => setForm({...form, companyName: e.target.value})} data-testid="partner-form-name" /></div>
              <div className="space-y-2"><Label>Company Code</Label><Input value={form.companyCode} onChange={(e) => setForm({...form, companyCode: e.target.value})} placeholder="e.g. BA" /></div>
              <div className="space-y-2">
                <Label>Kind</Label>
                <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v, type: [] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {KIND_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Type</Label>
                <div className="flex flex-wrap gap-3 pt-1" data-testid="partner-form-type">
                  {Object.entries(TYPE_CONFIG).filter(([, cfg]) => cfg.kind === (form.kind || 'trading')).map(([key, cfg]) => {
                    const types = Array.isArray(form.type) ? form.type : [form.type];
                    const checked = types.includes(key);
                    return (
                      <label key={key} className="flex items-center gap-1.5 cursor-pointer text-sm">
                        <input type="checkbox" checked={checked} onChange={() => {
                          const cur = Array.isArray(form.type) ? [...form.type] : [form.type];
                          if (checked) {
                            const next = cur.filter(t => t !== key);
                            setForm({...form, type: next});
                          } else {
                            setForm({...form, type: [...cur, key]});
                          }
                        }} className="rounded border-input" />
                        <Badge className={cfg.color}>{cfg.label}</Badge>
                      </label>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-2"><Label>Industry</Label><Input value={form.industry} onChange={(e) => setForm({...form, industry: e.target.value})} placeholder="e.g. Food Production" /></div>
              <div className="space-y-2"><Label>Website</Label><Input value={form.website} onChange={(e) => setForm({...form, website: e.target.value})} placeholder="https://example.com" /></div>
              <div className="space-y-2"><Label>Company Domain</Label><Input value={form.companyDomain} onChange={(e) => setForm({...form, companyDomain: e.target.value})} placeholder="example.com" /></div>
              <div className="space-y-2"><Label>LinkedIn</Label><Input value={form.linkedinUrl} onChange={(e) => setForm({...form, linkedinUrl: e.target.value})} placeholder="https://linkedin.com/company/..." /></div>
              <div className="col-span-2 space-y-2"><Label>Description</Label><Input value={form.description} onChange={(e) => setForm({...form, description: e.target.value})} /></div>
              <div className="col-span-2 space-y-2"><Label>Address</Label><Input value={form.address} onChange={(e) => setForm({...form, address: e.target.value})} /></div>
              <div className="space-y-2"><Label>City</Label><Input value={form.city} onChange={(e) => setForm({...form, city: e.target.value})} /></div>
              <div className="space-y-2"><Label>Country</Label><Input value={form.country} onChange={(e) => setForm({...form, country: e.target.value})} /></div>
              <div className="space-y-2"><Label>Tax ID No</Label><Input value={form.taxIdNo} onChange={(e) => setForm({...form, taxIdNo: e.target.value})} /></div>
              <div className="space-y-2"><Label>Tax Office</Label><Input value={form.taxOffice} onChange={(e) => setForm({...form, taxOffice: e.target.value})} /></div>

              <div className="col-span-2"><Separator className="my-1" /></div>

              <ContactSection
                title="Trade Contacts"
                icon={Briefcase}
                contacts={form.tradeContacts}
                onChange={(tc) => setForm({ ...form, tradeContacts: tc })}
                testIdPrefix="trade-contacts"
              />

              <div className="col-span-2"><Separator className="my-1" /></div>

              <ContactSection
                title="Execution Contacts"
                icon={User}
                contacts={form.executionContacts}
                onChange={(ec) => setForm({ ...form, executionContacts: ec })}
                testIdPrefix="execution-contacts"
              />
            </div>
          </div>
          <DialogFooter className="pt-4 border-t">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} data-testid="partner-form-save">{saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}{editingPartner ? 'Update' : 'Add Counterparty'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Business Card / Detail Dialog */}
      <Dialog open={!!detailPartner} onOpenChange={(open) => { if (!open) { setDetailPartner(null); setNewNote(''); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto flex flex-col">
          {detailPartner && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-lg">
                    {detailPartner.companyName?.charAt(0)}
                  </div>
                  <div>
                    <DialogTitle className="text-lg">{detailPartner.companyName}</DialogTitle>
                    <DialogDescription className="flex items-center gap-2">
                      {detailPartner.companyCode && <Badge variant="outline" className="text-xs">{detailPartner.companyCode}</Badge>}
                      {(Array.isArray(detailPartner.type) ? detailPartner.type : [detailPartner.type]).map((t, i) => <Badge key={i} className={TYPE_CONFIG[t]?.color || 'bg-muted'}>{TYPE_CONFIG[t]?.label || t}</Badge>)}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="overflow-y-auto flex-1 pr-2" style={{ maxHeight: 'calc(85vh - 120px)' }}>
                <div className="space-y-4 py-2">
                  {/* Main Contact */}
                  {detailPartner.contactPerson && (
                    <div className="rounded-lg border p-3 space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium"><User className="h-4 w-4 text-primary" />Primary Contact</div>
                      <div className="text-sm font-semibold">{detailPartner.contactPerson}</div>
                      <div className="grid grid-cols-1 gap-1 text-sm text-muted-foreground">
                        {detailPartner.email && <a href={`mailto:${detailPartner.email}`} className="flex items-center gap-2 hover:text-primary"><Mail className="h-3.5 w-3.5" />{detailPartner.email}</a>}
                        {detailPartner.phone && <span className="flex items-center gap-2"><Phone className="h-3.5 w-3.5" />{detailPartner.phone}</span>}
                        {detailPartner.whatsapp && <span className="flex items-center gap-2"><MessageCircle className="h-3.5 w-3.5" />{detailPartner.whatsapp}</span>}
                      </div>
                    </div>
                  )}

                  {/* Trade Contacts */}
                  <ContactDisplay title="Trade Contacts" icon={Briefcase} contacts={detailPartner.tradeContacts} />

                  {/* Execution Contacts */}
                  <ContactDisplay title="Execution Contacts" icon={User} contacts={detailPartner.executionContacts} />

                  {/* Location */}
                  {(detailPartner.address || detailPartner.city || detailPartner.country) && (
                    <div className="rounded-lg border p-3 space-y-1">
                      <div className="flex items-center gap-2 text-sm font-medium"><Building2 className="h-4 w-4 text-primary" />Address</div>
                      <div className="text-sm text-muted-foreground">
                        {detailPartner.address && <div>{detailPartner.address}</div>}
                        <div>{[detailPartner.city, detailPartner.country].filter(Boolean).join(', ')}</div>
                      </div>
                    </div>
                  )}

                  {/* Tax Info */}
                  {(detailPartner.taxIdNo || detailPartner.taxOffice) && (
                    <div className="rounded-lg border p-3 space-y-1">
                      <div className="flex items-center gap-2 text-sm font-medium"><FileText className="h-4 w-4 text-primary" />Tax Information</div>
                      <div className="text-sm text-muted-foreground">
                        {detailPartner.taxIdNo && <div>Tax ID No: {detailPartner.taxIdNo}</div>}
                        {detailPartner.taxOffice && <div>Tax Office: {detailPartner.taxOffice}</div>}
                      </div>
                    </div>
                  )}

                  {/* Origins */}
                  {detailPartner.origins && detailPartner.origins.length > 0 && (
                    <div className="rounded-lg border p-3 space-y-1">
                      <div className="flex items-center gap-2 text-sm font-medium"><Globe className="h-4 w-4 text-primary" />Origins</div>
                      <div className="flex flex-wrap gap-1">{detailPartner.origins.map((o, i) => <Badge key={i} variant="outline">{o}</Badge>)}</div>
                    </div>
                  )}

                  {/* Departments */}
                  {detailPartner.departments && detailPartner.departments.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-sm font-medium">Departments</div>
                      {detailPartner.departments.map((dept, di) => (
                        <div key={di} className="rounded-lg border p-3 space-y-2">
                          <div className="text-sm font-semibold">{dept.name}</div>
                          {dept.contacts && dept.contacts.map((c, ci) => (
                            <div key={ci} className="ml-2 text-sm border-l-2 border-primary/20 pl-3 py-1">
                              <div className="font-medium">{c.name} {c.role && <Badge variant="outline" className="text-[10px] ml-1">{c.role}</Badge>}</div>
                              <div className="text-muted-foreground space-y-0.5">
                                {c.email && <div className="flex items-center gap-1.5"><Mail className="h-3 w-3" />{c.email}</div>}
                                {c.phone && <div className="flex items-center gap-1.5"><Phone className="h-3 w-3" />{c.phone}</div>}
                              </div>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Notes */}
                  {detailPartner.notes && (
                    <div className="rounded-lg border p-3 space-y-1">
                      <div className="text-sm font-medium">Notes</div>
                      <div className="text-sm text-muted-foreground whitespace-pre-wrap">{detailPartner.notes}</div>
                    </div>
                  )}

                  {/* Manual note entry */}
                  <div className="rounded-lg border p-3 space-y-2">
                    <div className="text-sm font-medium">Add Note</div>
                    <Textarea
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      rows={3}
                      placeholder="Add a call note, meeting update, or follow-up..."
                      data-testid="partner-add-note-textarea"
                    />
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        onClick={handleAddNote}
                        disabled={savingNote || !newNote.trim()}
                        data-testid="partner-add-note-button"
                      >
                        {savingNote ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                        Add Note
                      </Button>
                    </div>
                  </div>

                  {/* Notes Timeline (HubSpot-imported activities) */}
                  {Array.isArray(detailPartner.notesTimeline) && detailPartner.notesTimeline.length > 0 && (
                    <div className="rounded-lg border p-3 space-y-2">
                      <div className="text-sm font-medium">Activity Timeline ({detailPartner.notesTimeline.length})</div>
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        {detailPartner.notesTimeline.slice().sort((a, b) => (b.ts || '').localeCompare(a.ts || '')).map((entry, i) => (
                          <div key={i} className="border-l-2 border-primary/30 pl-3 py-1">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Badge variant="outline" className="text-[10px] capitalize">{entry.source || 'note'}</Badge>
                              {entry.ts && <span>{new Date(entry.ts).toLocaleString()}</span>}
                              {entry.author && <span>· {entry.author}</span>}
                            </div>
                            {entry.text && <div className="text-sm text-foreground mt-1 whitespace-pre-wrap">{entry.text}</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* CRM metadata */}
                  {(detailPartner.website || detailPartner.linkedinUrl || detailPartner.industry || detailPartner.lifecycleStage) && (
                    <div className="rounded-lg border p-3 space-y-1">
                      <div className="text-sm font-medium">CRM</div>
                      <div className="text-sm text-muted-foreground space-y-0.5">
                        {detailPartner.industry && <div>Industry: {detailPartner.industry}</div>}
                        {detailPartner.lifecycleStage && <div>Lifecycle: {detailPartner.lifecycleStage}</div>}
                        {detailPartner.website && <div><a href={detailPartner.website} target="_blank" rel="noreferrer" className="text-primary hover:underline">{detailPartner.website}</a></div>}
                        {detailPartner.linkedinUrl && <div><a href={detailPartner.linkedinUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">LinkedIn</a></div>}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
