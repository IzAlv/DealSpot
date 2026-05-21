import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Upload, FileText, Trash2, Eye, CheckCircle2, XCircle, AlertCircle, Loader2, GripVertical } from 'lucide-react';
import { toast } from 'sonner';

const DEFAULT_REQUIRED_DOCS = [
  'Signed Commercial Invoice',
  'Bill of Lading (Clean on Board, Freight Prepaid)',
  'Certificate of Origin',
  'Phytosanitary Certificate',
  'Non-Radiation Certificate (CS134 & CS137 < 370 Bq/Kg)',
  'Fumigation Certificate (if any)',
  'Quality Certificate (GAFTA Approved Surveyor)',
  'Weight Certificate (GAFTA Approved Surveyor)',
  'Holds Cleanliness Certificate (GAFTA Approved Surveyor)',
  'Holds Sealing Certificate (GAFTA Approved Surveyor)',
  'Insurance Certificate (GAFTA - 102% of value)',
  "Master's Receipt",
  'Non-Dioxin Analysis + GAFTA Non-Dioxin Certificate',
];

export default function DraftDocumentsTab({ trade, tradeId }) {
  const [draftDocs, setDraftDocs] = useState([]);
  const [diDocs, setDiDocs] = useState([]);
  const [uploading, setUploading] = useState(null);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dragItem, setDragItem] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);

  const fetchDrafts = useCallback(async () => {
    if (!tradeId) return;
    setLoading(true);
    try {
      const res = await api.get(`/api/trades/${tradeId}/draft-documents`);
      setDraftDocs(res.data);
    } catch { /* empty */ }
    finally { setLoading(false); }
  }, [tradeId]);

  const fetchDI = useCallback(async () => {
    if (!tradeId) return;
    try {
      const res = await api.get(`/api/doc-instructions/?tradeId=${tradeId}`);
      const dis = res.data;
      if (dis.length > 0 && dis[0].requiredDocuments?.length) {
        setDiDocs(dis[0].requiredDocuments.map(d => d.name));
      } else {
        setDiDocs(DEFAULT_REQUIRED_DOCS);
      }
    } catch {
      setDiDocs(DEFAULT_REQUIRED_DOCS);
    }
  }, [tradeId]);

  useEffect(() => { fetchDrafts(); fetchDI(); }, [fetchDrafts, fetchDI]);

  const requiredDocNames = diDocs.length > 0 ? diDocs : DEFAULT_REQUIRED_DOCS;

  // Single file upload for a specific doc
  const uploadDraft = async (docName, file) => {
    if (!file || !tradeId) return;
    setUploading(docName);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post(`/api/trades/${tradeId}/draft-documents?docName=${encodeURIComponent(docName)}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setDraftDocs(res.data);
      toast.success(`Draft uploaded: ${docName}`);
    } catch { toast.error('Failed to upload draft'); }
    finally { setUploading(null); }
  };

  // Bulk upload - files go to "Unassigned"
  const bulkUploadFiles = async (files) => {
    if (!files.length || !tradeId) return;
    setBulkUploading(true);
    for (const file of files) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        await api.post(`/api/trades/${tradeId}/draft-documents?docName=_unassigned`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      } catch { toast.error(`Failed to upload: ${file.name}`); }
    }
    await fetchDrafts();
    setBulkUploading(false);
    toast.success(`${files.length} file(s) uploaded — drag to assign`);
  };

  // Reassign a draft document to a new docName
  const reassignDraft = async (docIndex, newDocName) => {
    try {
      await api.put(`/api/trades/${tradeId}/draft-documents/${docIndex}/reassign`, { docName: newDocName });
      await fetchDrafts();
      toast.success('Document assigned');
    } catch { toast.error('Failed to reassign'); }
  };

  const deleteDraft = async (idx) => {
    try {
      const res = await api.delete(`/api/trades/${tradeId}/draft-documents/${idx}`);
      setDraftDocs(res.data);
      toast.success('Draft document removed');
    } catch { toast.error('Failed to delete'); }
  };

  const viewDraft = async (idx) => {
    try {
      const res = await api.get(`/api/trades/${tradeId}/draft-documents/${idx}/download`, { responseType: 'blob' });
      const contentType = res.headers['content-type'] || 'application/octet-stream';
      const blob = new Blob([res.data], { type: contentType });
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch { toast.error('Failed to open document'); }
  };

  // Build status map: docName -> uploaded draft(s)
  const draftMap = {};
  draftDocs.forEach((d, idx) => {
    const key = d.docName || '_unassigned';
    if (!draftMap[key]) draftMap[key] = [];
    draftMap[key].push({ ...d, index: idx });
  });

  const unassigned = draftMap['_unassigned'] || [];
  const uploadedCount = requiredDocNames.filter(name => draftMap[name]?.length > 0).length;
  const missingCount = requiredDocNames.length - uploadedCount;

  // Drag & Drop handlers
  const handleDragStart = (doc) => { setDragItem(doc); };
  const handleDragOver = (e, docName) => { e.preventDefault(); setDropTarget(docName); };
  const handleDragLeave = () => { setDropTarget(null); };
  const handleDrop = (e, docName) => {
    e.preventDefault();
    setDropTarget(null);
    if (dragItem && dragItem.docName !== docName) {
      reassignDraft(dragItem.index, docName);
    }
    setDragItem(null);
  };

  if (!tradeId) return null;

  return (
    <div className="space-y-4">
      {/* Bulk Upload Zone */}
      <Card>
        <CardContent className="pt-5 pb-4">
          <label className="flex items-center justify-center gap-2 p-4 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary hover:bg-muted/30 transition-colors" data-testid="draft-bulk-upload-zone">
            {bulkUploading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : <Upload className="h-5 w-5 text-muted-foreground" />}
            <span className="text-sm text-muted-foreground">{bulkUploading ? 'Uploading...' : 'Click to bulk upload draft documents, then drag to assign'}</span>
            <input type="file" className="hidden" multiple accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx" onChange={(e) => { bulkUploadFiles(Array.from(e.target.files)); e.target.value = ''; }} />
          </label>

          {/* Unassigned Files */}
          {unassigned.length > 0 && (
            <div className="mt-3 space-y-2">
              <h4 className="text-sm font-semibold text-amber-700">Unassigned Files ({unassigned.length})</h4>
              <div className="flex flex-wrap gap-2">
                {unassigned.map(f => (
                  <div key={f.index} draggable onDragStart={() => handleDragStart(f)}
                    className="flex items-center gap-2 text-xs bg-amber-50 border border-amber-200 rounded px-3 py-2 cursor-grab">
                    <GripVertical className="h-3 w-3 text-amber-400" />
                    <FileText className="h-3 w-3 text-primary" />
                    <span className="truncate max-w-[200px]">{f.fileName}</span>
                    <button onClick={() => viewDraft(f.index)} className="text-blue-500 hover:text-blue-700"><Eye className="h-3 w-3" /></button>
                    <button onClick={() => deleteDraft(f.index)} className="text-red-400 hover:text-red-600"><Trash2 className="h-3 w-3" /></button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="flex items-center gap-4">
        <Badge variant="outline" className="gap-1.5 py-1.5 px-3">
          <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
          <span className="text-sm">{uploadedCount} / {requiredDocNames.length} Uploaded</span>
        </Badge>
        {missingCount > 0 && (
          <Badge variant="outline" className="gap-1.5 py-1.5 px-3 border-red-200 text-red-700">
            <XCircle className="h-3.5 w-3.5" />
            <span className="text-sm">{missingCount} Missing</span>
          </Badge>
        )}
        {missingCount === 0 && (
          <Badge className="gap-1.5 py-1.5 px-3 bg-green-100 text-green-800 border-green-200">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span className="text-sm">All documents uploaded</span>
          </Badge>
        )}
      </div>

      {/* Documents Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Required Documents vs Draft Uploads</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-8 text-center">#</TableHead>
                  <TableHead>Required Document (from DI)</TableHead>
                  <TableHead className="text-center w-28">Status</TableHead>
                  <TableHead>Uploaded File</TableHead>
                  <TableHead className="text-center w-28">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requiredDocNames.map((docName, i) => {
                  const drafts = draftMap[docName] || [];
                  const hasUpload = drafts.length > 0;
                  const isDropping = dropTarget === docName;
                  return (
                    <TableRow key={i}
                      className={`${!hasUpload ? 'bg-red-50/50 dark:bg-red-900/10' : ''} ${isDropping ? 'ring-2 ring-inset ring-primary bg-primary/5' : ''}`}
                      data-testid={`draft-row-${i}`}
                      onDragOver={(e) => handleDragOver(e, docName)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, docName)}>
                      <TableCell className="text-center text-muted-foreground text-xs">{i + 1}</TableCell>
                      <TableCell className="text-sm font-medium">{docName}</TableCell>
                      <TableCell className="text-center">
                        {hasUpload ? (
                          <Badge className="bg-green-100 text-green-800 border-green-200 gap-1">
                            <CheckCircle2 className="h-3 w-3" />Uploaded
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-red-200 text-red-600 gap-1">
                            <AlertCircle className="h-3 w-3" />Missing
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {hasUpload ? (
                          <div className="space-y-1">
                            {drafts.map((d, di) => (
                              <div key={di} draggable onDragStart={() => handleDragStart(d)}
                                className="flex items-center gap-2 cursor-grab">
                                <GripVertical className="h-3 w-3 text-muted-foreground" />
                                <FileText className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                <span className="text-xs truncate max-w-[200px]" title={d.fileName}>{d.fileName}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          {hasUpload && drafts.map((d, di) => (
                            <div key={di} className="flex items-center gap-0.5">
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => viewDraft(d.index)} title="View">
                                <Eye className="h-3.5 w-3.5 text-blue-600" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => deleteDraft(d.index)} title="Delete">
                                <Trash2 className="h-3.5 w-3.5 text-red-500" />
                              </Button>
                            </div>
                          ))}
                          <label className="cursor-pointer inline-flex items-center justify-center h-7 w-7 rounded-md hover:bg-muted transition-colors" title="Upload">
                            {uploading === docName ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 text-muted-foreground" />}
                            <input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xls,.xlsx" className="hidden"
                              onChange={(e) => { if (e.target.files[0]) uploadDraft(docName, e.target.files[0]); e.target.value = ''; }}
                              disabled={uploading === docName} />
                          </label>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
