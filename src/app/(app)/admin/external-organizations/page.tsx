'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PlusCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/use-permissions';
import { useIsMobile } from '@/hooks/use-mobile';
import { ChevronsUpDown } from 'lucide-react';
import type { ExternalOrganization } from '@/types/quality';
import { DeleteActionButton, EditActionButton } from '@/components/record-action-buttons';
import { useUserProfile } from '@/hooks/use-user-profile';
import { ResponsiveCardGrid } from '@/components/responsive-card-grid';
import { Skeleton } from '@/components/ui/skeleton';

export default function ExternalOrganizationsPage() {
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const isMobile = useIsMobile();
  const { tenantId } = useUserProfile();
  
  const canManage = hasPermission('admin-external-orgs-manage');

  const [organizations, setOrganizations] = useState<ExternalOrganization[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState<ExternalOrganization | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');

  const loadOrgs = useCallback(async () => {
    setIsLoading(true);
    try {
        const response = await fetch('/api/external-organizations', { cache: 'no-store' });
        const payload = await response.json().catch(() => ({ organizations: [] }));
        setOrganizations(Array.isArray(payload.organizations) ? payload.organizations : []);
    } catch (e) {
        console.error('Failed to load external orgs', e);
        setOrganizations([]);
    } finally {
        setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrgs();
    window.addEventListener('safeviate-external-organizations-updated', loadOrgs);
    return () => window.removeEventListener('safeviate-external-organizations-updated', loadOrgs);
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
        const payload = { organization: { ...(editingOrg || {}), name, contactEmail: email, address } };
        const response = await fetch(editingOrg ? `/api/external-organizations/${editingOrg.id}` : '/api/external-organizations', {
          method: editingOrg ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Failed to save organization.');
        window.dispatchEvent(new Event('safeviate-external-organizations-updated'));
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
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Failed to delete organization.');
        window.dispatchEvent(new Event('safeviate-external-organizations-updated'));
        toast({ title: 'Organization Deleted' });
    } catch (e) {
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to delete organization.' });
    }
  };

  const renderOrgCard = (org: ExternalOrganization) => (
    <Card key={org.id} className="group overflow-hidden border shadow-none transition-shadow hover:shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between gap-3 border-b bg-muted/20 px-4 py-3">
        <div className="min-w-0 space-y-1">
          <p className="truncate text-sm font-black uppercase tracking-[-0.01em] text-foreground">{org.name}</p>
          <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            External Organization
          </p>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border bg-background text-[10px] font-black uppercase text-muted-foreground">
          Org
        </div>
      </CardHeader>
      <CardContent className="space-y-4 px-4 py-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border bg-background px-3 py-3">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Contact Email</p>
            <p className="mt-1 break-words text-sm font-semibold text-foreground">{org.contactEmail || 'N/A'}</p>
          </div>
          <div className="rounded-2xl border bg-background px-3 py-3">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Address</p>
            <p className="mt-1 break-words text-sm font-semibold text-foreground">{org.address || 'N/A'}</p>
          </div>
        </div>

        {canManage ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <EditActionButton onClick={() => handleOpenForm(org)} label="Edit organization" />
            <DeleteActionButton
              description={`This will permanently delete external organization "${org.name}".`}
              onDelete={() => handleDelete(org.id)}
              srLabel="Delete organization"
            />
          </div>
        ) : (
          <div className="flex justify-end">
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Read only</span>
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="flex flex-col gap-6 h-full p-6">
      <Card className="shadow-none border overflow-hidden">
        {canManage && (
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border bg-muted/5 px-4 py-3" style={{ borderBottomColor: 'hsl(var(--card-border))' }}>
            <Button
              onClick={() => handleOpenForm()}
              variant={isMobile ? 'outline' : 'default'}
              size={isMobile ? 'sm' : 'default'}
              className={isMobile ? 'h-9 w-full justify-between border-slate-200 bg-white px-3 text-[10px] font-bold uppercase text-slate-900 shadow-sm hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100' : 'font-black uppercase text-[10px] h-9 tracking-tight'}
            >
              <span className="flex items-center gap-2">
                <PlusCircle className={isMobile ? 'h-3.5 w-3.5' : 'mr-2 h-4 w-4'} /> Add Organization
              </span>
              {isMobile ? <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" /> : null}
            </Button>
          </div>
        )}
        <CardContent className="p-0">
          <ResponsiveCardGrid
            items={organizations}
            isLoading={isLoading}
            loadingCount={3}
            className="p-4"
            gridClassName="sm:grid-cols-2 xl:grid-cols-3"
            renderItem={(org) => renderOrgCard(org)}
            renderLoadingItem={(index) => <Skeleton key={index} className="h-48 w-full rounded-2xl" />}
            emptyState={(
              <div className="p-4">
                <Card className="border-dashed shadow-none">
                  <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                    <p className="text-lg font-semibold text-foreground">No external organizations found.</p>
                    <p className="text-sm text-foreground/80">Add a company record to begin tracking partners and contacts.</p>
                  </CardContent>
                </Card>
              </div>
            )}
          />
        </CardContent>
      </Card>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingOrg ? 'Edit' : 'Add'} Organization</DialogTitle>
            <DialogDescription>Define the details for the external company.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Organization Name</Label>
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
            <Button onClick={handleSave}>Save Organization</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
