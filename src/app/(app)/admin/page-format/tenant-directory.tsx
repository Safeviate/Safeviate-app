'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Building2, ChevronRight, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import type { Tenant } from '@/types/quality';

export function TenantDirectory() {
  const { toast } = useToast();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingTenantId, setDeletingTenantId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadTenants = async () => {
      setIsLoading(true);
      try {
        const response = await fetch('/api/tenants', { cache: 'no-store' });
        const payload = await response.json().catch(() => ({ tenants: [] }));
        if (!cancelled) {
          const rows = Array.isArray(payload.tenants) ? payload.tenants : [];
          setTenants(
            rows.length > 0
              ? rows
              : [{ id: 'safeviate', name: 'Safeviate', industry: 'Aviation: Flight Training (ATO)' } as Tenant]
          );
        }
      } catch {
        if (!cancelled) {
          setTenants([{ id: 'safeviate', name: 'Safeviate', industry: 'Aviation: Flight Training (ATO)' } as Tenant]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadTenants();
    window.addEventListener('safeviate-tenants-updated', loadTenants);
    return () => {
      cancelled = true;
      window.removeEventListener('safeviate-tenants-updated', loadTenants);
    };
  }, []);

  const sortedTenants = useMemo(() => {
    return [...tenants].sort((a, b) => {
      if (a.id === 'safeviate') return -1;
      if (b.id === 'safeviate') return 1;
      return a.name.localeCompare(b.name);
    });
  }, [tenants]);

  const handleDeleteTenant = async (tenant: Tenant) => {
    if (tenant.id === 'safeviate') {
      toast({
        variant: 'destructive',
        title: 'Delete blocked',
        description: 'The Safeviate tenant cannot be deleted.',
      });
      return;
    }

    if (!window.confirm(`Delete tenant "${tenant.name}"? This cannot be undone.`)) {
      return;
    }

    setDeletingTenantId(tenant.id);
    try {
      const response = await fetch(`/api/tenants?tenantId=${encodeURIComponent(tenant.id)}`, { method: 'DELETE' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to delete tenant.');
      }

      setTenants((current) => current.filter((entry) => entry.id !== tenant.id));
      window.dispatchEvent(new Event('safeviate-tenants-updated'));
      window.dispatchEvent(new Event('safeviate-tenant-config-updated'));
      toast({
        title: 'Tenant deleted',
        description: `"${tenant.name}" was removed.`,
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Delete failed',
        description: error instanceof Error ? error.message : 'System fault during deletion.',
      });
    } finally {
      setDeletingTenantId(null);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 overflow-hidden">
      <Card className="border shadow-none">
        <CardHeader className="flex flex-row items-start justify-between gap-4 border-b bg-muted/10 px-6 py-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-primary">
              <Building2 className="h-4 w-4" />
              Tenants
            </div>
            <p className="text-sm font-semibold text-foreground">
              Open a tenant to configure its own branding, pages, menus, and submenus separately from Safeviate.
            </p>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <Skeleton className="h-36 w-full rounded-3xl" />
              <Skeleton className="h-36 w-full rounded-3xl" />
              <Skeleton className="h-36 w-full rounded-3xl" />
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {sortedTenants.map((tenant) => (
                <Card key={tenant.id} className="h-full border shadow-none transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary/5">
                  <CardContent className="flex h-full flex-col justify-between gap-4 p-5">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black uppercase tracking-tight text-foreground">{tenant.name}</p>
                          <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{tenant.id}</p>
                        </div>
                        <Badge variant="outline" className="rounded-full border-primary/20 bg-primary/5 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-primary">
                          {tenant.id === 'safeviate' ? 'Base' : 'Client'}
                        </Badge>
                      </div>
                      <div className="rounded-2xl border bg-muted/5 px-3 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Industry</p>
                        <p className="mt-1 text-sm font-semibold text-foreground">{tenant.industry || 'Not set'}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-black uppercase tracking-tight text-primary">
                      <Button asChild variant="ghost" className="h-8 px-0 text-xs font-black uppercase tracking-tight text-primary hover:bg-transparent hover:text-primary">
                        <Link href={`/admin/page-format/tenants/${encodeURIComponent(tenant.id)}`}>
                          Edit tenant
                          <ChevronRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                        </Link>
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        className="h-8 rounded-xl px-3 text-[9px] font-black uppercase tracking-widest shadow-sm"
                        onClick={() => void handleDeleteTenant(tenant)}
                        disabled={tenant.id === 'safeviate' || deletingTenantId === tenant.id}
                      >
                        <Trash2 className="mr-1 h-3.5 w-3.5" />
                        {deletingTenantId === tenant.id ? 'Deleting...' : 'Delete'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
