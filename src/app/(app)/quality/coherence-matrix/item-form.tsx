'use client';

import { useCallback, useState } from 'react';
import { useForm, useWatch, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { CustomCalendar } from '@/components/ui/custom-calendar';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { getPersonnelDisplayName } from '@/lib/personnel-label';
import type { Personnel } from '../../users/personnel/page';
import type { ComplianceRequirement } from '@/types/quality';

const parseLocalDate = (value?: string | null) => {
    if (!value) return undefined;
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) {
        const fallback = new Date(value);
        return Number.isNaN(fallback.getTime()) ? undefined : fallback;
    }
    return new Date(year, month - 1, day, 12);
};

const toNoonUtcIso = (date: Date) =>
    new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12)).toISOString();

function formatParentOptionLabel(option: { code: string; label: string }) {
    const code = option.code.trim();
    const label = option.label.trim();
    return label && label !== code
        ? `${code} - ${label}`
        : code;
}

function normalizeRegulationCode(value?: string | null) {
    return value?.trim() || '';
}

function splitCompositeRegulationInput(value?: string | null) {
    const raw = value?.trim() || '';
    const match = raw.match(/^([A-Za-z0-9]+(?:\.[A-Za-z0-9]+)+)\s+(.+)$/);

    if (!match) {
        return {
            regulationCode: raw,
            regulationStatement: raw,
        };
    }

    return {
        regulationCode: match[1].trim(),
        regulationStatement: match[2].trim(),
    };
}

function normalizeResponsibleManagerId(value?: string | null) {
    const normalized = value?.trim() || '';
    return normalized === '__unassigned__' ? '' : normalized;
}

const itemFormSchema = z.object({
    regulationFamily: z.enum(['sacaa-cars', 'sacaa-cats', 'ohs']).optional(),
    parentRegulationCode: z.string().min(1, 'Parent header or subheader is required.'),
    regulationCode: z.string().min(1, 'Code is required.'),
    documentHeading: z.string().optional(),
    regulationStatement: z.string().min(1, 'Statement is required.'),
    technicalStandard: z.string().optional(),
    companyReference: z.string().min(1, 'Reference is required.'),
    responsibleManagerId: z.string().optional(),
    nextAuditDate: z.date().optional(),
    organizationId: z.string().nullable().optional(),
}).superRefine((values, ctx) => {
    const parentCode = normalizeRegulationCode(values.parentRegulationCode);
    const regulationCode = normalizeRegulationCode(values.regulationCode);

    if (parentCode && regulationCode && parentCode.toLowerCase() === regulationCode.toLowerCase()) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['parentRegulationCode'],
            message: 'Parent cannot be the same as the regulation code.',
        });
    }
});

const headerFormSchema = z.object({
    regulationFamily: z.enum(['sacaa-cars', 'sacaa-cats', 'ohs']),
    regulationCode: z.string().min(1, 'Code is required.'),
    regulationStatement: z.string().min(1, 'Title is required.'),
    responsibleManagerId: z.string().min(1, 'Responsible person is required.'),
});

const subheaderFormSchema = z.object({
    regulationFamily: z.enum(['sacaa-cars', 'sacaa-cats', 'ohs']),
    parentRegulationCode: z.string().min(1, 'Parent header is required.'),
    regulationCode: z.string().min(1, 'Code is required.'),
    regulationStatement: z.string().min(1, 'Title is required.'),
    responsibleManagerId: z.string().min(1, 'Responsible person is required.'),
}).superRefine((values, ctx) => {
    const parentCode = normalizeRegulationCode(values.parentRegulationCode);
    const regulationCode = normalizeRegulationCode(values.regulationCode);

    if (parentCode && regulationCode && parentCode.toLowerCase() === regulationCode.toLowerCase()) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['parentRegulationCode'],
            message: 'Parent header cannot be the same as the subheader code.',
        });
    }
});

interface ComplianceItemFormProps {
    personnel: Personnel[];
    existingItem?: ComplianceRequirement | null;
    onFormSubmit: () => void;
    tenantId: string;
    defaultRegulationFamily?: 'sacaa-cars' | 'sacaa-cats' | 'ohs';
    availableParentHeaders?: { code: string; label: string }[];
    mode?: 'item' | 'header' | 'subheader';
}

