'use client';

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { FileText, Search, CalendarIcon, PlusCircle, FileType, ImageIcon, ChevronsUpDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/use-permissions';
import { useUserProfile } from '@/hooks/use-user-profile';
import { DocumentUploader } from '@/components/document-uploader';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CustomCalendar } from '@/components/ui/custom-calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { DeleteActionButton, ViewActionButton } from '@/components/record-action-buttons';
import type { DocumentExpirySettings } from '@/app/(app)/admin/document-dates/page';
import { getContrastingTextColor, getDocumentExpiryBadgeStyle } from '@/lib/document-expiry';
import { ResponsiveCardGrid } from '@/components/responsive-card-grid';
import { TenantLayoutDisabledState } from '@/components/tenant-layout-disabled-state';
import { useTenantRouteAccess } from '@/hooks/use-tenant-route-access';

const parseLocalDate = (value?: string | null) => {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day, 12);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

interface CompanyDocument {
  id: string;
  name: string;
  url: string;
  uploadDate: string;
  expirationDate: string | null;
  type: 'file' | 'image';
}

export default function CompanyDocumentsPage() {
  const { isLoading: isAccessLoading, isAllowed } = useTenantRouteAccess({ href: '/operations/company-documents' });
  const { toast } = useToast();
  const { tenantId } = useUserProfile();
  const { hasPermission } = usePermissions();
  const isMobile = useIsMobile();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [viewingDoc, setViewingDoc] = useState<CompanyDocument | null>(null);
  const [viewingImageError, setViewingImageError] = useState(false);

  const [documents, setDocuments] = useState<CompanyDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expirySettings, setExpirySettings] = useState<DocumentExpirySettings | null>(null);

  if (!isAccessLoading && !isAllowed) {
    return <TenantLayoutDisabledState />;
  }

  useEffect(() => {
    setViewingImageError(false);
  }, [viewingDoc?.id]);

  useEffect(() => {
    const load = async () => {
      try {
        const [docsResponse, configResponse] = await Promise.all([
          fetch('/api/company-documents', { cache: 'no-store' }),
          fetch('/api/tenant-config', { cache: 'no-store' }),
        ]);

        if (!docsResponse.ok) {
          throw new Error('Failed to load documents');
        }

        const [docsPayload, configPayload] = await Promise.all([
          docsResponse.json().catch(() => ({})),
          configResponse.json().catch(() => ({})),
        ]);

        setDocuments(docsPayload.documents || []);

        const config = configPayload?.config && typeof configPayload.config === 'object' ? configPayload.config : {};
        const settings = (config as any)['document-expiry-settings'] as DocumentExpirySettings | undefined;
        setExpirySettings(settings || null);
      } catch (error) {
        toast({
          variant: 'destructive',
          title: 'Load Failed',
          description: 'Could not load company documents.',
        });
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const canManage = hasPermission('operations-documents-manage');

  const filteredDocs = useMemo(() => {
    if (!documents) return [];
    return documents
      .filter(doc => doc.name.toLowerCase().includes(searchQuery.toLowerCase()))
      .sort((a, b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime());
  }, [documents, searchQuery]);

  const handleDocumentUploaded = async (docDetails: { name: string; url: string; uploadDate: string; expirationDate: string | null }) => {
    const isImage = /\.(png|jpg|jpeg|webp|gif|svg)$/i.test(docDetails.url) || docDetails.url.includes('/image/');

    const newDoc: CompanyDocument = {
      id: crypto.randomUUID(),
      name: docDetails.name,
      url: docDetails.url,
      uploadDate: docDetails.uploadDate,
      expirationDate: null,
      type: isImage ? 'image' : 'file'
    };

    try {
      const response = await fetch('/api/company-documents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newDoc),
      });

      if (!response.ok) {
        throw new Error('Save failed');
      }

      setDocuments((prev) => [newDoc, ...prev]);
      toast({ title: 'Document Added', description: `"${docDetails.name}" has been saved.` });
    } catch {
      toast({
        variant: 'destructive',
        title: 'Save Failed',
        description: 'Could not save document metadata.',
      });
    }
  };

  const handleUpdateExpiry = async (docId: string, date: Date | undefined) => {
    const expirationDate = date ? new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12)).toISOString() : null;
    const previous = documents;
    setDocuments((prev) => prev.map((d) => (d.id === docId ? { ...d, expirationDate } : d)));
    try {
      const response = await fetch('/api/company-documents', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: docId, expirationDate }),
      });
      if (!response.ok) {
        throw new Error('Update failed');
      }
      window.dispatchEvent(new Event('safeviate-document-expiry-settings-updated'));
      toast({ title: 'Expiry Updated' });
    } catch {
      setDocuments(previous);
      toast({
        variant: 'destructive',
        title: 'Update Failed',
        description: 'Could not update expiry date.',
      });
    }
  };

  const handleDelete = async (id: string) => {
    const previous = documents;
    setDocuments((prev) => prev.filter((d) => d.id !== id));
    try {
      const response = await fetch(`/api/company-documents?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Delete failed');
      }
      toast({ title: 'Document Deleted' });
    } catch {
      setDocuments(previous);
      toast({
        variant: 'destructive',
        title: 'Delete Failed',
        description: 'Could not delete document.',
      });
    }
  };

  const renderDocumentCard = (doc: CompanyDocument) => {
    const expiryStyle = getDocumentExpiryBadgeStyle(doc.expirationDate, expirySettings);
    const uploadedLabel = format(new Date(doc.uploadDate), 'dd MMM yyyy');
    const expiryLabel = doc.expirationDate
      ? format(parseLocalDate(doc.expirationDate) || new Date(doc.expirationDate), 'dd MMM yyyy')
      : 'Set expiry';

    return (
      <Card key={doc.id} className="group overflow-hidden border shadow-none transition-shadow hover:shadow-sm">
        <CardHeader className="flex flex-row items-start justify-between gap-3 border-b bg-muted/20 px-4 py-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-background">
              {doc.type === 'image' ? (
                <ImageIcon className="h-4 w-4 text-primary" />
              ) : (
                <FileType className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-sm font-black uppercase tracking-[-0.01em] text-foreground">{doc.name}</p>
                <Badge variant="outline" className="h-6 rounded-full px-2 text-[10px] font-black uppercase tracking-[0.08em]">
                  {doc.type === 'image' ? 'Image' : 'File'}
                </Badge>
              </div>
              <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Uploaded {uploadedLabel}
              </p>
            </div>
          </div>
          <ViewActionButton onClick={() => setViewingDoc(doc)} />
        </CardHeader>
        <CardContent className="space-y-4 px-4 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border bg-background px-3 py-3">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Uploaded</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{uploadedLabel}</p>
            </div>
            <div className="rounded-lg border bg-background px-3 py-3">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Expiration</p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {doc.expirationDate ? expiryLabel : 'No expiry set'}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex-1">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="default"
                    size="sm"
                    className={cn(
                      "h-9 w-full justify-between gap-2 px-3 text-xs font-bold shadow-none",
                      !doc.expirationDate && "border border-dashed text-muted-foreground italic"
                    )}
                    style={doc.expirationDate && expiryStyle ? {
                      backgroundColor: expiryStyle.borderColor || '#ffffff',
                      borderColor: expiryStyle.borderColor || '#ffffff',
                      color: getContrastingTextColor(expiryStyle.borderColor || '#ffffff'),
                    } : undefined}
                  >
                    <span className="flex items-center gap-2">
                      <CalendarIcon className="h-3.5 w-3.5" />
                      {doc.expirationDate ? expiryLabel : 'Set Expiry'}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CustomCalendar
                    selectedDate={parseLocalDate(doc.expirationDate || undefined) || undefined}
                    onDateSelect={(date) => handleUpdateExpiry(doc.id, date)}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex items-center justify-end gap-2">
              {canManage && (
                <DeleteActionButton
                  description={`This will permanently delete "${doc.name}".`}
                  onDelete={() => handleDelete(doc.id)}
                  srLabel="Delete document"
                />
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="lg:max-w-[1100px] mx-auto w-full flex flex-col gap-6 h-full overflow-hidden pt-4">
      <Card className="flex-1 flex flex-col overflow-hidden shadow-none border">
        <CardHeader className="shrink-0 border-b bg-muted/5 px-2 py-1.5 md:px-3 md:py-2">
          <div className="flex justify-center">
            <div className="flex w-full min-w-0 flex-col items-center gap-1.5 sm:flex-row sm:items-center sm:justify-center">
              <div className="relative w-full sm:w-80 lg:w-[360px] lg:flex-none">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search documents..."
                  className="h-8 bg-background pl-9 text-xs"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Badge variant="outline" className="h-8 whitespace-nowrap px-3 font-mono text-[10px]">
                {filteredDocs.length} TOTAL
              </Badge>
              {canManage && (
                <DocumentUploader
                  onDocumentUploaded={handleDocumentUploaded}
                  trigger={(open) => (
                    <Button
                      onClick={() => open()}
                      variant={isMobile ? "outline" : "default"}
                      size={isMobile ? "sm" : "default"}
                      className={isMobile ? "h-8 w-full justify-between border-slate-200 bg-white px-3 text-[10px] font-bold uppercase text-slate-900 shadow-sm hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 sm:w-auto" : "h-8 px-3 text-[9px] font-black uppercase tracking-[0.08em] shadow-sm"}
                    >
                      <span className="flex items-center gap-2">
                        <PlusCircle className={isMobile ? "h-3.5 w-3.5" : "h-4 w-4"} />
                        {isMobile ? "Add" : "Add Document"}
                      </span>
                      {isMobile ? <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" /> : null}
                    </Button>
                  )}
                />
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-1 p-0 overflow-hidden bg-background">
          <ScrollArea className="h-full">
            <ResponsiveCardGrid
              items={filteredDocs}
              isLoading={isLoading}
              loadingCount={3}
              className="p-4"
              gridClassName="sm:grid-cols-2 xl:grid-cols-3"
              renderItem={(doc) => renderDocumentCard(doc)}
              renderLoadingItem={(index) => <Skeleton key={index} className="h-56 w-full rounded-lg" />}
              emptyState={(
              <div className="p-4">
                <Card className="border-dashed shadow-none">
                  <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                    <FileText className="h-16 w-16 text-foreground/70" />
                    <div className="space-y-1">
                      <p className="text-lg font-semibold text-foreground">No documents found.</p>
                      <p className="text-sm text-foreground/80">Controlled manuals and procedures will appear here once added.</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
              )}
            />
          </ScrollArea>
        </CardContent>
      </Card>

      <Dialog
        open={!!viewingDoc}
        onOpenChange={(open) => {
          if (!open) {
            setViewingDoc(null);
            setViewingImageError(false);
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-black uppercase tracking-tight">{viewingDoc?.name}</DialogTitle>
            <DialogDescription className="text-xs uppercase tracking-widest">
              Preview the selected company document.
            </DialogDescription>
          </DialogHeader>
          <div className="relative aspect-[16/10] w-full overflow-hidden rounded-lg border bg-muted/20">
            {viewingDoc?.type === 'image' || viewingDoc?.url.startsWith('default_api:image/') ? (
              viewingImageError ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                  <FileText className="h-14 w-14 text-muted-foreground" />
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">Image preview unavailable.</p>
                    <p className="text-sm text-muted-foreground">
                      The stored file could not be fetched from the current environment.
                    </p>
                  </div>
                  {viewingDoc?.url && (
                    <Button asChild variant="outline">
                      <a href={viewingDoc.url} target="_blank" rel="noreferrer">
                        Open Source
                      </a>
                    </Button>
                  )}
                </div>
              ) : (
                <img
                  src={viewingDoc.url}
                  alt={viewingDoc.name}
                  className="h-full w-full object-contain"
                  onError={() => setViewingImageError(true)}
                />
              )
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
                <FileText className="h-14 w-14 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Binary file preview is not available in browser. Use the download button below.</p>
                <Button asChild>
                  <a href={viewingDoc?.url} download={viewingDoc?.name}>Download Document</a>
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
