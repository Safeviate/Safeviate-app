'use client';

import { useForm, useFieldArray, useFormContext } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';
import { AiExamGenerator } from './ai-exam-generator';
import { 
    Info, 
    BookOpen, 
    Target, 
    MessageSquare, 
    PlusCircle, 
    Trash2, 
    CheckCircle2,
    ChevronDown,
    ListTodo
} from 'lucide-react';

const optionSchema = z.object({
  id: z.string(),
  text: z.string().min(1, 'Option text is required'),
});

const questionSchema = z.object({
  id: z.string(),
  text: z.string().min(1, 'Question text is required'),
  options: z.array(optionSchema).min(2, 'At least 2 options are required'),
  correctOptionId: z.string().min(1, 'Select the correct option'),
});

const examFormSchema = z.object({
  title: z.string().min(1, 'Exam title is required'),
  subject: z.string().min(1, 'Subject is required'),
  description: z.string().optional(),
  passingScore: z.coerce.number().min(0).max(100),
  questions: z.array(questionSchema).min(1, 'At least one question is required'),
});

export type ExamFormValues = z.infer<typeof examFormSchema>;

interface ExamFormProps {
  initialValues?: Partial<ExamFormValues>;
  onSubmit: (values: ExamFormValues) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function ExamForm({ initialValues, onSubmit, onCancel, isSubmitting }: ExamFormProps) {
  const form = useForm<ExamFormValues>({
    resolver: zodResolver(examFormSchema),
    defaultValues: {
      title: initialValues?.title || '',
      subject: initialValues?.subject || '',
      description: initialValues?.description || '',
      passingScore: initialValues?.passingScore || 75,
      questions: initialValues?.questions || [
        {
          id: uuidv4(),
          text: '',
          options: [
            { id: uuidv4(), text: '' },
            { id: uuidv4(), text: '' },
          ],
          correctOptionId: '',
        },
      ],
    },
  });

  const { fields: questionFields, append: appendQuestion, remove: removeQuestion } = useFieldArray({
    control: form.control,
    name: 'questions',
  });

  const handleGeneratedQuestions = (questions: ExamFormValues['questions']) => {
      // Filter out initial empty question if present
      const currentQuestions = form.getValues('questions');
      const filteredCurrent = currentQuestions.filter(q => q.text.trim() !== '' || q.options.some(o => o.text.trim() !== ''));
      form.setValue('questions', [...filteredCurrent, ...questions], { shouldValidate: true });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="h-full flex flex-col overflow-hidden">
        <ScrollArea className="flex-1">
          <div className="space-y-8 p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-2">
                        <BookOpen className="h-3.5 w-3.5" />
                        Axiom Assessment Title
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., PPL Air Law & Operational Procedures" {...field} className="h-12 font-bold bg-muted/5 border-2 border-slate-200 focus-visible:ring-primary/20 rounded-xl" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="subject"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-2">
                        <Target className="h-3.5 w-3.5" />
                        Subject Category
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Theoretical Knowledge" {...field} className="h-12 font-bold bg-muted/5 border-2 border-slate-200 focus-visible:ring-primary/20 rounded-xl" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="passingScore"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Minimum Mastery (%)
                    </FormLabel>
                    <FormControl>
                      <Input type="number" {...field} className="h-12 font-mono font-black text-lg bg-muted/5 border-2 border-slate-200 focus-visible:ring-primary/20 rounded-xl" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-2">
                        <MessageSquare className="h-3.5 w-3.5" />
                        Evaluation Briefing
                    </FormLabel>
                    <FormControl>
                      <Textarea placeholder="Optional details about the exam format or scope..." {...field} className="min-h-[100px] font-medium p-4 bg-muted/5 border-2 border-slate-200 focus-visible:ring-primary/20 rounded-xl" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Separator />

            <div className="space-y-6">
              <div className="flex flex-col gap-4 bg-muted/5 p-4 rounded-2xl border-2 border-dashed sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h3 className="text-sm font-black uppercase tracking-tight flex items-center gap-2">
                        <ListTodo className="h-4 w-4 text-primary" />
                        Assessment Items ({questionFields.length})
                    </h3>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground opacity-70">Construct or generate the evaluation pool.</p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <AiExamGenerator onGenerated={handleGeneratedQuestions} />
                    <Button
                        type="button"
                        variant="default"
                        size="sm"
                        className="h-10 w-full px-6 text-[10px] font-black uppercase tracking-widest shadow-lg rounded-xl sm:w-auto"
                        onClick={() =>
                            appendQuestion({
                            id: uuidv4(),
                            text: '',
                            options: [
                                { id: uuidv4(), text: '' },
                                { id: uuidv4(), text: '' },
                            ],
                            correctOptionId: '',
                            })
                        }
                    >
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Add Question
                    </Button>
                </div>
              </div>

              {questionFields.map((question, qIndex) => (
                <QuestionItem
                  key={question.id}
                  questionIndex={qIndex}
                  onRemove={() => removeQuestion(qIndex)}
                />
              ))}
            </div>
          </div>
        </ScrollArea>

        <div className="shrink-0 flex flex-col gap-3 p-6 border-t bg-muted/5 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
            {isSubmitting ? 'Saving...' : 'Save Exam Template'}
          </Button>
        </div>
      </form>
    </Form>
  );
}

function QuestionItem({ questionIndex, onRemove }: { questionIndex: number; onRemove: () => void }) {
  const { control, watch, setValue } = useFormContext<ExamFormValues>();
  const { fields: optionFields, append: appendOption, remove: removeOption } = useFieldArray({
    control,
    name: `questions.${questionIndex}.options`,
  });

  const correctOptionId = watch(`questions.${questionIndex}.correctOptionId`);

  return (
    <Card className="bg-background border-2 border-slate-200 shadow-sm rounded-2xl overflow-hidden group hover:border-primary/30 transition-all duration-300">
      <CardHeader className="flex flex-col gap-4 bg-muted/5 px-6 py-5 group-hover:bg-primary/5 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <Badge variant="outline" className="h-8 w-8 rounded-full p-0 flex items-center justify-center shrink-0 border-2 border-primary text-primary font-black text-sm shadow-sm bg-background">
            {questionIndex + 1}
          </Badge>
          <FormField
            control={control}
            name={`questions.${questionIndex}.text`}
            render={({ field }) => (
              <FormItem className="flex-1 space-y-0">
                <FormControl>
                  <Input placeholder="Enter question text..." {...field} className="text-base font-black uppercase tracking-tight border-none bg-transparent shadow-none focus-visible:ring-0 px-0 h-auto placeholder:text-muted-foreground/30" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={onRemove} className="self-start text-destructive h-9 w-9 rounded-full hover:bg-destructive/10 transition-colors sm:self-auto">
          <Trash2 className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-6 p-6 pt-2">
        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest flex items-center gap-2">
                Options (Select Correct)
                {correctOptionId && <Badge variant="outline" className="h-4 text-[8px] bg-green-50 text-green-700 border-green-200 uppercase">Correct Marked</Badge>}
            </Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => appendOption({ id: uuidv4(), text: '' })}
              className="h-8 w-full text-[10px] uppercase font-bold sm:w-auto"
            >
              <PlusCircle className="mr-1 h-3 w-3" /> Add Option
            </Button>
          </div>

          <RadioGroup
            value={correctOptionId}
            onValueChange={(val) => setValue(`questions.${questionIndex}.correctOptionId`, val)}
            className="grid grid-cols-1 gap-4 md:grid-cols-2"
          >
            {optionFields.map((option, oIndex) => (
              <div key={option.id} className="flex items-center gap-3 group/opt">
                <RadioGroupItem value={option.id} id={`q${questionIndex}-o${oIndex}`} className="shrink-0 h-5 w-5 border-2 border-slate-300 data-[state=checked]:border-primary data-[state=checked]:text-primary" />
                <div className="flex-1 relative">
                    <FormField
                    control={control}
                    name={`questions.${questionIndex}.options.${oIndex}.text`}
                    render={({ field }) => (
                        <FormItem className="space-y-0">
                        <FormControl>
                            <Input
                            placeholder={`Option ${oIndex + 1}`}
                            {...field}
                            className={cn(
                                "h-11 text-sm font-bold bg-background transition-all pr-10 border-2 rounded-xl",
                                correctOptionId === option.id 
                                    ? "border-green-500 bg-green-50/50 shadow-[0_0_0_1px_rgba(34,197,94,0.5)]" 
                                    : "border-slate-200 hover:border-slate-300"
                            )}
                            />
                        </FormControl>
                        </FormItem>
                    )}
                    />
                    {correctOptionId === option.id && (
                        <CheckCircle2 className="h-5 w-5 text-green-600 absolute right-3 top-1/2 -translate-y-1/2 animate-in zoom-in duration-300" />
                    )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeOption(oIndex)}
                  disabled={optionFields.length <= 2}
                  className="h-10 w-10 self-start text-muted-foreground opacity-100 transition-opacity rounded-full hover:text-destructive hover:bg-destructive/5 sm:opacity-0 sm:group-hover/opt:opacity-100"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </RadioGroup>
          <FormField
            control={control}
            name={`questions.${questionIndex}.correctOptionId`}
            render={() => <FormMessage />}
          />
        </div>
      </CardContent>
    </Card>
  );
}