type ComplianceItemFormValues = {
    regulationFamily?: 'sacaa-cars' | 'sacaa-cats' | 'ohs';
    parentRegulationCode?: string;
    regulationCode: string;
    documentHeading?: string;
    regulationStatement: string;
    technicalStandard?: string;
    companyReference?: string;
    responsibleManagerId?: string;
    nextAuditDate?: Date;
    organizationId?: string | null;
};

export function ComplianceItemForm({ personnel, existingItem, onFormSubmit, tenantId, defaultRegulationFamily, availableParentHeaders = [], mode = 'item' }: ComplianceItemFormProps) {
    const { toast } = useToast();
    const [calendarPortalContainer, setCalendarPortalContainer] = useState<HTMLDivElement | null>(null);
    const activeSchema = (
        mode === 'header'
            ? headerFormSchema
            : mode === 'subheader'
            ? subheaderFormSchema
            : itemFormSchema
    ) as z.ZodTypeAny;

    const form = useForm<ComplianceItemFormValues>({
        resolver: zodResolver(activeSchema) as Resolver<ComplianceItemFormValues>,
        defaultValues: {
            regulationFamily: existingItem?.regulationFamily || defaultRegulationFamily || 'sacaa-cars',
            parentRegulationCode: existingItem?.parentRegulationCode || '',
            regulationCode: existingItem?.regulationCode || '',
            documentHeading: existingItem?.documentHeading || '',
            regulationStatement: existingItem?.regulationStatement || '',
            technicalStandard: existingItem?.technicalStandard || '',
            companyReference: existingItem?.companyReference || '',
            responsibleManagerId: existingItem?.responsibleManagerId || '',
            nextAuditDate: parseLocalDate(existingItem?.nextAuditDate),
            organizationId: existingItem?.organizationId || null,
        },
    });

    const watchedCompanyReference = useWatch({ control: form.control, name: 'companyReference' });
    const watchedResponsibleManagerId = useWatch({ control: form.control, name: 'responsibleManagerId' });
    const watchedNextAuditDate = useWatch({ control: form.control, name: 'nextAuditDate' });

    const getManagerLabel = (managerId?: string | null) => {
        const normalizedManagerId = managerId?.trim() || '';
        if (!normalizedManagerId) return '';
        return getPersonnelDisplayName(personnel, normalizedManagerId);
    };

    const formatAuditDate = (value?: Date | null) => {
        if (!value) return '';
        return format(value, 'dd MMM yyyy');
    };

    const setCalendarPortalContainerRef = useCallback((node: HTMLDivElement | null) => {
        setCalendarPortalContainer(node);
    }, []);

    const onSubmit = async (values: ComplianceItemFormValues) => {
        const normalizedCode = normalizeRegulationCode(values.regulationCode);
        const splitInput = splitCompositeRegulationInput(values.regulationCode);
        const normalizedParentCode = normalizeRegulationCode(values.parentRegulationCode);

        if ((mode === 'item' || mode === 'subheader') && !normalizedParentCode) {
            toast({
                variant: 'destructive',
                title: mode === 'subheader' ? 'Select a parent header' : 'Select a parent header or subheader',
                description: mode === 'subheader'
                    ? 'Create a top-level Part/Header first, then add the subheader beneath it.'
                    : 'Create the Part/Header and Subpart first, then add regulation items beneath them.',
            });
            return;
        }

        if ((mode === 'item' || mode === 'subheader') && !availableParentHeaders.some((header) => header.code === normalizedParentCode)) {
            toast({
                variant: 'destructive',
                title: 'Invalid parent selection',
                description: 'Choose an existing parent from the list before saving.',
            });
            return;
        }
        
        const dataToSave = mode === 'header'
            ? {
                regulationFamily: values.regulationFamily,
                parentRegulationCode: '',
                regulationCode: normalizedCode,
                regulationStatement: values.regulationStatement.trim(),
                technicalStandard: '',
                companyReference: '',
                responsibleManagerId: normalizeResponsibleManagerId(values.responsibleManagerId),
                nextAuditDate: null,
                organizationId: null,
            }
            : mode === 'subheader'
            ? {
                regulationFamily: values.regulationFamily,
                parentRegulationCode: normalizedParentCode,
                regulationCode: normalizeRegulationCode(values.regulationCode) || splitInput.regulationCode,
                regulationStatement: values.regulationStatement.trim() || splitInput.regulationStatement,
                technicalStandard: '',
                companyReference: '',
                responsibleManagerId: normalizeResponsibleManagerId(values.responsibleManagerId),
                nextAuditDate: null,
                organizationId: null,
            }
            : {
                ...values,
                regulationCode: normalizeRegulationCode(values.regulationCode),
                parentRegulationCode: normalizedParentCode,
                documentHeading: values.documentHeading?.trim() || '',
                regulationStatement: values.regulationStatement.trim(),
                nextAuditDate: values.nextAuditDate ? toNoonUtcIso(values.nextAuditDate) : null,
            };

        try {
            const response = await fetch(`/api/compliance-matrix?tenantId=${encodeURIComponent(tenantId)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    item: existingItem ? { ...existingItem, ...dataToSave } : { ...dataToSave, id: crypto.randomUUID() },
                }),
            });
            if (!response.ok) throw new Error('Failed to save compliance item');
            toast({ title: "Success", description: existingItem ? "Compliance item updated." : "New compliance item added." });
            window.dispatchEvent(new Event('safeviate-compliance-updated'));
            onFormSubmit();
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Save Failed',
                description: error instanceof Error ? error.message : 'Failed to save compliance item',
            });
        }
    };

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {mode === 'item' && existingItem ? (
                    <div className="rounded-lg border border-slate-200 bg-muted/30 px-3 py-2">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-foreground/55">Current Matrix Metadata</p>
                        <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-foreground/55">
                            {watchedCompanyReference?.trim() ? (
                                <div className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-card-border/70 bg-background px-2.5 py-1">
                                    <span className="shrink-0">Manual ref</span>
                                    <span className="truncate normal-case tracking-normal text-foreground/80">{watchedCompanyReference.trim()}</span>
                                </div>
                            ) : null}
                            {watchedResponsibleManagerId?.trim() ? (
                                <div className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-card-border/70 bg-background px-2.5 py-1">
                                    <span className="shrink-0">Responsible</span>
                                    <span className="truncate normal-case tracking-normal text-foreground/80">{getManagerLabel(watchedResponsibleManagerId)}</span>
                                </div>
                            ) : null}
                            {watchedNextAuditDate ? (
                                <div className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-card-border/70 bg-background px-2.5 py-1">
                                    <span className="shrink-0">Next audit date</span>
                                    <span className="truncate normal-case tracking-normal text-foreground/80">{formatAuditDate(watchedNextAuditDate)}</span>
                                </div>
                            ) : null}
                        </div>
                    </div>
                ) : null}
                <FormField control={form.control} name="regulationCode" render={({ field }) => ( <FormItem><FormLabel>Regulation Code</FormLabel><FormControl><Input placeholder="e.g., 141.02.2" {...field} /></FormControl><FormMessage /></FormItem> )} />
                {mode === 'item' ? (
                    <>
                        <FormField control={form.control} name="regulationFamily" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Category</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value || defaultRegulationFamily || 'sacaa-cars'}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select category" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="sacaa-cars">SACAA CARs</SelectItem>
                                        <SelectItem value="sacaa-cats">SACAA CATs</SelectItem>
                                        <SelectItem value="ohs">OHS</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )} />
                        <FormField control={form.control} name="parentRegulationCode" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Parent Header / Subheader</FormLabel>
                                <Select
                                    onValueChange={field.onChange}
                                    defaultValue={field.value || undefined}
                                >
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select the header or subheader this regulation belongs under" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {availableParentHeaders.length > 0 ? (
                                            availableParentHeaders.map((header) => (
                                                <SelectItem key={header.code} value={header.code}>
                                                    {formatParentOptionLabel(header)}
                                                </SelectItem>
                                            ))
                                        ) : (
                                            <SelectItem value="__no_parent_options__" disabled>
                                                Create a header or subheader first
                                            </SelectItem>
                                        )}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )} />
                        <FormField control={form.control} name="documentHeading" render={({ field }) => ( <FormItem><FormLabel>Document Heading</FormLabel><FormControl><Input placeholder="e.g., Documents to be carried on board" {...field} /></FormControl><FormMessage /></FormItem> )} />
                        <FormField control={form.control} name="regulationStatement" render={({ field }) => ( <FormItem><FormLabel>Regulation Statement</FormLabel><FormControl><Input placeholder="The short title of the regulation..." {...field} /></FormControl><FormMessage /></FormItem> )} />
                        <FormField control={form.control} name="technicalStandard" render={({ field }) => ( <FormItem><FormLabel>Full Regulation Text</FormLabel><FormControl><Textarea placeholder="The full, detailed text of the regulation..." {...field} className="min-h-32" /></FormControl><FormMessage /></FormItem> )} />
                        <FormField control={form.control} name="companyReference" render={({ field }) => ( <FormItem><FormLabel>Company Reference</FormLabel><FormControl><Input placeholder="e.g., Ops Manual, Sec 4.2.1" {...field} /></FormControl><FormMessage /></FormItem> )} />
                        <FormField control={form.control} name="responsibleManagerId" render={({ field }) => ( <FormItem><FormLabel>Responsible Manager</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select a manager" /></SelectTrigger></FormControl><SelectContent>{personnel.map(p => (<SelectItem key={p.id} value={p.id}>{p.firstName} {p.lastName}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem> )} />
                        <div ref={setCalendarPortalContainerRef}>
                            <FormField control={form.control} name="nextAuditDate" render={({ field }) => (
                                <FormItem className="flex flex-col">
                                    <FormLabel>Next Audit Date</FormLabel>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <FormControl>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    className={cn('w-full pl-3 text-left font-normal', !field.value && 'text-muted-foreground')}
                                                >
                                                    {field.value ? format(field.value, 'PPP') : <span>Pick a date</span>}
                                                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                                </Button>
                                            </FormControl>
                                        </PopoverTrigger>
                                        <PopoverContent
                                            container={calendarPortalContainer}
                                            className="w-auto p-0 pointer-events-auto"
                                        >
                                            <CustomCalendar selectedDate={field.value} onDateSelect={field.onChange} />
                                        </PopoverContent>
                                    </Popover>
                                    <FormMessage />
                                </FormItem>
                            )} />
                        </div>
                    </>
                ) : null}
                {mode === 'subheader' ? (
                    <>
                        <FormField control={form.control} name="regulationFamily" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Category</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value || defaultRegulationFamily || 'sacaa-cars'}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select category" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="sacaa-cars">SACAA CARs</SelectItem>
                                        <SelectItem value="sacaa-cats">SACAA CATs</SelectItem>
                                        <SelectItem value="ohs">OHS</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )} />
                        <FormField control={form.control} name="parentRegulationCode" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Parent Header</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value || undefined}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select a header" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {availableParentHeaders.length > 0 ? (
                                            availableParentHeaders.map((header) => (
                                                <SelectItem key={header.code} value={header.code}>
                                                    {formatParentOptionLabel(header)}
                                                </SelectItem>
                                            ))
                                        ) : (
                                            <SelectItem value="__no_parent_options__" disabled>
                                                Create a top-level header first
                                            </SelectItem>
                                        )}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )} />
                        <FormField control={form.control} name="regulationStatement" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Subheader Title</FormLabel>
                                <FormControl>
                                    <Input placeholder="e.g., QUALITY ASSURANCE AND QUALITY SYSTEM" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />
                        <FormField control={form.control} name="responsibleManagerId" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Responsible person</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value || undefined}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select personnel" />
                                        </SelectTrigger>
                                    </FormControl>
                                <SelectContent>
                                        {personnel.map((person) => (
                                            <SelectItem key={person.id} value={person.id}>
                                                {person.firstName} {person.lastName}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )} />
                    </>
                ) : null}
                {mode === 'header' ? (
                    <>
                        <FormField control={form.control} name="regulationFamily" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Category</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value || defaultRegulationFamily || 'sacaa-cars'}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select category" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="sacaa-cars">SACAA CARs</SelectItem>
                                        <SelectItem value="sacaa-cats">SACAA CATs</SelectItem>
                                        <SelectItem value="ohs">OHS</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )} />
                        <FormField control={form.control} name="regulationStatement" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Header Title</FormLabel>
                                <FormControl>
                                    <Input placeholder="e.g., SA-CATS 141 Aviation Training Organisations" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />
                        <FormField control={form.control} name="responsibleManagerId" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Responsible person</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value || undefined}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select personnel" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="__unassigned__">Unassigned</SelectItem>
                                        {personnel.map((person) => (
                                            <SelectItem key={person.id} value={person.id}>
                                                {person.firstName} {person.lastName}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )} />
                    </>
                ) : null}
                <div className="flex justify-end gap-2 pt-4">
                    <Button type="button" variant="outline" onClick={onFormSubmit}>Cancel</Button>
                    <Button type="submit">Save</Button>
                </div>
            </form>
        </Form>
    );
}
