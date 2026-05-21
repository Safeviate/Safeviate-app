'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, PlusCircle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import type { Tenant } from '@/types/quality';

export default function DatabasePage() {
  const { toast } = useToast();
  const [tenants, setTenants] = useState<Tenant[]>([]);

  useEffect(() => {
    const loadTenants = async () => {
      try {
        const response = await fetch('/api/tenants', { cache: 'no-store' });
        const payload = await response.json().catch(() => ({ tenants: [] }));
        const rows = Array.isArray(payload?.tenants) ? (payload.tenants as Tenant[]) : [];
        setTenants(rows.filter((tenant) => tenant.id !== 'safeviate'));
      } catch {
        setTenants([]);
      }
    };

    void loadTenants();
  }, []);

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
      <div className="flex items-start justify-between gap-4 rounded-3xl border bg-background px-6 py-6 shadow-none">
        <div className="space-y-1">
          <h1 className="text-2xl font-black uppercase leading-none tracking-tighter sm:text-3xl">Safeviate Tenant Setup</h1>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Tenant setup belongs here only. Client tenants do not get their own setup surface.
          </p>
        </div>
        <Button asChild className="h-10 rounded-xl px-6 text-[10px] font-black uppercase tracking-widest shadow-sm">
          <Link href="/development/database/new?tenantId=safeviate">
            <PlusCircle className="mr-2 h-4 w-4" />
            Open Setup
          </Link>
        </Button>
      </div>

      <Card className="border shadow-none">
        <CardContent className="p-6">
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
                No client tenants found.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
