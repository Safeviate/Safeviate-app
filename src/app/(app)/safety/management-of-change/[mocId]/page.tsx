'use client';

import { use, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Printer, PlusCircle, ShieldCheck, WandSparkles, ChevronDown, MoreHorizontal, FileText } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import Link from 'next/link';
import { format } from 'date-fns';
import type { ManagementOfChange } from '@/types/moc';
import { ImplementationForm, type ImplementationFormHandle } from './implementation-form';
import { ApprovalForm } from './approval-form';
import type { Personnel } from '@/app/(app)/users/personnel/page';
import { useIsMobile } from '@/hooks/use-mobile';
import { useUserProfile } from '@/hooks/use-user-profile';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';

const parseLocalDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) {
    return new Date(value);
  }
  return new Date(year, month - 1, day, 12);
};

interface MocDetailPageProps {
  params: Promise<{ mocId: string }>;
}

const DetailItem = ({ label, value }: { label: string; value?: string | null }) => (
    <div className="space-y-0.5">
        <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest leading-none">{label}</p>
        <p className="text-sm font-bold text-foreground leading-tight">{value || 'N/A'}</p>
    </div>
);

export default function MocDetailPage({ params }: MocDetailPageProps) {
  const resolvedParams = use(params);
  const isMobile = useIsMobile();
  const mocId = resolvedParams.mocId;
  const [activeTab, setActiveTab] = useState('implementation');
  const implementationFormRef = useRef<ImplementationFormHandle>(null);
  const [moc, setMoc] = useState<ManagementOfChange | null>(null);
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const { tenantId } = useUserProfile();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      try {
        const [mocResponse, personnelResponse] = await Promise.all([
          fetch(`/api/management-of-change?mocId=${encodeURIComponent(mocId)}`, { cache: 'no-store' }),
          fetch('/api/personnel', { cache: 'no-store' }),
        ]);

        const mocPayload = await mocResponse.json();
        const personnelPayload = await personnelResponse.json();

        if (!cancelled) {
          setMoc(mocPayload?.moc ?? null);
          setPersonnel(personnelPayload?.personnel ?? []);
          setDepartments(personnelPayload?.departments ?? []);
          setError(mocPayload?.error ? new Error(mocPayload.error) : null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error('Failed to load MOC.'));
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [mocId]);

  const personnelMap = useMemo(() => {
    if (!personnel) return new Map();
    return new Map(personnel.map(p => [p.id, `${p.firstName} ${p.lastName}`]));
  }, [personnel]);
  
  const departmentMap = useMemo(() => {
    if (!departments) return new Map();
    return new Map(departments.map(d => [d.id, d.name]));
  }, [departments]);

  const handlePrint = () => {
    window.print();
  };

  const confirmLeaveWithUnsavedChanges = () => {
    if (activeTab !== 'implementation') return true;
    if (!implementationFormRef.current?.hasUnsavedChanges()) return true;
    return window.confirm('You have unsaved implementation changes. Leave this section without saving?');
  };

  if (isLoading) {
    return (
<div className="max-w-[1100px] mx-auto w-full space-y-6 pt-4 px-1 h-full">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="flex-1 w-full" />
      </div>
    );
  }

  if (error || !moc) {
    return (
<div className="max-w-[1100px] mx-auto w-full text-center py-20 px-1">
        <p className="text-muted-foreground">{error ? `Error: ${error.message}` : 'MOC not found.'}</p>
          <Button asChild variant="link" className="mt-4">
            <Link
              href="/safety/management-of-change"
              onClick={(event) => {
                if (!confirmLeaveWithUnsavedChanges()) {
                  event.preventDefault();
                }
              }}
            >
              Return to list
            </Link>
          </Button>
      </div>
    );
  }

  return (
<div className="max-w-[1100px] mx-auto w-full flex flex-col min-h-screen overflow-y-auto pt-4 px-1">
      <Tabs
        value={activeTab}
        onValueChange={(nextTab) => {
          if (nextTab === activeTab || confirmLeaveWithUnsavedChanges()) {
            setActiveTab(nextTab);
          }
        }}
        className="flex flex-1 min-h-0 flex-col"
      >
        
        {/* --- STICKY HEADER SECTION --- */}
        <div className="sticky top-0 z-30 bg-card rounded-xl border overflow-hidden flex flex-col shadow-none mb-6 no-print shrink-0">
            <CardHeader className="bg-muted/5 border-b flex flex-col lg:flex-row lg:items-center justify-between gap-3 px-4 py-3 md:px-5 md:py-3 shrink-0">
                <div className="flex-1 min-w-0">
                    <CardTitle className="flex items-center gap-2 truncate text-xl font-black uppercase md:text-2xl">
                        {moc.mocNumber}: {moc.title}
                    </CardTitle>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                        <DetailItem label="Status" value={moc.status} />
                        <Separator orientation="vertical" className="hidden h-6 md:block" />
                        <DetailItem label="Department" value={departmentMap.get(moc.proposingDepartmentId)} />
                        <Separator orientation="vertical" className="hidden h-6 md:block" />
                        <DetailItem label="Responsible" value={personnelMap.get(moc.responsiblePersonId)} />
                        <Separator orientation="vertical" className="hidden h-6 md:block" />
                        <DetailItem label="Proposed" value={format(parseLocalDate(moc.proposalDate), 'dd MMM yyyy')} />
                    </div>
                </div>
            </CardHeader>

                    <div className="border-b bg-muted/5 px-4 py-2 shrink-0 md:px-5">
                <div className="flex flex-col gap-3">
                    {/* UNIFIED MOBILE TACTICAL DROPDOWN */}
                    {isMobile ? (
                        <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="default"
                                    className="h-8 w-full justify-between px-3 text-[10px]"
                                >
                                    <div className="flex items-center gap-2">
                                        <MoreHorizontal className="h-3.5 w-3.5" />
                                        <span>Tactical Actions & Navigation</span>
                                    </div>
                                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-[var(--radix-dropdown-menu-trigger-width)]">
                                <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-2 py-1.5">View Section</DropdownMenuLabel>
                                <DropdownMenuItem onClick={() => setActiveTab('implementation')}>
                                    <FileText className="mr-2 h-4 w-4" />
                                    Implementation & Strategy
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setActiveTab('approval')}>
                                    <ShieldCheck className="mr-2 h-4 w-4" />
                                    Approval & Sign-off
                                </DropdownMenuItem>
                                
                                <DropdownMenuSeparator />
                                <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-2 py-1.5">Tactical Controls</DropdownMenuLabel>
                                
                                {activeTab === 'implementation' && (
                                    <>
                                        <DropdownMenuItem onClick={() => implementationFormRef.current?.analyze()}>
                                            <WandSparkles className="mr-2 h-4 w-4 text-primary" />
                                            AI Analyze Strategy
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => implementationFormRef.current?.addPhase()}>
                                            <PlusCircle className="mr-2 h-4 w-4 text-emerald-600" />
                                            Add New Phase
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => implementationFormRef.current?.submit()} className="font-bold text-emerald-700">
                                            <ShieldCheck className="mr-2 h-4 w-4" />
                                            Save Strategy
                                        </DropdownMenuItem>
                                    </>
                                )}
                                <DropdownMenuItem onClick={handlePrint}>
                                    <Printer className="mr-2 h-4 w-4" />
                                    Print Document
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    ) : (
                        <div className="flex flex-row items-center justify-between gap-3">
                            <TabsList className="bg-transparent h-auto p-0 gap-1.5 border-b-0 justify-start overflow-x-auto no-scrollbar flex items-center shrink-0">
                                <TabsTrigger value="implementation" className="h-8 rounded-md px-3 text-[9px] font-black uppercase tracking-[0.08em] border data-[state=active]:bg-button-primary data-[state=active]:text-button-primary-foreground transition-all shrink-0">
                                    Implementation & Strategy
                                </TabsTrigger>
                                <TabsTrigger value="approval" className="h-8 rounded-md px-3 text-[9px] font-black uppercase tracking-[0.08em] border data-[state=active]:bg-button-primary data-[state=active]:text-button-primary-foreground transition-all shrink-0">
                                    Approval & Sign-off
                                </TabsTrigger>
                            </TabsList>

                            <div className="flex items-center gap-2 shrink-0">
                                {activeTab === 'implementation' && (
                                    <>
                                        <Button 
                                            type="button" 
                                            variant="outline" 
                                            size="default" 
                                            onClick={() => implementationFormRef.current?.analyze()} 
                                            className="h-8 gap-1.5 px-3 text-[9px] font-black uppercase tracking-[0.16em]"
                                        >
                                            <WandSparkles className="h-3.5 w-3.5 text-primary" />
                                            AI Analyze
                                        </Button>
                                        <Button 
                                            type="button" 
                                            variant="outline" 
                                            size="default" 
                                            onClick={() => implementationFormRef.current?.addPhase()} 
                                            className="h-8 gap-1.5 px-3 text-[9px] font-black uppercase tracking-[0.16em]"
                                        >
                                            <PlusCircle className="h-3.5 w-3.5 text-emerald-600" />
                                            Add Phase
                                        </Button>
                                        <Button 
                                            type="button" 
                                            size="default" 
                                            onClick={() => implementationFormRef.current?.submit()} 
                                            className="h-8 gap-1.5 rounded-md bg-primary px-3 text-[9px] font-black uppercase tracking-[0.16em] text-primary-foreground shadow-md transition-transform hover:scale-[1.02] active:scale-[0.98]"
                                        >
                                            <ShieldCheck className="h-3.5 w-3.5" />
                                            Save Strategy
                                        </Button>
                                    </>
                                )}
                                <Button onClick={handlePrint} variant="outline" size="default" className="h-8 gap-1.5 px-3 text-[9px] font-black uppercase tracking-[0.16em]">
                                    <Printer className="h-4 w-4" />
                                    Print
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>

        {/* --- SCROLLABLE CONTENT --- */}
        <div className="flex-1 min-h-0 no-print">
            <TabsContent value="implementation" className="m-0 outline-none flex min-h-0 flex-col">
                <ImplementationForm
                    ref={implementationFormRef}
                    key={moc.id}
                    moc={moc}
                    tenantId={tenantId || 'safeviate'}
                    personnel={personnel || []}
                />
            </TabsContent>
            
            <TabsContent value="approval" className="m-0 outline-none flex min-h-0 flex-col">
                <ApprovalForm moc={moc} personnel={personnel || []} />
            </TabsContent>
        </div>
      </Tabs>

      {/* --- Dedicated Print Layout (Hidden in UI) --- */}
      <div className="hidden print:block space-y-8 max-w-[1100px] mx-auto w-full">
        <div className="border-b pb-4 mb-6">
          <h1 className="text-3xl font-bold font-headline uppercase">Management of Change Proposal</h1>
          <p className="text-muted-foreground text-xs font-black uppercase tracking-widest">Document ID: {moc.mocNumber}</p>
        </div>
        <div className="grid grid-cols-1 gap-8">
            <DetailItem label="Title" value={moc.title} />
            <DetailItem label="Description" value={moc.description} />
            <DetailItem label="Reason" value={moc.reason} />
            <DetailItem label="Scope" value={moc.scope} />
            <div className="flex gap-12">
              <DetailItem label="Department" value={departmentMap.get(moc.proposingDepartmentId)} />
              <DetailItem label="Responsible" value={personnelMap.get(moc.responsiblePersonId)} />
            </div>
        </div>
        <Separator className="my-10" />
        <ImplementationForm moc={moc} tenantId={tenantId || 'safeviate'} personnel={personnel || []} />
        <ApprovalForm moc={moc} personnel={personnel || []} />
      </div>
    </div>
  );
}
