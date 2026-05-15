'use client';

import { useRef, useState } from 'react';
import { SecureSignaturePad } from '@/components/secure-signature-pad';
import { useToast } from '@/hooks/use-toast';
import { useUserProfile } from '@/hooks/use-user-profile';
import { usePermissions } from '@/hooks/use-permissions';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck, PenTool, Link2, FileText, ImageIcon } from 'lucide-react';
import type { TaskCard } from '@/types/workpack';

interface TaskCardItemProps {
  workpackId: string;
  taskCard: TaskCard;
  canEditTaskCard?: boolean;
  canSignTaskCard?: boolean;
}

type TaskCardSignature = {
  id: string;
  taskCardId: string;
  signatureImage: string;
  signatoryUserId: string;
  role: 'MECHANIC' | 'INSPECTOR';
  timestamp: string;
  authMethod: 'PIN_VALIDATED';
};

type TaskCardAttachment = {
  id: string;
  url: string;
  name: string;
  type: 'PDF' | 'IMAGE';
};

export function TaskCardItem({ workpackId, taskCard, canEditTaskCard = true, canSignTaskCard = true }: TaskCardItemProps) {
  const { userProfile } = useUserProfile();
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const canEdit = canEditTaskCard || hasPermission('maintenance-workpacks-edit') || hasPermission('admin-view');
  const canSign = canSignTaskCard || hasPermission('maintenance-workpacks-sign') || hasPermission('admin-view');

  const [isSigning, setIsSigning] = useState(false);
  const [signMode, setSignMode] = useState<'MECHANIC' | 'INSPECTOR'>('MECHANIC');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isPendingInspection = taskCard.isCompleted && taskCard.requiresInspector && !taskCard.isInspected;
  const isFullyClosed = taskCard.isCompleted && (!taskCard.requiresInspector || taskCard.isInspected);

  const persistTaskCard = async (nextTaskCard: TaskCard) => {
    const res = await fetch(`/api/maintenance/task-cards/${nextTaskCard.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskCard: nextTaskCard }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || 'Failed to update task card.');
    window.dispatchEvent(new Event('safeviate-maintenance-task-cards-updated'));
  };

  const handleSignOff = async (signatureBase64: string) => {
    try {
      const newSignature: TaskCardSignature = {
        id: crypto.randomUUID(),
        taskCardId: taskCard.id,
        signatureImage: signatureBase64,
        signatoryUserId: userProfile?.id ?? 'unknown',
        role: signMode,
        timestamp: new Date().toISOString(),
        authMethod: 'PIN_VALIDATED',
      };
      const existingSignatures = (taskCard as { signatures?: TaskCardSignature[] }).signatures ?? [];
      const nextTaskCard: TaskCard & { signatures?: TaskCardSignature[] } = {
        ...taskCard,
        signatures: [...existingSignatures, newSignature],
      };
      if (signMode === 'MECHANIC') {
        nextTaskCard.isCompleted = true;
        nextTaskCard.completedAt = new Date().toISOString();
      } else {
        nextTaskCard.isInspected = true;
        nextTaskCard.inspectedAt = new Date().toISOString();
      }
      await persistTaskCard(nextTaskCard);
      toast({ title: 'Task Certified', description: `Your ${signMode.toLowerCase()} signature was secured.` });
      setIsSigning(false);
    } catch (e: unknown) {
      toast({ title: 'Sign-Off Failed', description: e instanceof Error ? e.message : 'Sign-off failed.', variant: 'destructive' });
    }
  };

  const handleAddAttachmentUrl = async () => {
    const url = attachmentUrl.trim();
    if (!url) {
      toast({ title: 'No URL Provided', description: 'Paste an evidence link first.', variant: 'destructive' });
      return;
    }

    try {
      const existingAttachments = (taskCard as { attachments?: TaskCardAttachment[] }).attachments ?? [];
      const nextTaskCard: TaskCard & { attachments?: TaskCardAttachment[] } = {
        ...taskCard,
        attachments: [
          ...existingAttachments,
          { id: Date.now().toString(), url, name: 'Evidence link', type: 'IMAGE' as const },
        ],
      };
      await persistTaskCard(nextTaskCard);
      toast({ title: 'Attachment Added', description: 'The evidence link was attached.' });
      setAttachmentUrl('');
    } catch (e: unknown) {
      toast({ title: 'Attachment Failed', description: e instanceof Error ? e.message : 'Attachment failed.', variant: 'destructive' });
    }
  };

  return (
    <Card className={`border-2 transition-all ${isFullyClosed ? 'border-primary/40 bg-primary/5' : isPendingInspection ? 'border-accent/50 bg-accent/5' : 'border-border shadow-sm'}`}>
      <CardHeader className="p-4 md:p-6 flex flex-col md:flex-row md:items-start justify-between gap-4 bg-muted/5">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <CardTitle className="font-mono text-primary font-black uppercase tracking-tight">{taskCard.taskNumber}</CardTitle>
            {isFullyClosed ? (
              <Badge className="bg-emerald-100 text-emerald-700 bg-emerald-100 hover:bg-emerald-100 border-none font-bold"><ShieldCheck className="h-3 w-3 mr-1" />Certified & Closed</Badge>
            ) : isPendingInspection ? (
              <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 border-none font-bold"><ShieldCheck className="h-3 w-3 mr-1" />Pending Inspection (RII)</Badge>
            ) : (
              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 font-bold">Open Task</Badge>
            )}
            {taskCard.requiresInspector && <Badge variant="outline" className="text-[10px] font-black uppercase tracking-widest text-red-600 border-red-200 bg-red-50">RII</Badge>}
          </div>
          <CardDescription className="text-slate-700 font-medium mt-2 whitespace-pre-wrap">{taskCard.taskDescription}</CardDescription>
          <div className="mt-4 flex flex-col md:flex-row gap-4">
            {taskCard.partsInstalled && taskCard.partsInstalled.length > 0 && (
              <div className="flex-1 space-y-2">
                <p className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">Parts Tracking</p>
                <div className="bg-slate-100/50 rounded-lg p-2 border">
                  {taskCard.partsInstalled.map((p, i) => (
                    <div key={i} className="text-[11px] font-mono flex justify-between border-b last:border-0 border-slate-200 py-1">
                      <span className="font-bold">{p.partNumber}</span>
                      <span className="text-muted-foreground">SN: {p.serialNumber}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {taskCard.toolsUsed && taskCard.toolsUsed.length > 0 && (
              <div className="flex-1 space-y-2">
                <p className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">Tools & Equipment</p>
                <div className="flex flex-wrap gap-1">
                  {taskCard.toolsUsed.map((t, i) => <Badge key={i} variant="secondary" className="text-[9px] font-mono bg-slate-200 text-slate-700 uppercase">{t}</Badge>)}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 shrink-0 w-full md:w-auto">
          {!taskCard.isCompleted && !isSigning && canSign && (
            <Button onClick={() => { setSignMode('MECHANIC'); setIsSigning(true); }} className="w-full text-xs font-black uppercase shadow-md gap-2"><PenTool className="h-4 w-4" /> Mechanic Sign-Off</Button>
          )}
          {isPendingInspection && !isSigning && canSign && (
            <Button onClick={() => { setSignMode('INSPECTOR'); setIsSigning(true); }} className="w-full bg-accent text-accent-foreground hover:bg-accent/90 text-xs font-black uppercase shadow-md gap-2"><ShieldCheck className="h-4 w-4" /> Inspector Sign-Off</Button>
          )}
        </div>
      </CardHeader>

      {taskCard.attachments && taskCard.attachments.length > 0 && (
        <CardContent className="px-4 md:px-6 py-4 bg-white border-t">
          <p className="text-[10px] uppercase font-bold text-muted-foreground mb-3">Evidence & Attachments</p>
          <div className="flex flex-wrap gap-3">
            {taskCard.attachments.map((att) => (
              <a key={att.id} href={att.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 border rounded p-2 text-xs font-medium hover:bg-muted transition-colors">
                {att.type === 'PDF' ? <FileText className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
                <span className="truncate max-w-[150px]">{att.name}</span>
              </a>
            ))}
          </div>
        </CardContent>
      )}

      {!isFullyClosed && !isSigning && (
        <CardFooter className="px-4 md:px-6 py-3 bg-muted/10 border-t flex justify-end">
          <div className="flex w-full gap-2">
            <Input value={attachmentUrl} onChange={(e) => setAttachmentUrl(e.target.value)} placeholder="Paste evidence URL" className="h-9 text-xs" disabled={!canEdit} />
            <Button variant="outline" size="sm" className="text-xs font-bold gap-2" onClick={handleAddAttachmentUrl} disabled={!canEdit}>
              <Link2 className="h-3 w-3" />
              Attach Link
            </Button>
          </div>
        </CardFooter>
      )}

      {isSigning && canSign && (
        <CardContent className="p-4 md:p-6 bg-muted/30 border-t">
          <div className="flex justify-end mb-4">
            <Button variant="ghost" size="sm" onClick={() => setIsSigning(false)}>Cancel Sign-Off</Button>
          </div>
          <SecureSignaturePad onSign={(sig) => handleSignOff(sig)} title={signMode === 'MECHANIC' ? 'Mechanic Certification' : 'Inspector RII Certification'} description={signMode === 'MECHANIC' ? 'Ensure the work defined in this task card was completed per regulatory standards.' : 'Verify the RII work was performed correctly and per the approved maintenance manual instructions.'} />
        </CardContent>
      )}
    </Card>
  );
}
