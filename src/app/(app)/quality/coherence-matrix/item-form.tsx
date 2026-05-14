'use client';

import { useForm, type Resolver } from 'react-hook-form';
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

const formSchema = z.object({
    regulationFamily: z.enum(['sacaa-cars', 'sacaa-cats', 'ohs']).optional(),
    parentRegulationCode: z.string().optional(),
    regulationCode: z.string().min(1, 'Code is required.'),
    regulationStatement: z.string().min(1, 'Statement is required.'),
    technicalStandard: z.string().optional(),
    companyReference: z.string().min(1, 'Reference is required.'),
    responsibleManagerId: z.string().optional(),
    nextAuditDate: z.date().optional(),
    organizationId: z.string().nullable().optional(),
});

const headerFormSchema = z.object({
    regulationFamily: z.enum(['sacaa-cars', 'sacaa-cats', 'ohs']),
    regulationCode: z.string().min(1, 'Code is required.'),
    regulationStatement: z.string().min(1, 'Title is required.'),
});

const subheaderFormSchema = z.object({
    regulationFamily: z.enum(['sacaa-cars', 'sacaa-cats', 'ohs']),
    parentRegulationCode: z.string().min(1, 'Parent header is required.'),
    regulationCode: z.string().min(1, 'Code is required.'),
    regulationStatement: z.string().min(1, 'Title is required.'),
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
    regulationStatement: string;
    technicalStandard?: string;
    companyReference?: string;
    responsibleManagerId?: string;
    nextAuditDate?: Date;
    organizationId?: string | null;
};

export function ComplianceItemForm({ personnel, existingItem, onFormSubmit, tenantId, defaultRegulationFamily, availableParentHeaders = [], mode = 'item' }: ComplianceItemFormProps) {
    const { toast } = useToast();
    const topLevelHeaderValue = '__top_level__';
    const activeSchema = (
        mode === 'header'
            ? headerFormSchema
            : mode === 'subheader'
            ? subheaderFormSchema
            : formSchema
    ) as z.ZodTypeAny;

    const form = useForm<ComplianceItemFormValues>({
        resolver: zodResolver(activeSchema) as Resolver<ComplianceItemFormValues>,
        defaultValues: {
            regulationFamily: existingItem?.regulationFamily || defaultRegulationFamily || 'sacaa-cars',
            parentRegulationCode: existingItem?.parentRegulationCode || '',
            regulationCode: existingItem?.regulationCode || '',
            regulationStatement: existingItem?.regulationStatement || '',
            technicalStandard: existingItem?.technicalStandard || '',
            companyReference: existingItem?.companyReference || '',
            responsibleManagerId: existingItem?.responsibleManagerId || '',
            nextAuditDate: parseLocalDate(existingItem?.nextAuditDate),
            organizationId: existingItem?.organizationId || null,
        },
    });

    const onSubmit = async (values: ComplianceItemFormValues) => {
        const normalizedCode = normalizeRegulationCode(values.regulationCode);
        const splitInput = splitCompositeRegulationInput(values.regulationCode);
        
        const dataToSave = mode === 'header'
            ? {
                regulationFamily: values.regulationFamily,
                parentRegulationCode: '',
                regulationCode: normalizedCode,
                regulationStatement: values.regulationStatement.trim(),
                technicalStandard: '',
                companyReference: '',
                responsibleManagerId: '',
                nextAuditDate: null,
                organizationId: null,
            }
            : mode === 'subheader'
            ? {
                regulationFamily: values.regulationFamily,
                parentRegulationCode: normalizeRegulationCode(values.parentRegulationCode),
                regulationCode: normalizeRegulationCode(values.regulationCode) || splitInput.regulationCode,
                regulationStatement: values.regulationStatement.trim() || splitInput.regulationStatement,
                technicalStandard: '',
                companyReference: '',
                responsibleManagerId: '',
                nextAuditDate: null,
                organizationId: null,
            }
            : {
                ...values,
                regulationCode: normalizeRegulationCode(values.regulationCode),
                parentRegulationCode: normalizeRegulationCode(values.parentRegulationCode),
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
                                <FormLabel>Parent Header</FormLabel>
                                <Select
                                    onValueChange={(value) => field.onChange(value === topLevelHeaderValue ? '' : value)}
                                    defaultValue={field.value || topLevelHeaderValue}
                                >
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Top-level header" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value={topLevelHeaderValue}>Top-level header</SelectItem>
                                        {availableParentHeaders.map((header) => (
                                            <SelectItem key={header.code} value={header.code}>
                                                {formatParentOptionLabel(header)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )} />
                        <FormField control={form.control} name="regulationStatement" render={({ field }) => ( <FormItem><FormLabel>Regulation Statement</FormLabel><FormControl><Input placeholder="The short title of the regulation..." {...field} /></FormControl><FormMessage /></FormItem> )} />
                        <FormField control={form.control} name="technicalStandard" render={({ field }) => ( <FormItem><FormLabel>Full Regulation Text</FormLabel><FormControl><Textarea placeholder="The full, detailed text of the regulation..." {...field} className="min-h-32" /></FormControl><FormMessage /></FormItem> )} />
                        <FormField control={form.control} name="companyReference" render={({ field }) => ( <FormItem><FormLabel>Company Reference</FormLabel><FormControl><Input placeholder="e.g., Ops Manual, Sec 4.2.1" {...field} /></FormControl><FormMessage /></FormItem> )} />
                        <FormField control={form.control} name="responsibleManagerId" render={({ field }) => ( <FormItem><FormLabel>Responsible Manager</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select a manager" /></SelectTrigger></FormControl><SelectContent>{personnel.map(p => (<SelectItem key={p.id} value={p.id}>{p.firstName} {p.lastName}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem> )} />
                        <FormField control={form.control} name="nextAuditDate" render={({ field }) => (<FormItem className="flex flex-col"><FormLabel>Next Audit Date</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant="outline" className={cn('w-full pl-3 text-left font-normal', !field.value && 'text-muted-foreground')}>{field.value ? format(field.value, 'PPP') : <span>Pick a date</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0"><CustomCalendar selectedDate={field.value} onDateSelect={field.onChange} /></PopoverContent></Popover><FormMessage /></FormItem>)} />
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
                                        {availableParentHeaders.map((header) => (
                                            <SelectItem key={header.code} value={header.code}>
                                                {formatParentOptionLabel(header)}
                                            </SelectItem>
                                        ))}
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
