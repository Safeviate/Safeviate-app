'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Library } from 'lucide-react';
import type { ComplianceRequirement, ChecklistSection } from '@/types/quality';
import { v4 as uuidv4 } from 'uuid';

interface ImportFromMatrixDialogProps {
    complianceItems: ComplianceRequirement[];
    onImport: (sections: ChecklistSection[]) => void;
}

type MatrixTreeNode = {
    item: ComplianceRequirement;
    children: MatrixTreeNode[];
};

export function ImportFromMatrixDialog({ complianceItems, onImport }: ImportFromMatrixDialogProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [selectedItems, setSelectedItems] = useState<Record<string, boolean>>({});

    const naturalSort = (a: string, b: string) => {
        const re = /(\d+)/g;
        const aParts = a.split(re);
        const bParts = b.split(re);
        const len = Math.min(aParts.length, bParts.length);
        for (let i = 0; i < len; i++) {
            const aPart = aParts[i];
            const bPart = bParts[i];
            if (i % 2 === 1) {
                const aNum = parseInt(aPart, 10);
                const bNum = parseInt(bPart, 10);
                if (aNum !== bNum) return aNum - bNum;
            } else {
                if (aPart !== bPart) return aPart.localeCompare(bPart);
            }
        }
        return a.length - b.length;
    };

    const normalizeRegulationCode = (value?: string | null) => value?.trim() || '';
    
    const sortedComplianceItems = useMemo(() => {
        if (!complianceItems) return [];
        return [...complianceItems].sort((a, b) => naturalSort(a.regulationCode, b.regulationCode));
    }, [complianceItems]);

    const matrixTree = useMemo<MatrixTreeNode[]>(() => {
        const byParentCode = sortedComplianceItems.reduce((acc, item) => {
            const parentCode = normalizeRegulationCode(item.parentRegulationCode);
            if (!acc[parentCode]) acc[parentCode] = [];
            acc[parentCode].push(item);
            return acc;
        }, {} as Record<string, ComplianceRequirement[]>);

        const buildNodes = (parentCode: string, ancestry: Set<string>): MatrixTreeNode[] => {
            const children = byParentCode[parentCode] || [];
            return children.map((item) => {
                const code = normalizeRegulationCode(item.regulationCode);
                if (!code || ancestry.has(code)) {
                    return { item, children: [] };
                }

                const nextAncestry = new Set(ancestry);
                nextAncestry.add(code);
                return {
                    item,
                    children: buildNodes(code, nextAncestry),
                };
            });
        };

        return buildNodes('', new Set());
    }, [sortedComplianceItems]);

    const getSubtreeIds = (node: MatrixTreeNode): string[] => [
        node.item.id,
        ...node.children.flatMap((child) => getSubtreeIds(child)),
    ];

    const getSelectionState = (node: MatrixTreeNode) => {
        const subtreeIds = getSubtreeIds(node);
        const checked = subtreeIds.every((id) => !!selectedItems[id]);
        const anySelected = subtreeIds.some((id) => !!selectedItems[id]);
        return {
            checked,
            indeterminate: anySelected && !checked,
        };
    };

    const toggleNode = (node: MatrixTreeNode, checked: boolean) => {
        const nextSelected = { ...selectedItems };
        getSubtreeIds(node).forEach((id) => {
            nextSelected[id] = checked;
        });
        setSelectedItems(nextSelected);
    };

    const getQuestionText = (item: ComplianceRequirement) => {
        const statement = item.regulationStatement?.trim() || item.regulationCode.trim();
        const standard = item.technicalStandard?.trim() || '';
        return standard ? `${statement}\n${standard}` : statement;
    };

    const getSectionTitle = (item: ComplianceRequirement) =>
        item.regulationStatement?.trim() || item.regulationCode.trim();

    const splitQuestionRows = (item: ComplianceRequirement) => {
        const standard = item.technicalStandard?.trim() || '';
        if (!standard) {
            return [getQuestionText(item)];
        }

        const clauses = standard
            .split(/\n(?=\s*(?:\(\d+\)|\d+[.)])\s*)/g)
            .map((part) => part.trim())
            .filter(Boolean);

        if (clauses.length <= 1) {
            return [getQuestionText(item)];
        }

        return clauses;
    };

    const cleanQuestionText = (text: string) =>
        text
            .replace(/^\s*\(\d+\)\s*/, '')
            .replace(/^\s*\d+[.)]\s*/, '')
            .trim();

    const normalizeSubject = (subject: string) => subject.trim().replace(/\s+/g, ' ');

    const lowerCaseLeadingArticle = (subject: string) =>
        normalizeSubject(subject).replace(/^(a|an|the)\b/i, (match) => match.toLowerCase());

    const stripLeadingArticle = (subject: string) =>
        normalizeSubject(subject).replace(/^(?:a|an|the)\s+/i, '');

    const makeAuditQuestionText = (text: string) => {
        const normalized = cleanQuestionText(text);
        const clauseMatch = normalized.match(/^(.+?)\s+shall\s+(.+)$/i);

        if (clauseMatch) {
            const subject = normalizeSubject(clauseMatch[1]);
            const predicate = normalizeSubject(clauseMatch[2]);

            if (/^(?:an?\s+)?ato$/i.test(subject)) {
                return `Does the ATO ${predicate}`.replace(/\s+/g, ' ').replace(/\?$/, '') + '?';
            }

            if (/^be\s+prepared/i.test(predicate)) {
                return `Has ${stripLeadingArticle(subject)} been prepared${predicate.replace(/^be\s+prepared/i, '')}`.replace(/\s+/g, ' ').replace(/\?$/, '') + '?';
            }

            if (/^be\s+/i.test(predicate)) {
                return `Is ${lowerCaseLeadingArticle(subject)} ${predicate.replace(/^be\s+/i, '')}`.replace(/\s+/g, ' ').replace(/\?$/, '') + '?';
            }

            if (/^have\s+/i.test(predicate)) {
                return `Does ${lowerCaseLeadingArticle(subject)} ${predicate}`.replace(/\s+/g, ' ').replace(/\?$/, '') + '?';
            }

            return `Does ${lowerCaseLeadingArticle(subject)} ${predicate}`.replace(/\s+/g, ' ').replace(/\?$/, '') + '?';
        }

        if (/^\s*(?:an?\s+)?ato\b/i.test(normalized)) {
            return `Does the ATO ${normalized.replace(/^\s*(?:an?\s+)?ato\b/i, '').replace(/^\s+/, '')}`.replace(/\s+/g, ' ').replace(/\?$/, '') + '?';
        }

        return `Does the organisation ${normalized.replace(/\?$/, '')}`.replace(/\s+/g, ' ').replace(/\?$/, '') + '?';
    };

    const handleImport = () => {
        const importedSections: ChecklistSection[] = [];

        const collectSelectedNodes = (node: MatrixTreeNode): ComplianceRequirement[] => {
            const ownSelection = selectedItems[node.item.id] ? [node.item] : [];
            return [
                ...ownSelection,
                ...node.children.flatMap((child) => collectSelectedNodes(child)),
            ];
        };

        matrixTree.forEach((root) => {
            const selectedRows = collectSelectedNodes(root);
            if (selectedRows.length === 0) return;

            importedSections.push({
                id: uuidv4(),
                title: getSectionTitle(root.item),
                items: selectedRows.flatMap((row) => {
                    const questionRows = splitQuestionRows(row);
                    return questionRows.map((questionText, index) => ({
                        id: `${row.id}-${index}-${uuidv4()}`,
                        text: makeAuditQuestionText(questionText),
                        regulationReference: row.regulationCode,
                        companyReference: row.companyReference?.trim() || undefined,
                        responsibleManagerId: row.responsibleManagerId?.trim() || undefined,
                        nextAuditDate: row.nextAuditDate?.trim() || undefined,
                        type: 'Checkbox' as const,
                    }));
                }),
            });
        });
        
        onImport(importedSections);
        setIsOpen(false);
        setSelectedItems({});
    };

    const renderNode = (node: MatrixTreeNode, depth = 0) => {
        const selectionState = getSelectionState(node);
        const label = `${node.item.regulationCode} - ${node.item.regulationStatement}`;

        return (
            <Collapsible key={node.item.id} className={depth === 0 ? 'border rounded-lg' : 'border-l pl-4 ml-3'} defaultOpen={depth < 2}>
                <div className="flex items-center gap-2 p-2 bg-muted/20">
                    <Checkbox
                        id={node.item.id}
                        checked={selectionState.indeterminate ? 'indeterminate' : selectionState.checked}
                        onCheckedChange={(checked) => toggleNode(node, checked === true)}
                        aria-label={`Select ${label}`}
                        className="mx-2"
                    />
                    {node.children.length > 0 ? (
                        <CollapsibleTrigger className="flex flex-1 items-center gap-2 text-left text-sm font-semibold group">
                            <span className="min-w-0 flex-1 truncate">{label}</span>
                            <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200 group-data-[state=open]:-rotate-180" />
                        </CollapsibleTrigger>
                    ) : (
                        <div className="flex flex-1 items-center text-left text-sm">
                            <span className="min-w-0 flex-1 truncate">{label}</span>
                        </div>
                    )}
                </div>
                {node.children.length > 0 ? (
                    <CollapsibleContent className="p-2 pl-6">
                        <div className="space-y-2">
                            {node.children.map((child) => renderNode(child, depth + 1))}
                        </div>
                    </CollapsibleContent>
                ) : null}
            </Collapsible>
        );
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="outline"><Library className="mr-2 h-4 w-4" /> Import from Matrix</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Import from Coherence Matrix</DialogTitle>
                    <DialogDescription>
                        Select the regulation rows you want to turn into audit questions.
                    </DialogDescription>
                </DialogHeader>
                <ScrollArea className="h-[60vh] p-1">
                    <div className="space-y-2 pr-4">
                        {matrixTree.map((root) => renderNode(root))}
                    </div>
                </ScrollArea>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="outline">Cancel</Button>
                    </DialogClose>
                    <Button onClick={handleImport}>Import Selected</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
