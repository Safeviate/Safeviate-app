'use client';

import { useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { Alert } from '@/types/alert';
import { format } from 'date-fns';
import { Archive, Printer, Users } from 'lucide-react';
import Image from 'next/image';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

interface AlertCardProps {
    alert: Alert;
    canManage: boolean;
    canDelete: boolean;
    onArchive: (alertId: string) => void;
    showReadReceipts?: boolean;
}

export function AlertCard({ alert, canManage, canDelete, onArchive, showReadReceipts = true }: AlertCardProps) {
    const { toast } = useToast();
    const cardRef = useRef<HTMLDivElement>(null);

    const getCardClass = () => {
        switch (alert.type) {
            case 'Red Tag': return 'border-red-500 bg-red-50';
            case 'Yellow Tag': return 'border-yellow-500 bg-yellow-50';
            default: return '';
        }
    }

    const handleArchive = () => {
        onArchive(alert.id);
        toast({ title: 'Alert Archived', description: `"${alert.title}" has been archived.` });
    };

    const handlePrint = () => {
        if (!cardRef.current) return;

        const printWindow = window.open('', '_blank', 'height=600,width=800');

        if (printWindow) {
            printWindow.document.write('<html><head><title>Print Alert</title>');

            const styles = document.querySelectorAll('style, link[rel="stylesheet"]');
            styles.forEach(style => {
                printWindow.document.head.appendChild(style.cloneNode(true));
            });
            
            printWindow.document.head.innerHTML += '<style>@media print { .no-print { display: none !important; } body { padding: 1rem; } }</style>';

            printWindow.document.write('</head><body>');
            printWindow.document.write(cardRef.current.outerHTML);
            printWindow.document.write('</body></html>');

            setTimeout(() => {
                printWindow.document.close();
                printWindow.print();
                printWindow.close();
            }, 500);
        }
    };


    return (
        <Card className={cn(getCardClass())} ref={cardRef}>
            <CardHeader className="py-4">
                <CardTitle className="text-sm font-black uppercase tracking-tight">{alert.title}</CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
                <p className="text-sm font-medium leading-relaxed">&quot;{alert.content}&quot;</p>
                 {alert.signatureUrl && (
                    <div className="mt-4 pt-4 border-t border-dashed">
                        <p className="text-[10px] font-black uppercase text-muted-foreground mb-2">Authenticated Signature:</p>
                        <Image
                            src={alert.signatureUrl}
                            alt="Signature"
                            width={160}
                            height={80}
                            className="bg-white border rounded-md p-1 shadow-sm"
                        />
                    </div>
                )}
            </CardContent>
            <CardFooter className="flex flex-col items-start gap-4 text-xs">
                <div className="flex justify-between items-center w-full border-t pt-4">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase">Posted on {format(new Date(alert.createdAt), 'dd MMM yyyy')}</span>
                    <div className="flex items-center gap-1.5 no-print">
                        <Button variant="outline" size="compact" onClick={handlePrint} className="border-slate-300">
                            <Printer className="h-3.5 w-3.5" /> Print
                        </Button>
                        {canDelete && (
                            <Button variant="outline" size="compact" onClick={handleArchive} className="border-slate-300 text-red-600 hover:text-red-700">
                                <Archive className="h-3.5 w-3.5" /> Archive
                            </Button>
                        )}
                    </div>
                </div>
                 {showReadReceipts && (
                    <Accordion type="single" collapsible className="w-full no-print">
                        <AccordionItem value="item-1" className="border-none">
                            <AccordionTrigger className="py-2 hover:no-underline">
                                <div className="flex items-center gap-2 text-[10px] font-black uppercase text-muted-foreground tracking-widest opacity-60">
                                    <Users className="h-3.5 w-3.5" />
                                    <span>Read by {alert.readBy?.length || 0} users</span>
                                </div>
                            </AccordionTrigger>
                            <AccordionContent>
                                {alert.readBy && alert.readBy.length > 0 ? (
                                    <div className="max-h-32 overflow-y-auto text-[10px] font-medium space-y-2 border rounded-lg p-3 bg-muted/5">
                                        {alert.readBy.map(receipt => (
                                            <div key={receipt.userId} className="flex justify-between">
                                                <span className="font-bold">{receipt.userName}</span>
                                                <span className="text-muted-foreground">{format(new Date(receipt.readAt), 'dd MMM yy HH:mm')}</span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-[10px] font-bold text-muted-foreground italic text-center py-2 uppercase opacity-40">No acknowledgements yet.</p>
                                )}
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>
                )}
            </CardFooter>
        </Card>
    )
}
