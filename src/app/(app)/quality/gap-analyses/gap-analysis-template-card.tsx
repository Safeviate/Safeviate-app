'use client';

import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Card, CardDescription, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Pencil, PlayCircle, Trash2, MoreHorizontal, ChevronsUpDown } from 'lucide-react';
import { StartGapAnalysisDialog } from './start-gap-analysis-dialog';
import { useToast } from '@/hooks/use-toast';
import type { QualityAuditChecklistTemplate } from '@/types/quality';
import type { Department } from '../../admin/department/page';
import type { Personnel } from '../../users/personnel/page';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { CARD_HEADER_BAND_CLASS, CARD_HEADER_ACTION_ZONE_CLASS } from '@/components/page-header';
import Link from 'next/link';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

interface GapAnalysisTemplateCardProps {
  category: string;
  templates: QualityAuditChecklistTemplate[];
  tenantId: string;
  departments: Department[];
  personnel: Personnel[];
}

export function GapAnalysisTemplateCard({
  category,
  templates,
  tenantId,
  departments,
  personnel,
}: GapAnalysisTemplateCardProps) {
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const handleDelete = async (templateId: string, templateTitle: string) => {
    try {
      const response = await fetch(
        `/api/quality-gap-analysis-templates?id=${encodeURIComponent(templateId)}`,
        { method: 'DELETE' }
      );
      if (!response.ok) throw new Error('Failed to delete template');
      window.dispatchEvent(new Event('safeviate-gap-analysis-templates-updated'));
      toast({ title: 'Template Deleted', description: `"${templateTitle}" has been removed.` });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    }
  };

  return (
    <AccordionItem value={category}>
      <AccordionTrigger className="text-xl font-semibold">{category}</AccordionTrigger>
      <AccordionContent className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {templates.map((template) => (
          <Card key={template.id} className="flex flex-col overflow-hidden border border-card-border shadow-none">
            <CardHeader className={cn(CARD_HEADER_BAND_CLASS, 'space-y-2')}>
              <div className="flex items-start justify-between gap-3">
                <CardTitle className="flex items-center gap-2 text-sm font-black tracking-tight">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{template.title}</span>
                </CardTitle>
                <div className={cn(CARD_HEADER_ACTION_ZONE_CLASS, 'gap-1')}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-full justify-between border-[hsl(var(--header-button-border))] bg-[hsl(var(--header-button-background))] px-3 text-[9px] font-black uppercase text-[hsl(var(--header-button-foreground))] shadow-none hover:bg-[hsl(var(--header-button-hover))]"
                      >
                        <span className="flex items-center gap-2">
                          <MoreHorizontal className="h-3.5 w-3.5" />
                          Actions
                        </span>
                        <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[var(--radix-dropdown-menu-trigger-width)]"
                    >
                      <DropdownMenuItem asChild className="cursor-pointer">
                        <Link href={`/quality/gap-analyses/template/${template.id}`}>
                          <Pencil className="mr-2 h-3.5 w-3.5" /> Edit Template
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="cursor-pointer text-red-600"
                        onClick={() => handleDelete(template.id, template.title)}
                      >
                        <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete Template
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
                                          <CardDescription className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                {template.sections.reduce((acc, section) => acc + section.items.length, 0)} items ·{' '}
                {template.sections.length} sections
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
              <div className="flex items-center gap-2 flex-wrap">
                <StartGapAnalysisDialog
                  template={template}
                  tenantId={tenantId}
                  personnel={personnel}
                  departments={departments}
                  quickStart
                  trigger={
                    <Button size="sm" className="h-8 flex-1 gap-1.5 text-[9px] font-black uppercase tracking-[0.08em]">
                      <PlayCircle className="h-3.5 w-3.5" /> Start Gap Analysis
                    </Button>
                  }
                />
                {!isMobile ? (
                  <>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 w-8 shrink-0 border-[hsl(var(--header-button-border))] bg-[hsl(var(--header-button-background))] p-0 shadow-none"
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild className="cursor-pointer">
                          <Link href={`/quality/gap-analyses/template/${template.id}`}>
                            <Pencil className="mr-2 h-3.5 w-3.5" /> Edit Template
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="cursor-pointer text-red-600"
                          onClick={() => handleDelete(template.id, template.title)}
                        >
                          <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete Template
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                ) : null}
                {isMobile ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-full justify-between border-[hsl(var(--header-button-border))] bg-[hsl(var(--header-button-background))] px-3 text-[9px] font-black uppercase text-[hsl(var(--header-button-foreground))] shadow-none hover:bg-[hsl(var(--header-button-hover))]"
                      >
                        <span className="flex items-center gap-2">
                          <MoreHorizontal className="h-3.5 w-3.5" />
                          Actions
                        </span>
                        <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[var(--radix-dropdown-menu-trigger-width)]"
                    >
                      <DropdownMenuItem asChild className="cursor-pointer">
                        <Link href={`/quality/gap-analyses/template/${template.id}`}>
                          <Pencil className="mr-2 h-3.5 w-3.5" /> Edit Template
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="cursor-pointer text-red-600"
                        onClick={() => handleDelete(template.id, template.title)}
                      >
                        <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete Template
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ))}
      </AccordionContent>
    </AccordionItem>
  );
}





