'use client';

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  HEADER_ACTION_BUTTON_CLASS,
  HEADER_MOBILE_ACTION_BUTTON_CLASS,
  HEADER_TAB_LIST_CLASS,
  HEADER_TAB_TRIGGER_CLASS,
  MainPageHeader,
} from "@/components/page-header";
import { Search, PlusCircle, Pencil, Trash2, ClipboardCheck, PlayCircle, ShieldCheck, Microscope, Database, MoreHorizontal, ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { usePermissions } from '@/hooks/use-permissions';
import { useToast } from '@/hooks/use-toast';
import type { ExamTemplate, ExamResult, QuestionBankItem } from '@/types/training';
import { format } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TakeExamDialog } from './take-exam-dialog';
import type { Personnel, PilotProfile } from '../../users/personnel/page';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import Link from 'next/link';
import type { ExamTopicsSettings } from '../../admin/exam-topics/page';
import { useIsMobile } from '@/hooks/use-mobile';
import { useUserProfile } from '@/hooks/use-user-profile';
import { useTenantConfig } from '@/hooks/use-tenant-config';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { DeleteActionButton } from '@/components/record-action-buttons';
import { cn } from '@/lib/utils';
import { ResponsiveCardGrid } from '@/components/responsive-card-grid';
import { Skeleton } from '@/components/ui/skeleton';

