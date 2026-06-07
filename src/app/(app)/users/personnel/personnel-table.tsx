'use client';

import Link from 'next/link';
import { ArrowRight, Building2, Mail, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { Personnel } from './personnel-directory-page';
import { PersonnelActions } from './personnel-actions';
import { ResponsiveCardGrid } from '@/components/responsive-card-grid';

interface PersonnelTableProps {
  data: Personnel[];
  rolesMap: Map<string, string>;
  departmentsMap: Map<string, string>;
  tenantId: string;
}

export function PersonnelTable({ data, rolesMap, departmentsMap, tenantId }: PersonnelTableProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center text-center text-foreground/80">
        No personnel found.
      </div>
    );
  }

  return (
    <TooltipProvider>
      <ScrollArea className="h-full">
        <ResponsiveCardGrid
          items={data}
          isLoading={false}
          className="p-4 pb-20"
          gridClassName="sm:grid-cols-2 xl:grid-cols-3"
          renderItem={(person) => (
            <Card key={person.id} className="overflow-hidden border shadow-none transition-shadow hover:shadow-sm">
              <CardHeader className="flex flex-row items-start justify-between gap-3 border-b bg-muted/20 px-4 py-3">
                <div className="min-w-0 space-y-1">
                  <p className="truncate text-[10px] font-black uppercase tracking-widest text-primary">
                    {person.userNumber || 'NO ID'}
                  </p>
                  <p className="truncate text-sm font-black text-foreground">
                    {person.firstName} {person.lastName}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {person.suspendedAt && (
                    <Badge variant="destructive" className="h-5 text-[9px] font-black uppercase tracking-[0.12em]">
                      Suspended
                    </Badge>
                  )}
                  <div className="flex gap-1">
                  {person.isErpIncerfaContact && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <ShieldAlert className="h-4 w-4 text-red-600" />
                      </TooltipTrigger>
                      <TooltipContent>Designated ERP INCERFA Contact</TooltipContent>
                    </Tooltip>
                  )}
                  {person.isErpAlerfaContact && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <ShieldAlert className="h-4 w-4 text-amber-600" />
                      </TooltipTrigger>
                      <TooltipContent>Designated ERP ALERFA Contact</TooltipContent>
                    </Tooltip>
                  )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 px-4 py-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border bg-background px-3 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Email</p>
                    <p className="mt-1 flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
                      <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="min-w-0 truncate" title={person.email}>
                        {person.email}
                      </span>
                    </p>
                  </div>
                  <div className="rounded-lg border bg-background px-3 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Department</p>
                    <p className="mt-1 truncate text-sm font-semibold text-foreground" title={departmentsMap.get(person.department || '') || 'N/A'}>
                      {departmentsMap.get(person.department || '') || 'N/A'}
                    </p>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border bg-background px-3 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Role</p>
                    <p className="mt-1 truncate text-sm font-semibold text-foreground" title={rolesMap.get(person.role) || person.role}>
                      {rolesMap.get(person.role) || person.role}
                    </p>
                  </div>
                  <div className="rounded-lg border bg-background px-3 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Organization</p>
                    <p className="mt-1 flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="min-w-0 truncate" title={person.organizationId || 'Internal'}>
                        {person.organizationId || 'Internal'}
                      </span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <PersonnelActions tenantId={tenantId} user={person} />
                  <Button asChild variant="ghost" size="sm" className="h-8 w-8 px-0">
                    <Link href={`/users/personnel/${person.id}?type=${person.userType}`}>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          emptyState={(
            <div className="flex h-24 items-center justify-center text-center text-foreground/80">
              No personnel found.
            </div>
          )}
        />
      </ScrollArea>
    </TooltipProvider>
  );
}
