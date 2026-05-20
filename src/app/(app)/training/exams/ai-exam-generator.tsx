'use client';

import { useState, useCallback, ChangeEvent } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, ClipboardPaste, Wand2, FileText, Image as ImageIcon, Type, Sparkles } from 'lucide-react';
import { callAiFlow } from '@/lib/ai-client';
import { extractClipboardText } from '@/lib/clipboard';
import type { GenerateExamOutput } from '@/ai/flows/generate-exam-flow';
import type { ExamTemplate } from '@/types/training';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface AiExamGeneratorProps {
  onGenerated: (questions: ExamTemplate['questions']) => void;
  trigger?: React.ReactNode;
}

export function AiExamGenerator({ onGenerated, trigger }: AiExamGeneratorProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [file, setFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState('');
  const [pastedImage, setPastedImage] = useState<string | null>(null);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      setFile(event.target.files[0]);
    }
  };

  const handlePaste = useCallback(async (event: React.ClipboardEvent) => {
    const items = event.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const blob = items[i].getAsFile();
        if (blob) {
          const reader = new FileReader();
          reader.onload = (e) => {
            setPastedImage(e.target?.result as string);
            toast({ title: 'Image Pasted', description: 'The image has been loaded.' });
          };
          reader.readAsDataURL(blob);
        }
        return;
      }
    }

    const clipboardText = extractClipboardText(event.clipboardData);
    if (clipboardText) {
      event.preventDefault();
      setPastedText(clipboardText);
      toast({ title: 'Text Pasted', description: 'The text has been loaded.' });
    }
  }, [toast]);

  const processAndSave = async (input: { text?: string; image?: string }) => {
    setIsProcessing(true);
    try {
      const { questions } = await callAiFlow<
        { document: { text?: string; image?: string } },
        GenerateExamOutput
      >('generateExam', { document: input });

      if (!questions || questions.length === 0) {
        toast({ variant: 'destructive', title: 'No Questions Found', description: 'The AI could not identify any questions in the document.' });
        return;
      }

      onGenerated(questions);
      toast({ title: 'Exam Generated', description: `Successfully parsed ${questions.length} questions.` });
      setIsOpen(false);

    } catch (error: any) {
      console.error('Error processing document:', error);
      toast({ variant: 'destructive', title: 'Processing Failed', description: error.message || 'An unknown error occurred.' });
    } finally {
      setIsProcessing(false);
      setFile(null);
      setPastedText('');
      setPastedImage(null);
    }
  };

  const handleProcess = async () => {
    if (file) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const text = e.target?.result as string;
        await processAndSave({ text });
      };
      reader.readAsText(file);
    } else if (pastedText) {
      await processAndSave({ text: pastedText });
    } else if (pastedImage) {
      await processAndSave({ image: pastedImage });
    }
  };

  const canProcess = file || pastedText.trim() || pastedImage;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" className="gap-2 h-10 px-5 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all hover:scale-[1.02] shadow-sm"><Wand2 className="h-4 w-4" /> Synthesize with AI</Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl rounded-3xl border-0 shadow-2xl p-0 overflow-hidden">
        <DialogHeader className="p-8 pb-4 bg-muted/5">
          <div className="flex items-center gap-3 mb-2">
            <Badge variant="outline" className="text-[10px] font-black uppercase tracking-widest text-primary border-primary/30 bg-primary/5 px-3 h-6">
                <Sparkles className="h-3 w-3 mr-2" />
                Intelligence Engine
            </Badge>
          </div>
          <DialogTitle className="text-2xl font-black uppercase tracking-tighter">AI Assessment Forge</DialogTitle>
          <DialogDescription className="text-xs font-bold uppercase tracking-widest text-muted-foreground opacity-70">
            Ingest source materials to synthesize high-fidelity evaluation items.
          </DialogDescription>
        </DialogHeader>

        <div className="px-8 pb-8 space-y-6">
          <Tabs defaultValue="text" className="w-full">
            <TabsList className="grid w-full grid-cols-3 h-12 bg-muted/10 p-1 rounded-xl">
                <TabsTrigger value="text" className="data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg text-[10px] font-black uppercase tracking-widest gap-2">
                    <Type className="h-3.5 w-3.5" />
                    Text
                </TabsTrigger>
                <TabsTrigger value="file" className="data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg text-[10px] font-black uppercase tracking-widest gap-2">
                    <FileText className="h-3.5 w-3.5" />
                    File
                </TabsTrigger>
                <TabsTrigger value="image" className="data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg text-[10px] font-black uppercase tracking-widest gap-2">
                    <ImageIcon className="h-3.5 w-3.5" />
                    Vision
                </TabsTrigger>
            </TabsList>

            <TabsContent value="text" className="pt-6">
                <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-primary/70 text-left block">Raw Source Material</Label>
                    <Textarea
                    placeholder="Paste briefing text or legacy questionnaire here..."
                    className="h-48 font-medium p-5 rounded-2xl border-2 bg-muted/5 focus-visible:ring-primary/20"
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    onPaste={handlePaste}
                    />
                </div>
            </TabsContent>

            <TabsContent value="file" className="pt-6">
              <div className="space-y-4 text-left">
                <Label htmlFor="reg-file" className="text-[10px] font-black uppercase tracking-widest text-primary/70 text-left block">Document Ingestion</Label>
                <div className="h-32 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center bg-muted/5 group hover:border-primary/50 transition-colors relative">
                  <Input id="reg-file" type="file" onChange={handleFileChange} className="absolute inset-0 opacity-0 cursor-pointer" />
                  <FileText className="h-8 w-8 text-muted-foreground group-hover:text-primary transition-colors text-center" />
                  <p className="text-[10px] font-black uppercase tracking-widest mt-2 text-center">{file ? file.name : 'Select PDF or TXT'}</p>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="image" className="pt-6">
              <div
                onPaste={handlePaste}
                className="h-48 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center text-muted-foreground bg-muted/5 group hover:border-primary/50 transition-colors overflow-hidden"
              >
                {pastedImage ? (
                  <img src={pastedImage} alt="Pasted source" className="max-h-full max-w-full object-contain p-4 animate-in zoom-in" />
                ) : (
                  <div className="text-center group-hover:text-primary transition-colors">
                    <ClipboardPaste className="mx-auto h-10 w-10 mb-2 opacity-50" />
                    <p className="text-[10px] font-black uppercase tracking-widest">Axiom Vision Ingestion</p>
                    <p className="text-[9px] font-bold opacity-30 mt-1">Focus and Paste (Ctrl+V)</p>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter className="p-8 pt-0 bg-background">
          <DialogClose asChild><Button variant="outline" disabled={isProcessing} className="h-12 px-6 rounded-xl border-2 text-[10px] font-black uppercase tracking-widest">Abort</Button></DialogClose>
          <Button onClick={handleProcess} disabled={isProcessing || !canProcess} className="h-12 px-10 rounded-xl shadow-xl text-[10px] font-black uppercase tracking-widest gap-2">
            {isProcessing ? <><Loader2 className="h-4 w-4 animate-spin" /> Synthesizing...</> : <><Sparkles className="h-4 w-4" /> Finalize Synthesis</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
