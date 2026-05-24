'use client';

import { useDashboardData } from '@/hooks/use-dashboard-data';
import { MainPageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { format } from 'date-fns';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Eye, LayoutDashboard } from 'lucide-react';
import { useMemo, useState, useEffect } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { ResponsiveTabRow } from '@/components/responsive-tab-row';
import { cn } from '@/lib/utils';
import { TenantLayoutDisabledState } from '@/components/tenant-layout-disabled-state';
import { useTenantRouteAccess } from '@/hooks/use-tenant-route-access';
import { usePageLayout } from '@/hooks/use-page-layout';

const parseLocalDate = (value: string) => {
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) {
        return new Date(value);
    }
    return new Date(year, month - 1, day, 12);
};

export default function MyDashboardPage() {
    const { myTasks, myCapTaskSummary, myMessages, isLoading, userProfile, tenant } = useDashboardData();
    const { isLoading: isAccessLoading, isAllowed } = useTenantRouteAccess({ href: '/my-dashboard' });
    const { isSectionEnabled } = usePageLayout('my-dashboard');
    const isMobile = useIsMobile();
    const [activeTab, setActiveTab] = useState('tasks');
    
    const hiddenMenus = useMemo(() => new Set(userProfile?.accessOverrides?.hiddenMenus || []), [userProfile]);
    
    const isHidden = (href: string) => {
        if (hiddenMenus.has(href)) return true;
        if (tenant?.enabledMenus && !tenant.enabledMenus.includes(href)) return true;
        return false;
    };

    const availableTabs = useMemo(() => {
        return [
            { id: 'tasks', label: 'Tasks', href: '/my-dashboard/tasks' },
            { id: 'messages', label: 'Messages', href: '/my-dashboard/messages', showBadge: true },
            { id: 'logbook', label: 'My Logbook', href: '/my-dashboard/logbook' },
        ].filter(tab => !isHidden(tab.href) && isSectionEnabled(tab.id));
    }, [isSectionEnabled, userProfile, tenant]);

    useEffect(() => {
        if (availableTabs.length > 0 && !availableTabs.find(t => t.id === activeTab)) {
            setActiveTab(availableTabs[0].id);
        }
    }, [availableTabs, activeTab]);

    if (!isAccessLoading && !isAllowed) return <TenantLayoutDisabledState />;

    if (isLoading) return (
        <div className="max-w-[1100px] mx-auto w-full space-y-6">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-64 w-full" />
        </div>
    );

    if (availableTabs.length === 0) return (
        <div className="max-w-[1100px] mx-auto w-full text-center py-20">
            <p className="text-muted-foreground italic">No dashboard modules are currently enabled for your account.</p>
        </div>
    );

    return (
        <div className="max-w-[1100px] mx-auto w-full space-y-6 px-1">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex flex-col h-full overflow-hidden">
                <ResponsiveTabRow
                    value={activeTab}
                    onValueChange={setActiveTab}
                    placeholder="Select Module"
                    className="mb-6"
                    options={availableTabs.map((tab) => ({
                        value: tab.id,
                        label: tab.id === 'messages' && myMessages.length > 0 ? `${tab.label} (${myMessages.length})` : tab.label,
                        icon: LayoutDashboard,
                    }))}
                /> 

                <TabsContent value="tasks" className="mt-0">
                    <Card className="shadow-none border">
                        <MainPageHeader
                            title="My Outstanding Tasks"
                            description="A list of all tasks assigned to you across all modules."
                        />
                        <CardContent className="p-0 overflow-hidden">
                            {(myCapTaskSummary.overdue > 0 || myCapTaskSummary.dueSoon > 0) && (
                                <div className="border-b bg-amber-50/80 px-4 py-3">
                                    <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-background px-4 py-3 md:flex-row md:items-center md:justify-between">
                                        <div className="min-w-0">
                                            <p className="text-xs font-black uppercase tracking-tight text-amber-900">Corrective action attention required</p>
                                            <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-amber-800">
                                                {myCapTaskSummary.overdue > 0
                                                    ? `${myCapTaskSummary.overdue} overdue corrective action${myCapTaskSummary.overdue === 1 ? '' : 's'} need your attention.`
                                                    : `${myCapTaskSummary.dueSoon} corrective action${myCapTaskSummary.dueSoon === 1 ? '' : 's'} are due soon.`}
                                            </p>
                                        </div>
                                        <Button asChild variant="outline" size="sm" className="h-8 w-fit border-amber-300 text-[10px] font-black uppercase">
                                            <Link href="/my-dashboard/tasks">Review tasks</Link>
                                        </Button>
                                    </div>
                                </div>
                            )}
                            <div className="grid gap-3 border-b bg-muted/5 p-4 md:grid-cols-3">
                                <div className="rounded-xl border bg-background px-3 py-3">
                                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">CAP Tasks</p>
                                    <p className="mt-1 text-lg font-black">{myCapTaskSummary.total}</p>
                                </div>
                                <div className="rounded-xl border bg-background px-3 py-3">
                                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Due Soon</p>
                                    <p className="mt-1 text-lg font-black">{myCapTaskSummary.dueSoon}</p>
                                </div>
                                <div className="rounded-xl border bg-background px-3 py-3">
                                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Overdue</p>
                                    <p className="mt-1 text-lg font-black">{myCapTaskSummary.overdue}</p>
                                </div>
                            </div>
                            <Table>
                                <TableHeader className="[&_tr]:h-11">
                                    <TableRow>
                                        <TableHead className="w-[40%] text-[10px] uppercase font-bold tracking-wider">Task</TableHead>
                                        <TableHead className="text-[10px] uppercase font-bold tracking-wider">Source</TableHead>
                                        <TableHead className={cn("text-[10px] uppercase font-bold tracking-wider", isMobile && "hidden")}>Due Date</TableHead>
                                        <TableHead className="text-[10px] uppercase font-bold tracking-wider">Status</TableHead>
                                        <TableHead className="text-right text-[10px] uppercase font-bold tracking-wider">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {myTasks.length > 0 ? (
                                        myTasks.map(task => (
                                            <TableRow key={task.id} className="h-11">
                                                <TableCell className="font-medium text-xs">{task.description}</TableCell>
                                                <TableCell><Badge variant="outline" className="text-[9px] font-bold uppercase">{task.sourceIdentifier}</Badge></TableCell>
                                                <TableCell className={cn("text-xs whitespace-nowrap", isMobile && "hidden")}>{format(parseLocalDate(task.dueDate), 'dd MMM yy')}</TableCell>
                                                <TableCell><Badge variant="secondary" className="text-[9px] font-bold uppercase py-0">{task.status}</Badge></TableCell>
                                                <TableCell className="text-right">
                                                    <Button asChild variant="outline" size="sm" className="h-8 w-8 p-0 sm:w-auto sm:px-3 sm:gap-2 border-slate-300">
                                                        <Link href={task.link}>
                                                            <Eye className="h-4 w-4" />
                                                            <span className="hidden sm:inline">View</span>
                                                        </Link>
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow className="h-11">
                                            <TableCell colSpan={isMobile ? 4 : 5} className="h-11 py-0 text-center text-muted-foreground italic text-sm">
                                                You have no outstanding tasks.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="messages" className="mt-0">
                    <Card className="shadow-none border">
                        <CardHeader>
                            <CardTitle>Messages</CardTitle>
                            <CardDescription>Recent assignments and mentions directed to you.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {myMessages.length > 0 ? (
                                    myMessages.map(msg => (
                                        <div key={msg.id} className="flex flex-col gap-1 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                                            <div className="flex justify-between items-start">
                                                <span className="text-sm font-bold">{msg.from}</span>
                                                <span className="text-[10px] text-muted-foreground">{format(new Date(msg.timestamp), 'dd MMM yy p')}</span>
                                            </div>
                                            <p className="text-sm line-clamp-2 italic text-muted-foreground">&quot;{msg.content}&quot;</p>
                                            <div className="flex justify-between items-center mt-2">
                                                <Badge variant="outline" className="text-[9px] font-bold uppercase">{msg.source}</Badge>
                                                <Button asChild variant="link" size="sm" className="h-auto p-0 text-[10px] font-bold uppercase">
                                                    <Link href={msg.link}>View Discussion</Link>
                                                </Button>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-center py-10">
                                        <p className="text-muted-foreground">You have no new messages.</p>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="logbook" className="mt-0">
                    <Card className="shadow-none border">
                        <CardHeader>
                            <CardTitle>My Logbook</CardTitle>
                            <CardDescription>A dynamic view of your recent flight activities.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="text-center py-10">
                                <p className="text-muted-foreground mb-4">The logbook feature is currently disabled.</p>
                                <Button asChild className="text-[10px] font-bold uppercase bg-emerald-700 hover:bg-emerald-800 text-white">
                                    <Link href="/development/table-builder">Go to Table Builder</Link>
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
