'use client';

import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
    CheckCircle2, 
    XCircle, 
    GraduationCap, 
    PlayCircle,
    Trophy,
    ShieldAlert
} from 'lucide-react';
import { format } from 'date-fns';
import { useToast as useSafeToast } from '@/hooks/use-toast';
import { useUserProfile } from '@/hooks/use-user-profile';
import type { ExamTemplate, ExamResult } from '@/types/training';
import type { Personnel, PilotProfile } from '@/app/(app)/users/personnel/page';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface TakeExamDialogProps {
  template: ExamTemplate;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  personnel: (Personnel | PilotProfile)[];
  tenantId: string;
  isMockOnly?: boolean;
}

type ExamState = 'setup' | 'taking' | 'finished';

export function TakeExamDialog({ template, isOpen, onOpenChange, personnel, tenantId, isMockOnly = false }: TakeExamDialogProps) {
  const { userProfile } = useUserProfile();
  const { toast } = useSafeToast();

  const [state, setState] = useState<ExamState>('setup');
  const [selectedStudentId, setSelectedStudentId] = useState<string>(userProfile?.id || '');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ExamResult | null>(null);

  const students = useMemo(() => 
    personnel.filter(p => p.userType === 'Student' || p.userType === 'Private Pilot'),
    [personnel]
  );

  const resetExam = () => {
    setState('setup');
    setAnswers({});
    setResult(null);
    setSelectedStudentId(userProfile?.id || '');
  };

  const handleStart = () => {
    if (!selectedStudentId && !isMockOnly) {
        toast({ variant: 'destructive', title: 'Selection Required', description: 'Please select a student for official record keeping.' });
        return;
    }
    setState('taking');
  };

  const handleSubmit = async () => {
    const totalQuestions = template.questions.length;
    let correctCount = 0;

    template.questions.forEach((q) => {
      if (answers[q.id] === q.correctOptionId) {
        correctCount++;
      }
    });

    const score = Math.round((correctCount / totalQuestions) * 100);
    const passed = score >= template.passingScore;
    const selectedStudent = personnel.find(p => p.id === selectedStudentId);

    const examResult: ExamResult = {
      id: '', // Will be set by LocalStorage
      templateId: template.id,
      templateTitle: template.title,
      studentId: selectedStudentId,
      studentName: selectedStudent ? `${selectedStudent.firstName} ${selectedStudent.lastName}` : 'Anonymous',
      date: new Date().toISOString(),
      score,
      passingScore: template.passingScore,
      passed,
      isMock: isMockOnly,
    };

    if (!isMockOnly) {
      try {
        const finalResult = { ...examResult, id: crypto.randomUUID() };
        const response = await fetch('/api/exams', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ result: finalResult }),
        });

        if (!response.ok) {
          throw new Error('Failed to save exam result');
        }
        
        toast({ 
          title: 'Official Result Recorded', 
          description: 'This result has been added to the student training file.' 
        });
        setResult(finalResult);
      } catch (e) {
        console.error('Failed to save exam result', e);
        setResult(examResult);
      }
    } else {
      toast({ title: 'Practice Run Complete' });
      setResult(examResult);
    }

    setState('finished');
  };

  const progress = (Object.keys(answers).length / template.questions.length) * 100;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) resetExam(); onOpenChange(open); }}>
      <DialogContent className="max-w-4xl max-h-[95vh] flex flex-col p-0 overflow-hidden rounded-3xl border-0 shadow-2xl">
        <DialogHeader className="border-b bg-muted/5 p-5 shrink-0 sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-4 text-left">
              <Badge variant="outline" className="text-[10px] font-black uppercase tracking-widest text-primary border-primary/30 bg-primary/5 px-4 h-7">
                <GraduationCap className="h-3.5 w-3.5 mr-2" />
                Axiom Assessment Center
              </Badge>
              <div>
                <DialogTitle className="text-2xl font-black uppercase tracking-tighter leading-none sm:text-3xl">
                  {template.title}
                </DialogTitle>
                <DialogDescription className="mt-2 text-[11px] font-bold uppercase tracking-widest text-foreground/75">
                    {template.subject} • Target Proficiency: <span className="text-primary font-black">{template.passingScore}%</span>
                </DialogDescription>
              </div>
            </div>
            {state === 'taking' && (
                <div className="w-full min-w-0 rounded-2xl border-2 bg-background p-4 text-right shadow-sm sm:w-auto sm:min-w-[120px] sm:p-5">
                    <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest mb-1">Item Index</p>
                    <div className="flex items-baseline justify-end gap-1">
                        <span className="text-3xl font-mono font-black text-primary">{Object.keys(answers).length}</span>
                        <span className="text-sm font-black opacity-30">/ {template.questions.length}</span>
                    </div>
                </div>
            )}
          </div>
          {state === 'taking' && <Progress value={progress} className="mt-6 h-2.5 overflow-hidden rounded-full border-2 bg-muted sm:mt-8" />}
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-hidden bg-background">
          {state === 'setup' && (
            <div className="mx-auto max-w-lg space-y-8 p-5 sm:p-12">
              <div className="space-y-6 text-left">
                {isMockOnly ? (
                    <div className="p-6 border-2 border-dashed rounded-2xl bg-amber-50/30 border-amber-200 flex items-start gap-4 text-left">
                        <ShieldAlert className="h-6 w-6 text-amber-600 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                            <p className="font-black text-sm uppercase tracking-tight text-amber-900">Practice Mode Engagement</p>
                            <p className="text-[11px] font-bold uppercase tracking-widest text-amber-800">Performance data will be verified locally but no persistent training record will be generated.</p>
                        </div>
                    </div>
                ) : (
                  <div className="space-y-3 pt-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground text-left block">Authorized Student Personnel</Label>
                    <Select onValueChange={setSelectedStudentId} value={selectedStudentId}>
                      <SelectTrigger className="h-14 font-black uppercase tracking-tight text-sm border-2 rounded-xl focus:ring-primary/20 bg-muted/5">
                        <SelectValue placeholder="Select student..." />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        {students.map(s => (
                          <SelectItem key={s.id} value={s.id} className="font-bold uppercase text-xs">{s.firstName} {s.lastName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <div className="p-6 rounded-2xl bg-muted/20 border-2 border-slate-100 text-center">
                <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground leading-relaxed">
                  This evaluation contains <span className="font-black text-foreground">{template.questions.length} discrete items</span>. 
                  Once initiated, the session {isMockOnly ? 'will remain transient' : 'will be recorded as an official certificate'}.
                </p>
              </div>

              <Button onClick={handleStart} className="w-full h-14 gap-3 rounded-2xl text-lg font-black uppercase tracking-tighter shadow-2xl transition-transform hover:scale-[1.02] active:scale-[0.98] sm:h-16 sm:text-xl" size="lg">
                <PlayCircle className="h-6 w-6" /> {isMockOnly ? 'Start Practice Run' : 'Initiate Official Cert'}
              </Button>
            </div>
          )}

          {state === 'taking' && (
            <ScrollArea type="always" className="h-full">
              <div className="space-y-12 p-5 pb-28 sm:space-y-16 sm:p-10 sm:pr-12 sm:pb-32">
                {template.questions.map((q, idx) => (
                  <div key={q.id} className="space-y-8 group/q text-left">
                    <div className="flex items-start gap-4 sm:gap-8">
                      <Badge variant="outline" className="h-12 w-12 rounded-2xl p-0 flex items-center justify-center shrink-0 border-2 border-primary text-primary font-black text-xl shadow-md bg-background">
                        {idx + 1}
                      </Badge>
                      <p className="flex-1 text-xl font-black uppercase tracking-tight text-foreground/90 transition-colors leading-tight group-hover/q:text-primary sm:text-2xl">{q.text}</p>
                    </div>
                    <RadioGroup 
                      value={answers[q.id]} 
                      onValueChange={(val) => setAnswers(prev => ({ ...prev, [q.id]: val }))}
                      className="grid grid-cols-1 gap-4 pl-0 sm:pl-[5rem] md:grid-cols-2"
                    >
                      {q.options.map(opt => (
                        <div 
                          key={opt.id} 
                          className={cn(
                            "flex items-start gap-4 rounded-3xl border-2 p-4 transition-all cursor-pointer shadow-sm relative overflow-hidden group/opt sm:items-center sm:space-x-5 sm:p-6",
                            answers[q.id] === opt.id 
                                ? "bg-primary/5 border-primary shadow-xl ring-2 ring-primary/10 scale-[1.01]" 
                                : "bg-background border-slate-100 hover:border-primary/30 hover:bg-muted/30"
                          )} 
                          onClick={() => setAnswers(prev => ({ ...prev, [q.id]: opt.id }))}
                        >
                          <RadioGroupItem value={opt.id} id={opt.id} className="mt-0.5 h-6 w-6 border-2 border-slate-300 data-[state=checked]:border-primary sm:mt-0" />
                          <Label htmlFor={opt.id} className="text-sm font-black uppercase tracking-tight cursor-pointer flex-1 leading-snug text-left">{opt.text}</Label>
                          {answers[q.id] === opt.id && (
                              <div className="absolute right-6 top-1/2 -translate-y-1/2">
                                  <CheckCircle2 className="h-6 w-6 text-primary animate-in zoom-in" />
                              </div>
                          )}
                        </div>
                      ))}
                    </RadioGroup>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}

          {state === 'finished' && result && (
            <div className="flex flex-col items-center justify-center space-y-8 p-6 text-center animate-in fade-in slide-in-from-bottom-8 duration-700 sm:p-14 sm:space-y-10">
              <div className={cn(
                "h-32 w-32 rounded-[2.5rem] flex items-center justify-center shadow-2xl animate-in zoom-in duration-700 rotate-6",
                result.passed ? "bg-green-100 text-green-600 border-4 border-green-200" : "bg-red-100 text-red-600 border-4 border-red-200"
              )}>
                {result.passed ? <Trophy className="h-16 w-16" /> : <XCircle className="h-16 w-16" />}
              </div>
              
              <div className="space-y-4">
                <h3 className="text-5xl font-black uppercase tracking-tighter">{result.passed ? 'Assessment Certified' : 'Review Required'}</h3>
                <div className="flex flex-col items-center gap-1">
                    <p className="text-[11px] font-black uppercase tracking-widest text-foreground/80">Verified Attainment Level</p>
                    <p className={cn("text-8xl font-black font-mono tracking-tighter", result.passed ? 'text-green-600' : 'text-red-700')}>
                        {result.score}<span className="text-3xl ml-1">%</span>
                    </p>
                </div>
                <Badge variant="outline" className="text-[11px] font-black uppercase tracking-widest border-2 py-1.5 px-6 rounded-full shadow-sm">
                    Certification Floor: {result.passingScore}%
                </Badge>
              </div>

              <div className="grid w-full max-w-lg grid-cols-1 gap-4 rounded-[2rem] border-2 border-slate-100 bg-muted/5 p-6 shadow-inner sm:grid-cols-2 sm:gap-8 sm:p-8">
                <div className="space-y-1 text-left">
                    <p className="text-[10px] font-black uppercase tracking-widest text-foreground/75">Authorized Candidate</p>
                    <p className="font-black text-base uppercase truncate leading-none">{result.studentName}</p>
                </div>
                <div className="space-y-1 text-right">
                    <p className="text-[10px] font-black uppercase tracking-widest text-foreground/75">Record Type</p>
                    <Badge variant={result.isMock ? "secondary" : "default"} className="h-7 px-4 py-0 text-[10px] font-black uppercase tracking-widest rounded-lg text-foreground">
                        {result.isMock ? 'Practice Mock' : 'Official Cert'}
                    </Badge>
                </div>
                <div className="space-y-1 border-t border-slate-200/50 pt-4 text-left sm:col-span-2 sm:pt-6">
                    <p className="text-[10px] font-black uppercase tracking-widest text-foreground/75">Validation Timestamp</p>
                    <p className="font-mono text-xs font-black text-foreground/80 uppercase">{format(new Date(result.date), 'dd MMMM yyyy • HH:mm:ss')}</p>
                </div>
              </div>

              {result.isMock && (
                <div className="p-5 bg-amber-50 border-2 border-amber-100 rounded-2xl flex items-center gap-4 text-[10px] text-amber-800 font-black uppercase tracking-widest max-w-md shadow-sm">
                    <ShieldAlert className="h-6 w-6 shrink-0" />
                    <span>Transitory Assessment Session. Data will be purged upon termination of this dialog.</span>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 gap-4 border-t bg-muted/5 p-5 sm:p-8">
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:gap-4">
            {state === 'taking' ? (
                <Button 
                    onClick={handleSubmit} 
                    disabled={Object.keys(answers).length < template.questions.length}
                    className="w-full h-14 text-base font-black uppercase tracking-widest shadow-xl rounded-2xl sm:text-lg"
                >
                Submit Full Examination
                </Button>
            ) : state === 'finished' ? (
                <Button onClick={() => onOpenChange(false)} className="w-full h-14 text-base font-black uppercase tracking-widest shadow-xl rounded-2xl sm:text-lg">Return to Overview</Button>
            ) : (
                <DialogClose asChild><Button variant="outline" className="h-14 w-full px-8 text-xs font-black uppercase tracking-widest rounded-2xl border-2 sm:flex-1">Abort Session</Button></DialogClose>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
