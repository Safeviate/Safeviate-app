'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MainPageHeader } from '@/components/page-header';
import { DatabaseForm } from '../../../../development/database/database-form';

export default function NewTenantPage() {
  return (
    <div className="lg:max-w-[1100px] mx-auto flex flex-1 min-h-0 w-full flex-col gap-6 overflow-hidden px-1 pb-4">
      <Card className="flex flex-1 min-h-0 flex-col overflow-hidden border shadow-none">
        <MainPageHeader
          title="New Tenant"
          description="Create a new tenant, then configure its branding, visible pages, menus, and submenus."
          actions={
            <Button asChild variant="outline" className="h-10 rounded-xl px-4 text-[10px] font-black uppercase tracking-widest shadow-none">
              <Link href="/admin/page-format">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Tenants
              </Link>
            </Button>
          }
        />
        <div className="flex-1 min-h-0 overflow-hidden bg-background">
          <DatabaseForm
            lockTenantSelection
            detailBasePath="/admin/page-format/tenants"
            returnHref="/admin/page-format"
          />
        </div>
      </Card>
    </div>
  );
}
