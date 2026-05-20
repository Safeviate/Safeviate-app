'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PlusCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/use-permissions';
import { useIsMobile } from '@/hooks/use-mobile';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { ExternalOrganization } from '@/types/quality';
import { ChevronsUpDown } from 'lucide-react';
import { DeleteActionButton, EditActionButton } from '@/components/record-action-buttons';
import { cn } from '@/lib/utils';
import { CARD_HEADER_BAND_CLASS, HEADER_COMPACT_CONTROL_CLASS, HEADER_SECONDARY_BUTTON_CLASS } from '@/components/page-header';

export default function ExternalCompaniesPage() {
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const isMobile = useIsMobile();
  const canManage = hasPermission('admin-external-orgs-manage');

  const [organizations, setOrganizations] = useState<ExternalOrganization[]>([]);
  const [isLoadingOrgs, setIsLoadingOrgs] = useState(true);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState<ExternalOrganization | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');

  const loadOrgs = useCallback(async () => {
    setIsLoadingOrgs(true);
    try {
      const response = await fetch('/api/external-organizations', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({ organizations: [] }));
      setOrganizations(Array.isArray(payload.organizations) ? payload.organizations : []);
    } catch (e) {
        console.error("Failed to load external orgs", e);
    } finally {
        setIsLoadingOrgs(false);
    }
  }, []);

  useEffect(() => {
    void loadOrgs();
    window.addEventListener('safeviate-external-orgs-updated', loadOrgs);
    return () => window.removeEventListener('safeviate-external-orgs-updated', loadOrgs);
  }, [loadOrgs]);

  const handleOpenForm = (org: ExternalOrganization | null = null) => {
    if (!canManage) return;
    setEditingOrg(org);
    setName(org?.name || '');
    setEmail(org?.contactEmail || '');
    setAddress(org?.address || '');
    setIsFormOpen(true);
  };

  const handleSave = async () => {
    if (!canManage) return;
    if (!name.trim()) {
      toast({ variant: 'destructive', title: 'Error', description: 'Organization name is required.' });
      return;
    }

    try {
        const organization: ExternalOrganization = {
          id: editingOrg?.id || crypto.randomUUID(),
          name,
          contactEmail: email,
          address,
        };
        const response = await fetch(editingOrg ? `/api/external-organizations/${editingOrg.id}` : '/api/external-organizations', {
          method: editingOrg ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ organization }),
        });
        if (!response.ok) throw new Error('Failed to save organization');
        window.dispatchEvent(new Event('safeviate-external-orgs-updated'));
        toast({ title: editingOrg ? 'Organization Updated' : 'Organization Created' });
        setIsFormOpen(false);
    } catch (e) {
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to save organization.' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!canManage) return;
    try {
        const response = await fetch(`/api/external-organizations/${id}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Failed to delete organization');
        window.dispatchEvent(new Event('safeviate-external-orgs-updated'));
        toast({ title: 'Organization Deleted' });
    } catch (e) {
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to delete organization.' });
    }
  };

  return (
    <div className="flex flex-col gap-6 h-full min-h-0 lg:max-w-[1100px] mx-auto w-full pt-4">
      <Card className="flex flex-col flex-1 min-h-0 overflow-hidden shadow-none border">
        <CardHeader className={CARD_HEADER_BAND_CLASS}>
          {canManage && (
            <div className="flex items-center justify-end gap-3">
              <Button
                onClick={() => handleOpenForm()}
                variant="outline"
                size={isMobile ? 'sm' : 'default'}
                className={cn(
                  HEADER_SECONDARY_BUTTON_CLASS,
                  HEADER_COMPACT_CONTROL_CLASS,
                  'bg-white text-slate-900 border-slate-200 hover:bg-slate-50 hover:text-slate-900',
                  isMobile ? 'w-full justify-between px-3' : 'min-w-[160px] justify-center px-3',
                )}
              >
                <span className="flex items-center gap-2">
                  <PlusCircle className={isMobile ? 'h-3.5 w-3.5' : 'mr-2 h-4 w-4'} />
                  Add Company
                </span>
                {isMobile ? <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" /> : null}
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="flex-1 min-h-0 p-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="px-6 pb-6">
              <div className="-mx-6 border-b border-border bg-muted/30" style={{ borderBottomColor: 'hsl(var(--card-border))' }}>
                <div className="px-6">
                  <Table>
                    <TableHeader className="[&_tr]:border-0">
                      <TableRow>
                        <TableHead>Company Name</TableHead>
                        <TableHead>Contact Email</TableHead>
                        <TableHead>Address</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                  </Table>
                </div>
              </div>
              <Table>
                <TableBody>
                  {isLoadingOrgs ? (
                    <TableRow><TableCell colSpan={4} className="text-center p-8">Loading...</TableCell></TableRow>
                  ) : (organizations || []).map(org => (
                    <TableRow key={org.id}>
                      <TableCell className="font-medium">{org.name}</TableCell>
                      <TableCell>{org.contactEmail || 'N/A'}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{org.address || 'N/A'}</TableCell>
                      <TableCell className="text-right">
                        {canManage ? (
                          <div className="flex justify-end gap-2">
                            <EditActionButton onClick={() => handleOpenForm(org)} label="Edit company" />
                            <DeleteActionButton
                              description={`This will permanently delete external company "${org.name}".`}
                              onDelete={() => handleDelete(org.id)}
                              srLabel="Delete company"
                            />
                          </div>
                        ) : (
                          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Read only</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!organizations || organizations.length === 0) && !isLoadingOrgs && (
                    <TableRow><TableCell colSpan={4} className="text-center h-24 text-muted-foreground">No external companies found.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingOrg ? 'Edit' : 'Add'} Company</DialogTitle>
            <DialogDescription>Define the details for the external company.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Company Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Contact Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button onClick={handleSave}>Save Company</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
