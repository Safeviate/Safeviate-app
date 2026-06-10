'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Copy, Pencil, PlayCircle, Trash2, MoreHorizontal, ChevronsUpDown, Layers3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { CARD_HEADER_BAND_CLASS, CARD_HEADER_ACTION_ZONE_CLASS } from '@/components/page-header';
import { PAGE_FORMAT_HEADER_COMPACT_DROPDOWN_BUTTON_CLASS } from '@/lib/page-format-buttons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import type { AssetInspectionTemplate } from '@/types/inspection';

interface ChecklistTemplateCardProps {
  category: string;
  templates: AssetInspectionTemplate[];
  onDelete: (template: AssetInspectionTemplate) => Promise<void>;
}

export function ChecklistTemplateCard({ category, templates, onDelete }: ChecklistTemplateCardProps) {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async (template: AssetInspectionTemplate) => {
    setIsDeleting(true);
    try {
      await onDelete(template);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete checklist.',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="rounded-xl border border-card-border bg-background shadow-none">
      <div className="border-b border-card-border/70 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Layers3 className="h-4 w-4 shrink-0 text-muted-foreground" />
            <h3 className="truncate text-sm font-black uppercase tracking-[0.16em] text-foreground">{category}</h3>
          </div>
          <Badge variant="outline" className="h-6 rounded-full border-card-border bg-background/70 px-2 text-[10px] font-black uppercase tracking-[0.08em] text-foreground">
            {templates.length}
          </Badge>
        </div>
      </div>
      <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">
        {templates.map((template) => {
          const totalSections = template.sections.length;
          const totalQuestions = template.sections.reduce((count, section) => count + section.items.length, 0);

          return (
            <Card key={template.id} className="flex flex-col overflow-hidden border border-card-border shadow-none">
              <CardHeader className={cn(CARD_HEADER_BAND_CLASS, 'space-y-2')}>
                <div className="flex items-start justify-between gap-3">
                  <CardTitle className="flex items-center gap-2 text-sm font-black tracking-tight">
                    <Layers3 className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{template.title}</span>
                  </CardTitle>
                  <div className={cn(CARD_HEADER_ACTION_ZONE_CLASS, 'gap-1')}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className={PAGE_FORMAT_HEADER_COMPACT_DROPDOWN_BUTTON_CLASS}>
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
                          <Link href={`/assets/inspections/new?assetType=${encodeURIComponent(template.assetType === 'all' ? 'aircraft' : template.assetType)}&template=${encodeURIComponent(template.id)}`}>
                            <PlayCircle className="mr-2 h-3.5 w-3.5" /> Start Inspection
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild className="cursor-pointer">
                          <Link href={`/assets/checklists/new?template=${encodeURIComponent(template.id)}`}>
                            <Pencil className="mr-2 h-3.5 w-3.5" /> Edit Checklist
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild className="cursor-pointer">
                          <Link href={`/assets/checklists/new?copyFrom=${encodeURIComponent(template.id)}`}>
                            <Copy className="mr-2 h-3.5 w-3.5" /> Duplicate Checklist
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="cursor-pointer text-red-600"
                          disabled={isDeleting}
                          onClick={() => void handleDelete(template)}
                        >
                          <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete Checklist
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                <CardDescription className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  {totalQuestions} questions • {totalSections} sections
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 pt-4">
                <div className="flex flex-wrap items-center gap-2">
                  {!isMobile ? (
                    <>
                      <Button
                        asChild
                        size="sm"
                        className="h-8 flex-1 gap-1.5 text-[9px] font-black uppercase tracking-[0.08em]"
                      >
                        <Link href={`/assets/inspections/new?assetType=${encodeURIComponent(template.assetType === 'all' ? 'aircraft' : template.assetType)}&template=${encodeURIComponent(template.id)}`}>
                          <PlayCircle className="h-3.5 w-3.5" /> Start Inspection
                        </Link>
                      </Button>
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
                            <Link href={`/assets/checklists/new?template=${encodeURIComponent(template.id)}`}>
                              <Pencil className="mr-2 h-3.5 w-3.5" /> Edit Checklist
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild className="cursor-pointer">
                            <Link href={`/assets/checklists/new?copyFrom=${encodeURIComponent(template.id)}`}>
                              <Copy className="mr-2 h-3.5 w-3.5" /> Duplicate Checklist
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="cursor-pointer text-red-600"
                            disabled={isDeleting}
                            onClick={() => void handleDelete(template)}
                          >
                            <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete Checklist
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
                          className={PAGE_FORMAT_HEADER_COMPACT_DROPDOWN_BUTTON_CLASS}
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
                          <Link href={`/assets/inspections/new?assetType=${encodeURIComponent(template.assetType === 'all' ? 'aircraft' : template.assetType)}&template=${encodeURIComponent(template.id)}`}>
                            <PlayCircle className="mr-2 h-3.5 w-3.5" /> Start Inspection
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild className="cursor-pointer">
                          <Link href={`/assets/checklists/new?template=${encodeURIComponent(template.id)}`}>
                            <Pencil className="mr-2 h-3.5 w-3.5" /> Edit Checklist
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild className="cursor-pointer">
                          <Link href={`/assets/checklists/new?copyFrom=${encodeURIComponent(template.id)}`}>
                            <Copy className="mr-2 h-3.5 w-3.5" /> Duplicate Checklist
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="cursor-pointer text-red-600"
                          disabled={isDeleting}
                          onClick={() => void handleDelete(template)}
                        >
                          <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete Checklist
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