export default function ExamsPage() {
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const { tenantId } = useUserProfile();
  const { tenant } = useTenantConfig();
  const isMobile = useIsMobile();

  const isAviation = tenant?.industry?.startsWith('Aviation') ?? true;

  const [searchQuery, setSearchQuery] = useState('');
  const [takingExam, setTakingExam] = useState<{ template: ExamTemplate; isMock: boolean } | null>(null);

  const [selectedTopic, setSelectedTopic] = useState<string>('');
  const [questionCount, setQuestionCount] = useState<string>('10');
  const [activeTab, setActiveTab] = useState('internal');

  const canManage = hasPermission('training-exams-manage');

  const [templates, setTemplates] = useState<ExamTemplate[]>([]);
  const [results, setResults] = useState<ExamResult[]>([]);
  const [poolItems, setPoolItems] = useState<QuestionBankItem[]>([]);
  const [topicsData, setTopicsData] = useState<ExamTopicsSettings | null>(null);
  const [allPeople, setAllPeople] = useState<(Personnel | PilotProfile)[]>([]);

  const [isLoadingTemplates, setIsLoadingTemplates] = useState(true);
  const [isLoadingResults, setIsLoadingResults] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      try {
        const [examsResponse, summaryResponse] = await Promise.all([
          fetch('/api/exams', { cache: 'no-store' }),
          fetch('/api/dashboard-summary', { cache: 'no-store' }),
        ]);

        const [examsPayload, summaryPayload] = await Promise.all([
          examsResponse.json().catch(() => ({})),
          summaryResponse.json().catch(() => ({})),
        ]);

        if (!cancelled) {
          setTemplates(Array.isArray(examsPayload?.templates) ? examsPayload.templates : []);
          setResults(Array.isArray(examsPayload?.results) ? examsPayload.results : []);
          setPoolItems(Array.isArray(examsPayload?.poolItems) ? examsPayload.poolItems : []);
          setTopicsData(Array.isArray(examsPayload?.topics) ? { id: 'exam-topics', topics: examsPayload.topics } : null);
          const personnel = Array.isArray(summaryPayload?.personnel) ? summaryPayload.personnel : [];
          const instructors = Array.isArray(summaryPayload?.instructors) ? summaryPayload.instructors : [];
          const students = Array.isArray(summaryPayload?.students) ? summaryPayload.students : [];
          setAllPeople([...personnel, ...instructors, ...students]);
        }
      } catch (e) {
        console.error('Failed to load exam data', e);
      } finally {
        if (!cancelled) {
          setIsLoadingTemplates(false);
          setIsLoadingResults(false);
        }
      }
    };

    void loadData();
    const handleUpdate = () => {
        void loadData();
    };

    window.addEventListener('safeviate-exams-updated', handleUpdate);
    return () => {
      cancelled = true;
      window.removeEventListener('safeviate-exams-updated', handleUpdate);
    };
  }, []);

  useEffect(() => {
    if (topicsData?.topics?.length && !selectedTopic) {
        setSelectedTopic(topicsData.topics[0]);
    }
  }, [topicsData, selectedTopic]);

  const filteredTemplates = useMemo(() => {
    if (!templates) return [];
    return templates.filter(t => 
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.subject.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [templates, searchQuery]);

  const handleDelete = async (id: string) => {
    try {
      const nextTemplates = templates.filter(t => t.id !== id);
      await fetch('/api/exams', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templates: nextTemplates,
          results,
          topics: topicsData?.topics || [],
          poolItems,
        }),
      });
      setTemplates(nextTemplates);
      toast({ title: 'Exam Deleted' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Delete Failed', description: error.message });
    }
  };

  const handleStartTopicExam = () => {
    if (!selectedTopic) {
        toast({ variant: 'destructive', title: 'Selection Required', description: `Please select a ${isAviation ? 'aviation topic' : 'safety category'}.` });
        return;
    }

    const availableQuestions = poolItems?.filter(item => item.topic === selectedTopic) || [];
    if (availableQuestions.length === 0) {
        toast({ variant: 'destructive', title: 'Empty Topic', description: 'No questions found for this topic in the database.' });
        return;
    }

    const shuffled = [...availableQuestions].sort(() => 0.5 - Math.random());
    const count = Math.min(Number(questionCount), shuffled.length);
    const selectedQuestions = shuffled.slice(0, count);

    const transientTemplate: ExamTemplate = {
        id: `transient-${Date.now()}`,
        title: `Random Practice: ${selectedTopic}`,
        subject: selectedTopic,
        description: `Dynamically generated practice run from the question bank.`,
        passingScore: 75,
        questions: selectedQuestions,
        createdAt: new Date().toISOString()
    };

    setTakingExam({ template: transientTemplate, isMock: true });
  };

  const examTabs = [
    { value: 'internal', label: 'Internal Exams', icon: ShieldCheck },
    { value: 'mock', label: 'Mock Exams', icon: Microscope },
  ];

  return (
    <div className="lg:max-w-[1100px] mx-auto w-full flex flex-col gap-6 h-full overflow-hidden px-1 pt-4">
      <Card className="flex-1 flex flex-col shadow-none border overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <MainPageHeader 
            title={isAviation ? "Examinations" : "Knowledge Assessments"}
            actions={
              isMobile ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className={HEADER_MOBILE_ACTION_BUTTON_CLASS}
                    >
                      <span className="flex items-center gap-2">
                        <MoreHorizontal className="h-3.5 w-3.5" />
                        Actions
                      </span>
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[var(--radix-dropdown-menu-trigger-width)]">
                    <DropdownMenuItem onClick={() => setActiveTab('internal')}>
                      <ShieldCheck className="mr-2 h-4 w-4" /> View Internal
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setActiveTab('mock')}>
                      <Microscope className="mr-2 h-4 w-4" /> View Mocks
                    </DropdownMenuItem>
                    {canManage && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem asChild>
                          <Link href="/training/exams/new">
                            <PlusCircle className="mr-2 h-4 w-4" /> Create Template
                          </Link>
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <>
                  <TabsList className={HEADER_TAB_LIST_CLASS}>
                    <TabsTrigger 
                      value="internal" 
                      className={HEADER_TAB_TRIGGER_CLASS}
                    >
                      <ShieldCheck className="h-4 w-4" /> 
                      {isAviation ? 'Internal Exams' : 'Internal Assessments'}
                    </TabsTrigger>
                    <TabsTrigger 
                      value="mock" 
                      className={HEADER_TAB_TRIGGER_CLASS}
                    >
                      <Microscope className="h-4 w-4" /> 
                      Mock Exams
                    </TabsTrigger>
                  </TabsList>
                  {canManage && (
                    <Button asChild size="sm" className={HEADER_ACTION_BUTTON_CLASS}>
                      <Link href="/training/exams/new">
                        <PlusCircle className="h-5 w-5" /> New Template
                      </Link>
                    </Button>
                  )}
                </>
              )
            }
          />

          <TabsContent value="internal" className="flex-1 min-h-0 overflow-hidden m-0">
            <ScrollArea className="h-full">
              <div className="flex flex-col gap-8 p-4 pb-16 sm:gap-10 sm:p-6 sm:pb-20">
                
                <section className="space-y-4">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                      <h2 className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-2 border-b border-primary/20 pb-1 w-fit">
                        <ClipboardCheck className="h-3.5 w-3.5" />
                        Available {isAviation ? 'Exam' : 'Assessment'} Templates
                      </h2>
                      <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-foreground/75">Conduct a certified assessment. Results are permanently recorded.</p>
                    </div>
                    <div className="relative w-full sm:w-80 group">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
                      <Input 
                        placeholder="Search templates..." 
                        className="pl-11 h-11 text-xs bg-muted/5 border-2 focus-visible:ring-primary/20 rounded-xl font-bold transition-all shadow-inner" 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="rounded-xl border overflow-hidden bg-card">
                    <ResponsiveCardGrid
                      items={filteredTemplates}
                      isLoading={isLoadingTemplates}
                      loadingCount={3}
                      className="p-3"
                      gridClassName="sm:grid-cols-2 xl:grid-cols-3"
                      renderItem={(template) => (
                        <Card key={template.id} className="rounded-lg border bg-background p-3 shadow-sm">
                          <div className="space-y-1">
                            <p className="text-sm font-bold leading-tight">{template.title}</p>
                            <p className="text-xs text-muted-foreground">{template.subject}</p>
                          </div>
                          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <Badge variant="outline" className="text-[10px] font-black text-primary uppercase">
                              PASS {template.passingScore}%
                            </Badge>
                            <div className="flex items-center gap-1 sm:justify-end">
                              <Button
                                variant="default"
                                size="compact"
                                className="w-full sm:w-auto"
                                onClick={() => setTakingExam({ template, isMock: false })}
                              >
                                <PlayCircle className="mr-1.5 h-3.5 w-3.5" />
                                Start
                              </Button>
                              {canManage && (
                                <>
                                  <Button asChild variant="ghost" size="icon" className="h-8 w-8">
                                    <Link href={`/training/exams/${template.id}/edit`}>
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Link>
                                  </Button>
                                  <DeleteActionButton
                                    description={`This will permanently delete the template "${template.title}".`}
                                    onDelete={() => handleDelete(template.id)}
                                    srLabel="Delete template"
                                  />
                                </>
                              )}
                            </div>
                          </div>
                        </Card>
                      )}
                      renderLoadingItem={(index) => <Skeleton key={index} className="h-24 w-full rounded-lg" />}
                      emptyState={(
                        <div className="text-center py-12 bg-muted/5">
                          <p className="text-sm font-bold uppercase tracking-widest text-foreground/70">No templates available.</p>
                        </div>
                      )}
                    />
                  </div>
                </section>

                <Separator />

                <section className="space-y-4">
                  <div className="space-y-4">
                    <h2 className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-2 border-b border-primary/20 pb-1 w-fit">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Assessment Registry
                    </h2>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/75">Authenticated results and digital certifications for official assessment runs.</p>
                  </div>

                  <div className="rounded-xl border overflow-hidden">
                    {isLoadingResults ? (
                      <div className="p-8 space-y-4">
                        {[1, 2, 3].map(i => <div key={i} className="h-10 w-full bg-muted animate-pulse rounded-md" />)}
                      </div>
                    ) : results?.filter(r => !r.isMock).length ? (
                      <>
                        <div className="grid gap-3 p-3 sm:hidden">
                          {results.filter(r => !r.isMock).map(res => (
                            <div key={res.id} className="rounded-lg border bg-background p-3 shadow-sm">
                              <div className="flex items-start justify-between gap-3">
                                <div className="space-y-1">
                                  <p className="text-sm font-bold leading-tight">{res.templateTitle}</p>
                                  <p className="text-xs text-muted-foreground">{res.studentName}</p>
                                  <p className="text-[10px] font-mono text-muted-foreground">{format(new Date(res.date), 'dd MMM yy HH:mm')}</p>
                                </div>
                                <Badge variant={res.passed ? "default" : "destructive"} className="h-5 text-[9px] font-black uppercase">
                                  {res.passed ? 'PASSED' : 'FAILED'}
                                </Badge>
                              </div>
                              <div className="mt-3 flex items-center justify-between">
                                <span className="text-[10px] font-black uppercase text-muted-foreground">Score</span>
                                <span className="text-sm font-black">{res.score}%</span>
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="hidden overflow-x-auto sm:block bg-background">
                          <Table>
                            <TableHeader className="bg-muted/30 border-b-2">
                              <TableRow>
                                <TableHead className="text-[10px] uppercase font-black tracking-widest px-8 h-14">Completed Date</TableHead>
                                <TableHead className="text-[10px] uppercase font-black tracking-widest h-14">Personnel</TableHead>
                                <TableHead className="text-[10px] uppercase font-black tracking-widest h-14">Assessment Title</TableHead>
                                <TableHead className="text-center text-[10px] uppercase font-black tracking-widest h-14">Final Score</TableHead>
                                <TableHead className="text-center text-[10px] uppercase font-black tracking-widest pr-8 h-14">Verification Status</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {results.filter(r => !r.isMock).map(res => (
                                <TableRow key={res.id} className="hover:bg-muted/10 transition-all">
                                  <TableCell className="px-8 py-5 text-[10px] font-mono font-black text-muted-foreground uppercase">{format(new Date(res.date), 'dd MMM yyyy • HH:mm')}</TableCell>
                                  <TableCell className="py-5 text-sm font-black text-foreground uppercase tracking-tight">{res.studentName}</TableCell>
                                  <TableCell className="py-5 text-sm font-medium text-foreground max-w-[240px] truncate">{res.templateTitle}</TableCell>
                                  <TableCell className="text-center py-5">
                                    <span className={cn("font-mono font-black text-lg", res.passed ? "text-green-600" : "text-red-600")}>{res.score}</span>
                                    <span className="text-[10px] font-black opacity-40 ml-0.5">%</span>
                                  </TableCell>
                                  <TableCell className="text-center pr-8 py-5">
                                    <Badge 
                                        variant={res.passed ? "default" : "destructive"} 
                                        className={cn(
                                            "h-9 px-6 text-[10px] font-black uppercase tracking-widest shadow-sm border-2",
                                            res.passed ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"
                                        )}
                                    >
                                      {res.passed ? 'CERTIFIED PASS' : 'ASSESSMENT FAILED'}
                                    </Badge>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </>
                    ) : (
                      <div className="text-center py-12 bg-muted/5">
                        <p className="text-sm font-bold uppercase tracking-widest text-foreground/70">No records found.</p>
                      </div>
                    )}
                  </div>
                </section>
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="mock" className="flex-1 min-h-0 overflow-hidden m-0">
            <ScrollArea className="h-full">
                <div className="p-4 space-y-8 sm:p-6 pb-20">
                    <div className="mx-auto w-full max-w-2xl space-y-6 rounded-2xl border bg-card p-5 shadow-sm sm:p-8">
                        <div className="space-y-2 text-center">
                            <h2 className="text-lg font-black uppercase tracking-tight text-primary">Dynamic Practice Run</h2>
                            <p className="text-xs text-muted-foreground italic">Select a topic to generate a randomized mock assessment from the database.</p>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{isAviation ? 'Aviation Topic' : 'Safety Category'}</Label>
                                <Select onValueChange={setSelectedTopic} value={selectedTopic}>
                                    <SelectTrigger className="h-12 font-bold">
                                        <Database className="h-4 w-4 mr-2 text-primary" />
                                        <SelectValue placeholder="Select Category..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {(topicsData?.topics || []).map(t => <SelectItem key={t} value={t} className="font-medium">{t}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Quantity</Label>
                                <Select onValueChange={setQuestionCount} value={questionCount}>
                                    <SelectTrigger className="h-12 font-bold">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="5" className="font-medium">5 Questions</SelectItem>
                                        <SelectItem value="10" className="font-medium">10 Questions</SelectItem>
                                        <SelectItem value="20" className="font-medium">20 Questions</SelectItem>
                                        <SelectItem value="50" className="font-medium">50 Questions</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <Button 
                            onClick={handleStartTopicExam} 
                            disabled={!selectedTopic}
                            className="w-full h-14 text-lg font-black shadow-lg gap-3 uppercase tracking-tighter"
                        >
                            <PlayCircle className="h-6 w-6" /> START RANDOMIZED MOCK
                        </Button>
                    </div>

                    <Separator />

                    <div className="space-y-4">
                        <h2 className="text-[11px] font-black uppercase tracking-widest text-foreground/75 flex items-center gap-2">
                            <ClipboardCheck className="h-4 w-4" />
                            Fixed {isAviation ? 'Exam' : 'Assessment'} Templates (Practice)
                        </h2>
                        <div className="rounded-xl border overflow-hidden bg-card">
                          <ResponsiveCardGrid
                            items={templates || []}
                            isLoading={isLoadingTemplates}
                            loadingCount={3}
                            className="p-3"
                            gridClassName="sm:grid-cols-2 xl:grid-cols-3"
                            renderItem={(template) => (
                              <Card key={template.id} className="rounded-lg border bg-background p-3 shadow-sm">
                                <div className="space-y-1">
                                  <p className="text-sm font-bold leading-tight">{template.title}</p>
                                  <p className="text-xs text-muted-foreground">{template.subject}</p>
                                </div>
                                <Button
                                  variant="outline"
                                  size="compact"
                                  className="mt-3 w-full bg-primary/5 hover:bg-primary/10 border-primary/20"
                                  onClick={() => setTakingExam({ template, isMock: true })}
                                >
                                  <PlayCircle className="h-3.5 w-3.5" /> Start Practice Run
                                </Button>
                              </Card>
                            )}
                            renderLoadingItem={(index) => <Skeleton key={index} className="h-24 w-full rounded-lg" />}
                            emptyState={(
                              <div className="py-8 text-center bg-muted/5 italic uppercase font-bold tracking-widest text-[10px] text-muted-foreground">
                                No fixed templates available for practice.
                              </div>
                            )}
                          />
                        </div>
                    </div>
                </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </Card>

      {takingExam && (
          <TakeExamDialog
            template={takingExam.template}
            isOpen={!!takingExam}
            onOpenChange={(open) => !open && setTakingExam(null)}
            personnel={allPeople}
            tenantId={tenantId || ''}
            isMockOnly={takingExam.isMock}
          />
      )}
    </div>
  );
}
