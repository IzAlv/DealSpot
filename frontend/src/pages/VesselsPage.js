import { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Plus, Search, Pencil, Trash2, Loader2, Ship, Anchor, X, Upload, FileText, Eye } from 'lucide-react';
import { toast } from 'sonner';

export default function VesselsPage() {
  const [vessels, setVessels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingVessel, setEditingVessel] = useState(null);
  const [form, setForm] = useState({ name: '', imoNumber: '', flag: '', builtYear: new Date().getFullYear(), vesselType: 'Bulk Carrier' });
  const [saving, setSaving] = useState(false);
  const [certDialogOpen, setCertDialogOpen] = useState(false);
  const [certVessel, setCertVessel] = useState(null);
  const [certs, setCerts] = useState([]);
  const [certUploading, setCertUploading] = useState(false);

  const fetchVessels = useCallback(async () => {
    try { const res = await api.get('/api/vessels'); setVessels(res.data); } catch (err) { toast.error('Failed to load vessels'); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchVessels(); }, [fetchVessels]);

  const filtered = useMemo(() => {
    if (!search) return vessels;
    const q = search.toLowerCase();
    return vessels.filter(v => v.name?.toLowerCase().includes(q) || v.imoNumber?.includes(q) || v.flag?.toLowerCase().includes(q));
  }, [vessels, search]);

  const stats = useMemo(() => {
    const ages = vessels.filter(v => v.builtYear).map(v => new Date().getFullYear() - v.builtYear);
    return {
      total: vessels.length,
      avgAge: ages.length > 0 ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) : 0,
      flags: new Set(vessels.filter(v => v.flag).map(v => v.flag)).size,
    };
  }, [vessels]);

  const openCreate = () => { setEditingVessel(null); setForm({ name: '', imoNumber: '', flag: '', builtYear: new Date().getFullYear(), vesselType: 'Bulk Carrier' }); setDialogOpen(true); };
  const openEdit = (v) => { setEditingVessel(v); setForm({ name: v.name||'', imoNumber: v.imoNumber||'', flag: v.flag||'', builtYear: v.builtYear || new Date().getFullYear(), vesselType: v.vesselType||'Bulk Carrier' }); setDialogOpen(true); };

  const handleSave = async () => {
    if (!form.name || !form.imoNumber) { toast.error('Name and IMO are required'); return; }
    setSaving(true);
    try {
      const data = { ...form, builtYear: parseInt(form.builtYear) || null };
      if (editingVessel) { await api.put(`/api/vessels/${editingVessel.id}`, data); toast.success('Vessel updated'); }
      else { await api.post('/api/vessels', data); toast.success('Vessel created'); }
      setDialogOpen(false); fetchVessels();
    } catch (err) { toast.error('Failed to save'); } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    try { await api.delete(`/api/vessels/${id}`); toast.success('Deleted'); fetchVessels(); } catch (err) { toast.error('Failed to delete'); }
  };

  const openCerts = async (vessel) => {
    setCertVessel(vessel);
    setCertDialogOpen(true);
    try { const res = await api.get(`/api/vessels/${vessel.id}/certificates`); setCerts(res.data); }
    catch { setCerts([]); }
  };

  const handleCertUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !certVessel) return;
    setCertUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      await api.post(`/api/vessels/${certVessel.id}/certificates`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      const res = await api.get(`/api/vessels/${certVessel.id}/certificates`);
      setCerts(res.data);
      fetchVessels();
      toast.success('Certificate uploaded');
    } catch { toast.error('Upload failed'); }
    finally { setCertUploading(false); e.target.value = ''; }
  };

  const handleCertDownload = async (cert) => {
    try {
      const res = await api.get(`/api/vessels/${certVessel.id}/certificates/${cert.id}/download`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url; a.download = cert.fileName;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch { toast.error('Download failed'); }
  };

  const handleCertDelete = async (certId) => {
    try {
      await api.delete(`/api/vessels/${certVessel.id}/certificates/${certId}`);
      setCerts(prev => prev.filter(c => c.id !== certId));
      fetchVessels();
      toast.success('Certificate deleted');
    } catch { toast.error('Delete failed'); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div></div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10"><Ship className="h-5 w-5 text-primary" /></div><div><p className="text-2xl font-bold">{stats.total}</p><p className="text-xs text-muted-foreground">Total Vessels</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100"><Anchor className="h-5 w-5 text-amber-600" /></div><div><p className="text-2xl font-bold">{stats.avgAge} yrs</p><p className="text-xs text-muted-foreground">Average Age</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-100"><span className="text-green-600 text-lg">🏳️</span></div><div><p className="text-2xl font-bold">{stats.flags}</p><p className="text-xs text-muted-foreground">Unique Flags</p></div></div></CardContent></Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="relative flex-1 min-w-[200px] max-w-xs"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Search vessels..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" /></div>
            {search && <Button variant="ghost" size="sm" onClick={() => setSearch('')} className="text-destructive hover:text-destructive" data-testid="vessels-clear-filter"><X className="h-4 w-4 mr-1" />Clear</Button>}
            <div className="ml-auto"><Button onClick={openCreate} data-testid="vessels-new-button"><Plus className="mr-2 h-4 w-4" />Add Vessel</Button></div>
          </div>
          <div className="overflow-x-auto border rounded-lg">
            <Table>
              <TableHeader><TableRow className="bg-muted/50">
                <TableHead className="!text-center !font-bold !text-[#1A5276]">Vessel Name</TableHead><TableHead className="!text-center !font-bold !text-[#1A5276]">IMO Number</TableHead><TableHead className="!text-center !font-bold !text-[#1A5276]">Type</TableHead><TableHead className="!text-center !font-bold !text-[#1A5276]">Flag</TableHead><TableHead className="!text-center !font-bold !text-[#1A5276]">Built Year</TableHead><TableHead className="!text-center !font-bold !text-[#1A5276]">Vessel Age</TableHead><TableHead className="!text-center !font-bold !text-[#1A5276]">Vessel Certificates</TableHead><TableHead className="!text-center !font-bold !text-[#1A5276] w-[80px]">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filtered.length === 0 ? <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No vessels found</TableCell></TableRow> :
                filtered.map(v => (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium !text-center">{v.name}</TableCell>
                    <TableCell className="font-mono text-sm !text-center">{v.imoNumber || '-'}</TableCell>
                    <TableCell className="!text-center"><Badge variant="secondary">{v.vesselType || '-'}</Badge></TableCell>
                    <TableCell className="!text-center">{v.flag || '-'}</TableCell>
                    <TableCell className="!text-center">{v.builtYear || '-'}</TableCell>
                    <TableCell className="!text-center">{v.builtYear ? new Date().getFullYear() - v.builtYear : '-'}</TableCell>
                    <TableCell className="!text-center">
                      <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => openCerts(v)} data-testid={`certs-btn-${v.id}`}>
                        <FileText className="h-3.5 w-3.5" />
                        <Badge variant={v.certificates?.length ? "default" : "secondary"} className="text-[10px] px-1.5">{v.certificates?.length || 0}</Badge>
                      </Button>
                    </TableCell>
                    <TableCell className="!text-center"><div className="flex gap-1 justify-center"><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(v)}><Pencil className="h-3.5 w-3.5" /></Button><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(v.id)}><Trash2 className="h-3.5 w-3.5" /></Button></div></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent><DialogHeader><DialogTitle>{editingVessel ? 'Edit Vessel' : 'Add Vessel'}</DialogTitle><DialogDescription>Fill in the vessel details.</DialogDescription></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="col-span-2 space-y-2"><Label>Vessel Name *</Label><Input value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} /></div>
            <div className="space-y-2"><Label>IMO Number *</Label><Input value={form.imoNumber} onChange={(e) => setForm({...form, imoNumber: e.target.value})} /></div>
            <div className="space-y-2"><Label>Type</Label><Input value={form.vesselType} onChange={(e) => setForm({...form, vesselType: e.target.value})} /></div>
            <div className="space-y-2"><Label>Flag</Label><Input value={form.flag} onChange={(e) => setForm({...form, flag: e.target.value})} /></div>
            <div className="space-y-2"><Label>Built Year</Label><Input type="number" value={form.builtYear} onChange={(e) => setForm({...form, builtYear: e.target.value})} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button><Button onClick={handleSave} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}{editingVessel ? 'Update' : 'Add'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={certDialogOpen} onOpenChange={setCertDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Certificates — {certVessel?.name}</DialogTitle>
            <DialogDescription>Upload and manage vessel certificates.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {certs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No certificates uploaded yet</p>
            ) : certs.map(c => {
              const ext = (c.fileName || '').split('.').pop().toLowerCase();
              const isPdf = ext === 'pdf';
              const isImg = ['jpg','jpeg','png','webp'].includes(ext);
              return (
              <div key={c.id} className="flex items-center justify-between p-2.5 border rounded-lg">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm truncate">{c.fileName}</span>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button variant="ghost" size="sm" className="h-7 px-2 gap-1 text-xs font-medium" onClick={() => handleCertDownload(c)} data-testid={`cert-download-${c.id}`}>
                    {isPdf ? <span className="text-red-600 font-bold">PDF</span> : isImg ? <span className="text-blue-600 font-bold">IMG</span> : <span className="text-gray-600 font-bold">{ext.toUpperCase()}</span>}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleCertDelete(c.id)} data-testid={`cert-delete-${c.id}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
              );
            })}
          </div>
          <DialogFooter>
            <label className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium cursor-pointer transition-colors ${certUploading ? 'bg-muted text-muted-foreground' : 'bg-primary text-primary-foreground hover:bg-primary/90'}`}>
              {certUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {certUploading ? 'Uploading...' : 'Upload Certificate'}
              <input type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={handleCertUpload} className="hidden" disabled={certUploading} />
            </label>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
