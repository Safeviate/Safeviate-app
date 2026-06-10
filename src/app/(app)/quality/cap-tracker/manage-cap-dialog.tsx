
'use client';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CapActionsForm } from './cap-actions-form';
import type { CorrectiveActionPlan } from '@/types/quality';
import type { Personnel } from '@/app/(app)/users/personnel/page';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { getPersonnelDisplayName } from '@/lib/personnel-label';

// Define the enriched type right here where it's used or import from a shared types file if needed elsewhere
export type EnrichedCorrectiveActionPlan = CorrectiveActionPlan & {
  auditNumber: string;
  findingDescription: string;
};

interface ManageCapDialogProps {
    isOpen: boolean;
    onClose: () => void;
    cap: EnrichedCorrectiveActionPlan;
    tenantId: string;
    personnel: Personnel[];
}

export function ManageCapDialog({ isOpen, onClose, cap, tenantId, personnel }: ManageCapDialogProps) {

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl">
                <DialogHeader>
                    <DialogTitle>Manage Corrective Action Plan</DialogTitle>
                    <DialogDescription>
                        For finding on Audit #{cap.auditNumber}: {cap.findingDescription}
                    </DialogDescription>
                    <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="space-y-0.5">
                                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-700">Corrective Action Owner</p>
                                <p className="text-sm font-semibold text-foreground">
                                    {getPersonnelDisplayName(personnel, cap.responsiblePersonId || '') || 'Unassigned'}
                                </p>
                            </div>
                            <Badge variant="outline" className="h-6 border-amber-300 bg-white px-2 text-[10px] font-black uppercase tracking-[0.08em] text-amber-700">
                                Audit #{cap.auditNumber}
                            </Badge>
                        </div>
                    </div>
                </DialogHeader>
                <ScrollArea className="max-h-[70vh] pr-4">
                    <div className="py-4">
                        <CapActionsForm 
                            cap={cap}
                            tenantId={tenantId}
                            personnel={personnel}
                            onFormSubmit={onClose}
                        />
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
}
