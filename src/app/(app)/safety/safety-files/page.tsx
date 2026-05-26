'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BriefcaseBusiness, FolderKanban, ShieldAlert, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { MainPageHeader } from '@/components/page-header';
import { AddProjectDialog } from './add-project-dialog';
import { TenantLayoutDisabledState } from '@/components/tenant-layout-disabled-state';
import { useTenantRouteAccess } from '@/hooks/use-tenant-route-access';
import type { SafetyFileProject } from '@/types/safety-file';

type SafetyFileProjectListItem = SafetyFileProject & {
  assignmentCount?: number;
};

function getStatusBadge(status: SafetyFileProject['status']) {
  switch (status) {
    case 'ACTIVE':
      return <Badge className="border-emerald-200 bg-emerald-100 text-emerald-800">Active</Badge>;
    case 'CLOSED':
      return <Badge className="border-slate-200 bg-slate-100 text-slate-800">Closed</Badge>;
    default:
      return <Badge className="border-amber-200 bg-amber-100 text-amber-800">Planning</Badge>;
  }
}

export default function SafetyFilesPage() {
  const { isLoading: isAccessLoading, isAllowed } = useTenantRouteAccess({ href: '/safety/safety-files' });
  const [projects, setProjects] = useState<SafetyFileProjectListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadProjects = async () => {
      setIsLoading(true);
      try {
        const response = await fetch('/api/safety-files', { cache: 'no-store' });
        const payload = response.ok
          ? await response.json().catch(() => ({ projects: [] }))
          : { projects: [] };

        if (!cancelled) {
          setProjects(Array.isArray(payload.projects) ? payload.projects : []);
        }
      } catch {
        if (!cancelled) {
          setProjects([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadProjects();
    return () => {
      cancelled = true;
    };
  }, []);

  const summary = useMemo(() => {
    const activeProjects = projects.filter((project) => project.status === 'ACTIVE').length;
    const totalAssignments = projects.reduce(
      (sum, project) => sum + Number(project.assignmentCount || 0),
      0
    );

    return {
      activeProjects,
      totalProjects: projects.length,
      totalAssignments,
    };
  }, [projects]);

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-[1100px] space-y-6 px-1 pt-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-[520px] w-full" />
      </div>
    );
  }

  if (!isAccessLoading && !isAllowed) {
    return <TenantLayoutDisabledState />;
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-[1100px] flex-col gap-6 overflow-hidden px-1 pt-4">
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden border shadow-none">
        <MainPageHeader
          title="Safety Files"
          description="Create site-based safety file projects, upload the actual project file contents, assign personnel from the user database, and manage risks in one place."
          actions={<AddProjectDialog onProjectCreated={(project) => setProjects((current) => [{ ...project, assignmentCount: 0 }, ...current])} />}
        />

        <CardContent className="flex-1 overflow-y-auto bg-muted/5 p-4 sm:p-6">
          <div className="space-y-6">
            <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
              <Card className="border shadow-none">
                <CardHeader className="space-y-2 border-b bg-background/70">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-amber-600" />
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Legal Basis</p>
                  </div>
                  <CardTitle className="text-lg font-black tracking-tight">Site file compliance is project specific</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 p-5 text-sm text-muted-foreground">
                  <p>
                    South Africa&apos;s Occupational Health and Safety Act is Act 85 of 1993. For construction work,
                    the health and safety file duty is driven mainly by the Construction Regulations, 2014.
                  </p>
                  <p>
                    The principal contractor must open and keep the health and safety file on site, and the client
                    must ensure it is kept and maintained. That means one live site pack per job, not one generic
                    company folder.
                  </p>
                    <p>
                      This workflow treats each site or project as its own compliance container. Each project carries
                      its own uploaded site file, assigned personnel, and risk assessments instead of relying on one
                      generic company folder.
                    </p>
                </CardContent>
              </Card>

              <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-1">
                <Card className="border shadow-none">
                  <CardHeader className="space-y-1 border-b bg-background/70 p-4">
                    <div className="flex items-center gap-2">
                      <FolderKanban className="h-4 w-4 text-primary" />
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Projects</p>
                    </div>
                    <CardTitle className="text-2xl font-black tracking-tight">{summary.totalProjects}</CardTitle>
                  </CardHeader>
                </Card>
                <Card className="border shadow-none">
                  <CardHeader className="space-y-1 border-b bg-background/70 p-4">
                    <div className="flex items-center gap-2">
                      <BriefcaseBusiness className="h-4 w-4 text-primary" />
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Active Sites</p>
                    </div>
                    <CardTitle className="text-2xl font-black tracking-tight">{summary.activeProjects}</CardTitle>
                  </CardHeader>
                </Card>
                <Card className="border shadow-none">
                  <CardHeader className="space-y-1 border-b bg-background/70 p-4">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-primary" />
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Assigned Personnel</p>
                    </div>
                    <CardTitle className="text-2xl font-black tracking-tight">{summary.totalAssignments}</CardTitle>
                  </CardHeader>
                </Card>
              </div>
            </div>

            <Card className="border shadow-none">
              <CardHeader className="space-y-2 border-b bg-background/70">
                <div className="flex items-center gap-2">
                  <FolderKanban className="h-4 w-4 text-primary" />
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Safety File Projects</p>
                </div>
                <CardTitle className="text-lg font-black tracking-tight">Open a project and assign people to it</CardTitle>
              </CardHeader>
              <CardContent className="p-5">
                {projects.length > 0 ? (
                  <div className="grid gap-4 lg:grid-cols-2">
                    {projects.map((project) => (
                      <Card key={project.id} className="border shadow-none">
                        <CardHeader className="space-y-3 border-b bg-muted/5 p-5">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div className="space-y-2">
                              <CardTitle className="text-lg font-black tracking-tight">{project.name}</CardTitle>
                              <p className="text-sm text-muted-foreground">
                                {project.siteName || project.siteAddress || project.clientName || 'Project details still being completed.'}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              {getStatusBadge(project.status)}
                              <Badge variant="outline">{project.assignmentCount || 0} assigned</Badge>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4 p-5">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Client</p>
                              <p className="mt-1 text-sm font-medium">{project.clientName || 'Not set'}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Principal Contractor</p>
                              <p className="mt-1 text-sm font-medium">{project.principalContractor || 'Not set'}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Dates</p>
                              <p className="mt-1 text-sm font-medium">
                                {project.startDate || 'Open'}{project.endDate ? ` to ${project.endDate}` : ''}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Permit Path</p>
                              <p className="mt-1 text-sm font-medium">
                                {project.permitRequired
                                  ? 'Permit'
                                  : project.notificationRequired
                                    ? 'Notification'
                                    : 'Project assessment pending'}
                              </p>
                            </div>
                          </div>

                          <div className="flex justify-end">
                            <Button asChild className="h-9 gap-2 px-4 text-[10px] font-black uppercase tracking-widest">
                              <Link href={`/safety/safety-files/${project.id}`}>
                                Open Project
                                <ArrowRight className="h-3.5 w-3.5" />
                              </Link>
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border-2 border-dashed bg-background px-6 py-20 text-center">
                    <FolderKanban className="mx-auto mb-4 h-12 w-12 opacity-25" />
                    <p className="text-lg font-semibold text-foreground">No safety file projects yet.</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Create a project first, then upload the project file contents and assign the personnel who will work on that site.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
