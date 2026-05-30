'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, PlusCircle, Trash2 } from 'lucide-react';
import { MainPageHeader, HEADER_SECONDARY_BUTTON_CLASS } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { Tenant } from '@/types/quality';

export default function DatabasePage() {
  const { toast } = useToast();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [databaseAvailable, setDatabaseAvailable] = useState(true);

  const loadTenants = useCallback(async () => {
    try {
      const response = await fetch('/api/tenants', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({ tenants: [], databaseAvailable: false }));
      const rows = Array.isArray(payload?.tenants) ? (payload.tenants as Tenant[]) : [];
      setDatabaseAvailable(payload?.databaseAvailable !== false);
      setTenants(rows.filter((tenant) => tenant.id !== 'safeviate'));
    } catch {
      setDatabaseAvailable(false);
      setTenants([]);
    }
  }, []);

  useEffect(() => {
    void loadTenants();
  }, [loadTenants]);

  useEffect(() => {
    const handleUpdate = () => void loadTenants();
    window.addEventListener('safeviate-tenants-updated', handleUpdate);
    return () => window.removeEventListener('safeviate-tenants-updated', handleUpdate);
  }, [loadTenants]);

  const handleDeleteTenant = async (tenantId: string, tenantName: string) => {
    if (!window.confirm(`Delete "${tenantName}"? This cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/tenants?tenantId=${encodeURIComponent(tenantId)}`, {
        method: 'DELETE',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to delete tenant.');
      }

      setTenants((current) => current.filter((tenant) => tenant.id !== tenantId));
      window.dispatchEvent(new Event('safeviate-tenants-updated'));
      toast({
        title: 'Tenant Deleted',
        description: `"${tenantName}" has been removed.`,
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Delete Failed',
        description: error instanceof Error ? error.message : 'System fault during deletion.',
      });
    }
  };

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1100px] flex-col gap-6 overflow-hidden px-1 pb-4">
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden border shadow-none">
        <MainPageHeader
          title="Tenant Setup"
          description="Create additional client tenants for companies that will use this app, then return here to edit or remove those tenant records."
          actions={
            <Button
              asChild
              variant="outline"
              className={cn(HEADER_SECONDARY_BUTTON_CLASS, 'text-[9px] font-black uppercase tracking-[0.08em]')}
            >
              <Link href="/development/database/new">
                <PlusCircle className="h-3.5 w-3.5" />
                Add Tenant
              </Link>
            </Button>
          }
        />
        <CardContent className="flex-1 min-h-0 overflow-auto bg-background p-4 sm:p-6">
          {!databaseAvailable && (
            <div className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
              The database is not reachable from this local environment, so this page is showing a fallback shell instead of live tenant records.
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {tenants.length > 0 ? (
              tenants.map((tenant) => (
                <div key={tenant.id} className="flex flex-col gap-4 rounded-3xl border bg-muted/5 p-5">
                  <div className="space-y-1">
                    <p className="text-sm font-black uppercase tracking-tight text-foreground">{tenant.name}</p>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{tenant.id}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      asChild
                      variant="ghost"
                      className="h-8 justify-between px-0 text-xs font-black uppercase tracking-tight text-primary hover:bg-transparent hover:text-primary"
                    >
                      <Link href={`/development/database/new?tenantId=${encodeURIComponent(tenant.id)}`}>
                        Edit tenant
                        <ChevronRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                      </Link>
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      className="h-8 rounded-xl px-3 text-[9px] font-black uppercase tracking-widest shadow-sm"
                      onClick={() => void handleDeleteTenant(tenant.id, tenant.name)}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      Delete
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-3xl border border-dashed bg-background px-5 py-8 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                {databaseAvailable ? 'No client tenants found.' : 'No live tenant records available while the database is offline.'}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
