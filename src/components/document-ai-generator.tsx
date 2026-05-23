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
import { Loader2, ClipboardPaste, Wand2 } from 'lucide-react';
import { callAiFlow } from '@/lib/ai-client';
import { extractClipboardText } from '@/lib/clipboard';
import type { GenerateChecklistOutput } from '@/ai/flows/generate-checklist-flow';
import type { ChecklistSection } from '@/types/quality';

type DocumentAiGeneratorLabels = {
  triggerLabel: string;
  dialogTitle: string;
  dialogDescription: string;
  textPlaceholder: string;
  fileLabel: string;
  imageAlt: string;
  noImageLabel: string;
  emptyTitle: string;
  emptyDescription: string;
  generateButtonLabel: string;
  processingLabel: string;
};

interface DocumentAiGeneratorProps {
  onGenerated: (sections: ChecklistSection[]) => void;
  labels: DocumentAiGeneratorLabels;
}

export function DocumentAiGenerator({ onGenerated, labels }: DocumentAiGeneratorProps) {
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
      const { sections } = await callAiFlow<
        { document: { text?: string; image?: string } },
        GenerateChecklistOutput
      >('generateChecklist', { document: input });

      if (!sections || sections.length === 0) {
        toast({ variant: 'destructive', title: labels.emptyTitle, description: labels.emptyDescription });
        return;
      }

      onGenerated(sections);
    } catch (error: any) {
      console.error('Error processing document:', error);
      toast({ variant: 'destructive', title: 'Processing Failed', description: error.message || 'An unknown error occurred.' });
    } finally {
      setIsProcessing(false);
      setFile(null);
      setPastedText('');
      setPastedImage(null);
      setIsOpen(false);
    }
  };

  const handleProcess = async () => {
    if (file) {
      const isImageFile = file.type.startsWith('image/');
      const reader = new FileReader();
      reader.onload = async (e) => {
        const result = e.target?.result;
        if (isImageFile && typeof result === 'string') {
          await processAndSave({ image: result });
          return;
        }

        if (typeof result === 'string') {
          await processAndSave({ text: result });
          return;
        }

        toast({
          variant: 'destructive',
          title: 'Unsupported File',
          description: 'Please upload an image or plain text file.',
        });
      };
      if (isImageFile) {
        reader.readAsDataURL(file);
      } else {
        reader.readAsText(file);
      }
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
        <Button variant="outline"><Wand2 className="mr-2 h-4 w-4" /> {labels.triggerLabel}</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{labels.dialogTitle}</DialogTitle>
          <DialogDescription>
            {labels.dialogDescription}
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="text">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="text">Paste Text</TabsTrigger>
            <TabsTrigger value="file">Upload File</TabsTrigger>
            <TabsTrigger value="image">Paste Image</TabsTrigger>
          </TabsList>
          <TabsContent value="text" className="pt-4">
            <Textarea
              placeholder={labels.textPlaceholder}
              className="h-48"
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              onPaste={handlePaste}
            />
          </TabsContent>
          <TabsContent value="file" className="pt-4">
            <div className="space-y-2">
              <Label htmlFor="reg-file">{labels.fileLabel}</Label>
              <Input id="reg-file" type="file" accept="image/*,.txt,.md,.csv,.rtf" onChange={handleFileChange} />
              {file && <p className="text-sm text-muted-foreground">Selected: {file.name}</p>}
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
                Image files are OCR-transcribed first. Text files are read directly.
              </p>
            </div>
          </TabsContent>
          <TabsContent value="image" className="pt-4">
            <div
              onPaste={handlePaste}
              className="h-48 border-2 border-dashed rounded-lg flex items-center justify-center text-muted-foreground"
            >
              {pastedImage ? (
                <img src={pastedImage} alt={labels.imageAlt} className="max-h-full max-w-full" />
              ) : (
                <div className="text-center">
                  <ClipboardPaste className="mx-auto h-8 w-8" />
                  <p className="text-foreground/90">{labels.noImageLabel}</p>
                </div>
              )}
            </div>
            <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
              Pasted images are OCR-transcribed before checklist extraction.
            </p>
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <DialogClose asChild><Button variant="outline" disabled={isProcessing}>Cancel</Button></DialogClose>
          <Button onClick={handleProcess} disabled={isProcessing || !canProcess}>
            {isProcessing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {labels.processingLabel}</> : labels.generateButtonLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
