'use client';

import { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { CalendarIcon, Trash2, Upload, Eye, PlusCircle, FileText, X } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CustomCalendar } from '@/components/ui/custom-calendar';
import { DocumentUploader } from '@/components/document-uploader';
import type { Aircraft } from '@/types/aircraft';
import type { DocumentExpirySettings } from '@/app/(app)/admin/document-dates/page';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import Image from 'next/image';
import { getDocumentExpiryColor } from '@/lib/document-expiry';

const parseLocalDate = (value?: string | null) => {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day, 12);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

interface AircraftDocumentsProps {
  aircraft: Aircraft;
}

export function AircraftDocuments({ aircraft }: AircraftDocumentsProps) {
  const { toast } = useToast();
  const [viewingImageUrl, setViewingImageUrl] = useState<string | null>(null);
  const [expirySettings, setExpirySettings] = useState<DocumentExpirySettings | null>(null);

  useEffect(() => {
    void fetch('/api/tenant-config', { cache: 'no-store' })
      .then((response) => response.json().catch(() => ({})))
      .then((payload) => {
        const settings = payload?.config?.['document-expiry-settings'] as DocumentExpirySettings | undefined;
        if (settings) setExpirySettings(settings);
      })
      .catch((e) => {
        console.error('Failed to load expiry settings', e);
      });
  }, []);

  const handleDocumentUpdate = async (updatedDocuments: any[]) => {
    try {
        const response = await fetch(`/api/aircraft/${aircraft.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ aircraft: { ...aircraft, documents: updatedDocuments } }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Failed to update documents.');
        window.dispatchEvent(new Event('safeviate-aircrafts-updated'));
    } catch (e) {
        toast({ variant: 'destructive', title: 'Update Failed' });
    }
  };

  const onDocumentUploaded = (docDetails: any) => {
    const currentDocs = aircraft.documents || [];
    const updatedDocs = [...currentDocs, docDetails];
    handleDocumentUpdate(updatedDocs);
    toast({ title: "Document Synchronized", description: `${docDetails.name} has been added to the aircraft record.` });
  };

  const handleExpirationDateChange = (docName: string, date: Date | undefined) => {
    const currentDocs = aircraft.documents || [];
    const updatedDocs = currentDocs.map(d => 
      d.name === docName ? { ...d, expirationDate: date ? new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12)).toISOString() : null } : d
    );
    handleDocumentUpdate(updatedDocs);
  };

  const handleDocumentDelete = (docNameToDelete: string) => {
    const updatedDocs = (aircraft.documents || []).filter(doc => doc.name !== docNameToDelete);
    handleDocumentUpdate(updatedDocs);
    toast({ title: "Document Purged", description: "The record has been removed from the aircraft record." });
  };

  return (
    <Card className="rounded-3xl border-2 shadow-none overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between p-8 border-b bg-muted/5">
        <div>
          <CardTitle className="text-xl font-black uppercase tracking-tight">Compliance Library</CardTitle>
          <CardDescription className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-1">Airworthiness, Registration, and Insurance Documentation.</CardDescription>
        </div>
        <DocumentUploader
          onDocumentUploaded={onDocumentUploaded}
          trigger={(open) => (
            <Button size="sm" onClick={() => open()} className="h-10 px-6 text-[10px] font-black uppercase tracking-widest shadow-md gap-2">
              <PlusCircle className="h-4 w-4" /> Add Record
            </Button>
          )}
        />
      </CardHeader>
      <CardContent className="p-0">
        {aircraft.documents && aircraft.documents.length > 0 ? (
          <Table>
            <TableHeader className="bg-muted/5">
              <TableRow className="hover:bg-transparent border-b-2">
                <TableHead className="text-[10px] font-black uppercase tracking-widest h-12 px-8">Document Identifier</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-widest h-12">Expiry Date</TableHead>
                <TableHead className="text-right text-[10px] font-black uppercase tracking-widest h-12 px-8">Vault Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {aircraft.documents.map((doc) => {
                const statusColor = getDocumentExpiryColor(doc.expirationDate, expirySettings || undefined);
                return (
                  <TableRow key={doc.name} className="hover:bg-muted/5 transition-colors">
                    <TableCell className="px-8 py-4">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-primary/5 flex items-center justify-center shrink-0 border border-primary/10">
                                <FileText className="h-5 w-5 text-primary" />
                            </div>
                            <span className="text-sm font-bold uppercase tracking-tight">{doc.name}</span>
                        </div>
                    </TableCell>
                    <TableCell>
                      <Popover>
                        <PopoverTrigger asChild>
                        <Button variant="outline" className="h-10 min-w-[180px] justify-start gap-2 border-2 hover:bg-muted/50 rounded-xl text-left font-black uppercase tracking-tight">
                          {statusColor && <div className="h-2 w-2 rounded-full animate-pulse shrink-0" style={{ backgroundColor: statusColor }} />}
                          <CalendarIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="truncate text-xs">
                            {doc.expirationDate ? format(parseLocalDate(doc.expirationDate) || new Date(doc.expirationDate), 'dd MMM yyyy') : 'Set Expiry Date'}
                          </span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 rounded-2xl border-2 shadow-2xl overflow-hidden" align="center">
                          <CustomCalendar
                            selectedDate={parseLocalDate(doc.expirationDate || undefined) || undefined}
                            onDateSelect={(date) => handleExpirationDateChange(doc.name, date)}
                          />
                        </PopoverContent>
                      </Popover>
                    </TableCell>
                    <TableCell className="px-8 text-right">
                      <div className="flex gap-2 justify-end">
                        <Button variant="outline" size="sm" onClick={() => setViewingImageUrl(doc.url)} className="h-9 px-4 text-[10px] font-black uppercase tracking-widest border-2 gap-2">
                          <Eye className="h-4 w-4" /> View
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDocumentDelete(doc.name)} className="h-9 w-9 text-destructive hover:bg-destructive/10">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-24 flex flex-col items-center justify-center gap-4 opacity-50">
            <Upload className="h-12 w-12 text-muted-foreground/30" />
            <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Digital Vault Empty</p>
                <p className="text-xs font-medium text-muted-foreground max-w-[200px]">Upload required certifications for {aircraft.tailNumber}.</p>
            </div>
          </div>
        )}
      </CardContent>
      <Dialog open={!!viewingImageUrl} onOpenChange={() => setViewingImageUrl(null)}>
        <DialogContent className="max-w-5xl max-h-[92vh] p-0 overflow-hidden rounded-3xl border-2 shadow-2xl bg-black/95">
          <DialogHeader className="p-6 absolute top-0 left-0 right-0 z-50 bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
            <div className="flex items-center justify-between">
                <DialogTitle className="text-white text-lg font-black uppercase tracking-tight">Security Document Viewer</DialogTitle>
                <Button variant="ghost" size="icon" onClick={() => setViewingImageUrl(null)} className="text-white hover:bg-white/10 pointer-events-auto">
                    <X className="h-6 w-6" />
                </Button>
            </div>
          </DialogHeader>
          <div className="relative w-full h-[92vh] flex items-center justify-center">
            {viewingImageUrl && (
              <Image src={viewingImageUrl} alt="Document View" fill className="object-contain" unoptimized />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
