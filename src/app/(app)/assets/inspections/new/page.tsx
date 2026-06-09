'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { ArrowLeft, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MainPageHeader } from '@/components/page-header';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useUserProfile } from '@/hooks/use-user-profile';
import { usePermissions } from '@/hooks/use-permissions';
import { getPersonnelDisplayName } from '@/lib/personnel-label';
import { cn } from '@/lib/utils';
import { DocumentUploader } from '../../../users/personnel/[id]/document-uploader';
import type { Personnel } from '../../../users/personnel/personnel-directory-page';
import type { Aircraft } from '@/types/aircraft';
import type { Vehicle } from '@/types/vehicle';
import type {
  AssetInspectionAssetType,
  AssetInspectionChecklistItem,
  AssetInspectionRecord,
  AssetInspectionTemplate,
  AssetInspectionScope,
  AssetInspectionStatus,
} from '@/types/inspection';

type AssetOption = {
  id: string;
  label: string;
  description: string;
};

const ASSET_TYPE_OPTIONS: { value: AssetInspectionAssetType; label: string }[] = [
  { value: 'aircraft', label: 'Aircraft' },
  { value: 'vehicle', label: 'Vehicle' },
];

const INSPECTION_TYPE_OPTIONS = [
  'Pre-use inspection',
  'Post-use inspection',
  'Scheduled inspection',
  'Annual inspection',
  'Spot check',
  'Other',
];

const STATUS_OPTIONS: AssetInspectionStatus[] = ['Serviceable', 'Attention Required', 'Grounded'];
const SCOPE_OPTIONS: { value: AssetInspectionScope; label: string }[] = [
  { value: 'Exterior', label: 'Exterior' },
  { value: 'Interior', label: 'Interior' },
  { value: 'Both', label: 'Both' },
];

function getDefaultChecklist(assetType: AssetInspectionAssetType): AssetInspectionChecklistItem[] {
  return assetType === 'vehicle'
    ? [
        { id: crypto.randomUUID(), label: 'Registration and documents', outcome: 'Pass' },
        { id: crypto.randomUUID(), label: 'Lights, tyres, and mirrors', outcome: 'Pass' },
        { id: crypto.randomUUID(), label: 'Fluid leaks and visible damage', outcome: 'Pass' },
        { id: crypto.randomUUID(), label: 'Cabin and load area condition', outcome: 'Pass' },
        { id: crypto.randomUUID(), label: 'Roadworthiness / serviceability', outcome: 'Pass' },
      ]
    : [
        { id: crypto.randomUUID(), label: 'Documents and technical logs', outcome: 'Pass' },
        { id: crypto.randomUUID(), label: 'Exterior walk-around', outcome: 'Pass' },
        { id: crypto.randomUUID(), label: 'Cabin / cockpit condition', outcome: 'Pass' },
        { id: crypto.randomUUID(), label: 'Fuel, oil, and visible leaks', outcome: 'Pass' },
        { id: crypto.randomUUID(), label: 'Serviceability and defects check', outcome: 'Pass' },
      ];
}

function flattenTemplateChecklist(template?: AssetInspectionTemplate | null): AssetInspectionChecklistItem[] {
  if (!template) return [];
  return template.sections.flatMap((section) =>
    section.items.map((item) => ({
      id: item.id || crypto.randomUUID(),
      label: item.label,
      outcome: item.outcome,
      notes: item.notes,
      photos: [],
      scope: item.scope,
      minPhotos: item.minPhotos,
      sectionTitle: section.title,
    })),
  );
}

function formatInspectionDate(value?: string | null) {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : format(parsed, 'dd MMM yyyy');
}

function getAssetLabel(asset: Aircraft | Vehicle, assetType: AssetInspectionAssetType) {
  if (assetType === 'vehicle') {
    const vehicle = asset as Vehicle;
    return `${vehicle.registrationNumber} • ${vehicle.make} ${vehicle.model}`.trim();
  }
  const aircraft = asset as Aircraft;
  return `${aircraft.tailNumber} • ${aircraft.make} ${aircraft.model}`.trim();
}

function getAssetDescription(asset: Aircraft | Vehicle, assetType: AssetInspectionAssetType) {
  if (assetType === 'vehicle') {
    const vehicle = asset as Vehicle;
    return vehicle.type || 'Vehicle';
  }
  const aircraft = asset as Aircraft;
  return aircraft.type || 'Aircraft';
}

function checklistOutcomeClass(outcome: string) {
  if (outcome === 'Fail') return 'border-red-300 bg-red-50 text-red-700';
  if (outcome === 'N/A') return 'border-slate-300 bg-slate-50 text-slate-600';
  return 'border-emerald-300 bg-emerald-50 text-emerald-700';
}

export default function AssetInspectionNewPage() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const { tenantId } = useUserProfile();
  const { hasPermission } = usePermissions();
  const canManageAssets = hasPermission('assets-edit') || hasPermission('assets-manage') || hasPermission('assets-create');

  const [aircraft, setAircraft] = useState<Aircraft[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [inspections, setInspections] = useState<AssetInspectionRecord[]>([]);
  const [templates, setTemplates] = useState<AssetInspectionTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [assetType, setAssetType] = useState<AssetInspectionAssetType>('aircraft');
  const [templateId, setTemplateId] = useState('');
  const [inspectionScope, setInspectionScope] = useState<AssetInspectionScope>('Both');
  const [assetId, setAssetId] = useState('');
  const [inspectionType, setInspectionType] = useState(INSPECTION_TYPE_OPTIONS[0]);
  const [inspectionDate, setInspectionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [inspectorId, setInspectorId] = useState('');
  const [status, setStatus] = useState<AssetInspectionStatus>('Serviceable');
  const [findings, setFindings] = useState('');
  const [notes, setNotes] = useState('');
  const [nextInspectionDate, setNextInspectionDate] = useState('');
  const [checklistItems, setChecklistItems] = useState<AssetInspectionChecklistItem[]>(() => getDefaultChecklist('aircraft'));

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [aircraftRes, vehicleRes, personnelRes, inspectionsRes, templatesRes] = await Promise.all([
        fetch('/api/aircraft', { cache: 'no-store' }),
        fetch('/api/vehicles', { cache: 'no-store' }),
        fetch('/api/personnel', { cache: 'no-store' }),
        fetch('/api/asset-inspections', { cache: 'no-store' }),
        fetch('/api/asset-inspection-templates', { cache: 'no-store' }),
      ]);

      const [aircraftPayload, vehiclePayload, personnelPayload, inspectionPayload, templatePayload] = await Promise.all([
        aircraftRes.json().catch(() => ({ aircraft: [] })),
        vehicleRes.json().catch(() => ({ vehicles: [] })),
        personnelRes.json().catch(() => ({ personnel: [] })),
        inspectionsRes.json().catch(() => ({ inspections: [] })),
        templatesRes.json().catch(() => ({ templates: [] })),
      ]);

      setAircraft(Array.isArray(aircraftPayload.aircraft) ? aircraftPayload.aircraft : []);
      setVehicles(Array.isArray(vehiclePayload.vehicles) ? vehiclePayload.vehicles : []);
      setPersonnel(Array.isArray(personnelPayload.personnel) ? personnelPayload.personnel : []);
      setInspections(Array.isArray(inspectionPayload.inspections) ? inspectionPayload.inspections : []);
      setTemplates(Array.isArray(templatePayload.templates) ? templatePayload.templates : []);
    } catch (error) {
      console.error('Failed to load asset inspection data', error);
      setAircraft([]);
      setVehicles([]);
      setPersonnel([]);
      setInspections([]);
      setTemplates([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
    const onUpdated = () => void loadData();
    window.addEventListener('safeviate-asset-inspections-updated', onUpdated);
    return () => window.removeEventListener('safeviate-asset-inspections-updated', onUpdated);
  }, [loadData]);

  useEffect(() => {
    const nextTemplate = templates.find((template) => template.assetType === assetType || template.assetType === 'all') || null;
    setTemplateId(nextTemplate?.id || '');
    setChecklistItems(flattenTemplateChecklist(nextTemplate));
    setInspectionScope('Both');
    setAssetId('');
  }, [assetType, templates]);

  const assetOptions = useMemo<AssetOption[]>(() => {
    const source = assetType === 'vehicle' ? vehicles : aircraft;
    return source.map((asset) => ({
      id: asset.id,
      label: getAssetLabel(asset, assetType),
      description: getAssetDescription(asset, assetType),
    }));
  }, [aircraft, assetType, vehicles]);

  useEffect(() => {
    if (!assetId && assetOptions[0]?.id) {
      setAssetId(assetOptions[0].id);
    }
  }, [assetId, assetOptions]);

  useEffect(() => {
    const nextTemplate = templates.find((template) => template.id === templateId) || null;
    if (!templateId || !nextTemplate) return;
    setChecklistItems(flattenTemplateChecklist(nextTemplate));
  }, [templateId, templates]);

  const selectedAsset = useMemo(
    () => (assetType === 'vehicle' ? vehicles.find((vehicle) => vehicle.id === assetId) || null : aircraft.find((item) => item.id === assetId) || null),
    [aircraft, assetId, assetType, vehicles],
  );

  const selectedAssetLabel = selectedAsset ? getAssetLabel(selectedAsset, assetType) : '';
  const inspectorLabel = inspectorId ? getPersonnelDisplayName(personnel, inspectorId) || inspectorId : '';
  const availableTemplates = useMemo(
    () => templates.filter((template) => template.assetType === assetType || template.assetType === 'all'),
    [assetType, templates],
  );
  const selectedTemplate = availableTemplates.find((template) => template.id === templateId) || null;
  const visibleChecklistItems = useMemo(
    () =>
      checklistItems.filter((item) => {
        if (!item.scope || inspectionScope === 'Both') return true;
        return item.scope === inspectionScope || item.scope === 'Both';
      }),
    [checklistItems, inspectionScope],
  );

  useEffect(() => {
    const requestedTemplateId = searchParams?.get('template')?.trim() || '';
    if (!requestedTemplateId || !availableTemplates.some((template) => template.id === requestedTemplateId)) return;
    setTemplateId(requestedTemplateId);
    setChecklistItems(flattenTemplateChecklist(availableTemplates.find((template) => template.id === requestedTemplateId) || null));
  }, [availableTemplates, searchParams]);
  const checklistSections = useMemo(() => {
    return visibleChecklistItems.reduce<{ title: string; items: AssetInspectionChecklistItem[] }[]>((sections, item) => {
      const sectionTitle = item.sectionTitle || 'Questions';
      const currentSection = sections[sections.length - 1];
      if (!currentSection || currentSection.title !== sectionTitle) {
        sections.push({ title: sectionTitle, items: [item] });
      } else {
        currentSection.items.push(item);
      }
      return sections;
    }, []);
  }, [visibleChecklistItems]);

  const handleChecklistChange = (index: number, field: keyof AssetInspectionChecklistItem, value: string) => {
    setChecklistItems((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)),
    );
  };

  const handleTemplateChange = (value: string) => {
    setTemplateId(value);
    const nextTemplate = availableTemplates.find((template) => template.id === value) || null;
    setChecklistItems(flattenTemplateChecklist(nextTemplate));
  };

  const handleChecklistPhotoUploaded = (
    index: number,
    docDetails: { name: string; url: string; uploadDate: string; expirationDate: string | null },
  ) => {
    setChecklistItems((current) =>
      current.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        return {
          ...item,
          photos: [
            ...(item.photos || []),
            {
              url: docDetails.url,
              description: docDetails.name,
            },
          ],
        };
      }),
    );
  };

  const removeChecklistPhoto = (itemIndex: number, photoIndex: number) => {
    setChecklistItems((current) =>
      current.map((item, index) => {
        if (index !== itemIndex) return item;
        return {
          ...item,
          photos: (item.photos || []).filter((_, currentIndex) => currentIndex !== photoIndex),
        };
      }),
    );
  };

  const addChecklistItem = () => {
    setChecklistItems((current) => [
      ...current,
      { id: crypto.randomUUID(), label: '', outcome: 'Pass', photos: [] },
    ]);
  };

  const removeChecklistItem = (index: number) => {
    setChecklistItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedAsset || !assetId.trim()) {
      toast({ variant: 'destructive', title: 'Select an asset', description: 'Choose an aircraft or vehicle before saving the inspection.' });
      return;
    }

    if (!inspectionType.trim() || !inspectionDate.trim()) {
      toast({ variant: 'destructive', title: 'Complete the form', description: 'Add the inspection type and inspection date before saving.' });
      return;
    }

    const minimumPhotoViolation = checklistItems.find((item) => {
      if (inspectionScope !== 'Both' && item.scope && item.scope !== inspectionScope && item.scope !== 'Both') {
        return false;
      }
      const minPhotos = Math.max(0, Number(item.minPhotos || 0));
      return minPhotos > 0 && (item.photos || []).length < minPhotos;
    });

    if (minimumPhotoViolation) {
      toast({
        variant: 'destructive',
        title: 'More photos required',
        description: `${minimumPhotoViolation.label} needs at least ${minimumPhotoViolation.minPhotos || 0} photos before saving.`,
      });
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        inspection: {
          id: crypto.randomUUID(),
          assetType,
          assetId,
          assetLabel: selectedAssetLabel,
          inspectionType: inspectionType.trim(),
          inspectionDate,
          inspectorId: inspectorId || '',
          inspectorName: inspectorLabel || '',
          status,
          findings: findings.trim(),
          notes: notes.trim(),
          nextInspectionDate: nextInspectionDate || '',
          templateId: templateId || '',
          templateTitle: selectedTemplate?.title || '',
          inspectionScope,
          checklistItems: checklistItems
            .filter((item) => inspectionScope === 'Both' || !item.scope || item.scope === inspectionScope || item.scope === 'Both')
            .filter((item) => item.label.trim())
            .map((item) => ({
              ...item,
              label: item.label.trim(),
              notes: item.notes?.trim() || '',
            })),
          organizationId: (selectedAsset as { organizationId?: string | null })?.organizationId || null,
        },
      };

      const response = await fetch('/api/asset-inspections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(errorPayload?.error || 'Failed to save inspection.');
      }

      toast({ title: 'Inspection saved', description: `${selectedAssetLabel} inspection has been recorded.` });
      window.dispatchEvent(new Event('safeviate-asset-inspections-updated'));
      setInspectionType(INSPECTION_TYPE_OPTIONS[0]);
      setInspectionDate(new Date().toISOString().slice(0, 10));
      setInspectorId('');
      setStatus('Serviceable');
      setFindings('');
      setNotes('');
      setNextInspectionDate('');
      setInspectionScope('Both');
      const nextTemplate = availableTemplates[0] || null;
      setTemplateId(nextTemplate?.id || '');
      setChecklistItems(flattenTemplateChecklist(nextTemplate));
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Save failed',
        description: error instanceof Error ? error.message : 'Failed to save inspection.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-6 px-1 pt-4">
        <Skeleton className="h-20 w-full" />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
          <Skeleton className="h-[760px] w-full" />
          <Skeleton className="h-[760px] w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-6 px-1 pt-4">
      <Card className="overflow-hidden border shadow-none">
        <MainPageHeader
          title="Asset Inspection"
          description="Create a dedicated inspection for an aircraft or vehicle without using the audit workflow."
          actions={(
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="outline" size="compact" className="h-8 border-slate-300 text-[9px] font-black uppercase tracking-[0.08em]">
                <Link href="/assets/checklists">
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Manage Checklists
                </Link>
              </Button>
            </div>
          )}
        />
      </Card>

      <div className="grid gap-6 lg:grid-cols-1">
        <Card className="overflow-hidden border shadow-none">
          <CardContent className="space-y-5 p-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Inspection Form</p>
              <p className="mt-1 text-sm text-muted-foreground">Record a pure asset inspection, attach checklist results, and keep the history separate from audits.</p>
            </div>

            <form className="space-y-5" onSubmit={handleSubmit}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Asset Type</Label>
                  <Select value={assetType} onValueChange={(value) => setAssetType(value as AssetInspectionAssetType)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select asset type" />
                    </SelectTrigger>
                    <SelectContent>
                      {ASSET_TYPE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Asset</Label>
                  <Select value={assetId} onValueChange={setAssetId}>
                    <SelectTrigger>
                      <SelectValue placeholder={`Select ${assetType}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {assetOptions.length > 0 ? (
                        assetOptions.map((option) => (
                          <SelectItem key={option.id} value={option.id}>
                            {option.label}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="__none__" disabled>
                          No {assetType} records available
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
                <div className="space-y-2">
                  <Label>Inspection Template</Label>
                  <Select value={templateId} onValueChange={handleTemplateChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select template" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableTemplates.length > 0 ? (
                        availableTemplates.map((template) => (
                          <SelectItem key={template.id} value={template.id}>
                            {template.title}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="__none__" disabled>
                          No checklists available
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] font-medium text-muted-foreground">Each question in the default checklists requires at least 4 photos.</p>
                </div>
                <div className="space-y-2">
                  <Label className="opacity-0">Manage</Label>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline" className="h-10 border-slate-300">
                      <Link href="/assets/checklists">Manage Checklists</Link>
                    </Button>
                    <Button
                      asChild
                      variant="outline"
                      className="h-10 border-slate-300"
                      disabled={!templateId}
                    >
                      <Link href={`/assets/checklists/new?copyFrom=${encodeURIComponent(templateId)}`}>
                        Copy Checklist
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Inspection Scope</Label>
                <Select value={inspectionScope} onValueChange={(value) => setInspectionScope(value as AssetInspectionScope)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select scope" />
                  </SelectTrigger>
                  <SelectContent>
                    {SCOPE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] font-medium text-muted-foreground">Exterior and Interior checklists can be filtered independently, or combined with Both.</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Inspection Type</Label>
                  <Select value={inspectionType} onValueChange={setInspectionType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select inspection type" />
                    </SelectTrigger>
                    <SelectContent>
                      {INSPECTION_TYPE_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Inspection Date</Label>
                  <Input type="date" value={inspectionDate} onChange={(event) => setInspectionDate(event.target.value)} />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Inspector</Label>
                  <Select value={inspectorId} onValueChange={setInspectorId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select inspector" />
                    </SelectTrigger>
                    <SelectContent>
                      {personnel.length > 0 ? (
                        personnel.map((person) => (
                          <SelectItem key={person.id} value={person.id}>
                            {getPersonnelDisplayName(personnel, person.id) || person.email || person.id}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="__none__" disabled>
                          No personnel available
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Overall Status</Label>
                  <Select value={status} onValueChange={(value) => setStatus(value as AssetInspectionStatus)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label>Checklist</Label>
                  <Button type="button" variant="outline" size="sm" className="h-8 border-slate-300 text-[9px] font-black uppercase tracking-[0.08em]" onClick={addChecklistItem}>
                    <Plus className="mr-2 h-3.5 w-3.5" />
                    Add Item
                  </Button>
                </div>
                <div className="space-y-4">
                  {checklistSections.map((section) => (
                    <div key={section.title} className="rounded-lg border border-card-border bg-muted/10 p-3">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">{section.title}</p>
                          <p className="mt-1 text-[11px] text-muted-foreground">{selectedTemplate?.title || 'Template checklist'}</p>
                        </div>
                        <Badge variant="outline" className="border-card-border bg-background/70 text-[10px] font-black uppercase tracking-[0.08em] text-foreground">
                          {section.items.length} item{section.items.length === 1 ? '' : 's'}
                        </Badge>
                      </div>
                      <div className="space-y-3">
                        {section.items.map((item) => {
                          const index = checklistItems.findIndex((entry) => entry.id === item.id);
                          return (
                            <div key={item.id} className="rounded-lg border border-card-border bg-muted/15 p-3">
                      <div className="grid gap-3 md:grid-cols-[minmax(0,1.6fr)_170px_1fr_auto]">
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Checklist Item</Label>
                          <Input value={item.label} onChange={(event) => handleChecklistChange(index, 'label', event.target.value)} placeholder="Describe the item to inspect" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Result</Label>
                          <Select value={item.outcome} onValueChange={(value) => handleChecklistChange(index, 'outcome', value)}>
                            <SelectTrigger>
                              <SelectValue placeholder="Result" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Pass">Pass</SelectItem>
                              <SelectItem value="Fail">Fail</SelectItem>
                              <SelectItem value="N/A">N/A</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Notes</Label>
                          <Input value={item.notes || ''} onChange={(event) => handleChecklistChange(index, 'notes', event.target.value)} placeholder="Optional notes" />
                        </div>
                        <div className="flex items-end gap-2">
                          <div className="flex min-w-[112px] flex-col items-end gap-1">
                            <p className="text-[9px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                              Photos: {Array.isArray(item.photos) ? item.photos.length : 0}
                            </p>
                            <p className="text-[9px] font-medium text-muted-foreground">Min {Math.max(0, Number(item.minPhotos || 0))}</p>
                          </div>
                          <DocumentUploader
                            restrictedMode="camera"
                            onDocumentUploaded={(docDetails) => handleChecklistPhotoUploaded(index, docDetails)}
                            trigger={(openDialog) => (
                              <Button type="button" variant="outline" size="icon" className="h-9 w-9 border-slate-300" onClick={() => openDialog('camera')}>
                                <Plus className="h-4 w-4" />
                              </Button>
                            )}
                          />
                          <Button type="button" variant="destructive" size="icon" className="h-9 w-9" onClick={() => removeChecklistItem(index)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      {Array.isArray(item.photos) && item.photos.length > 0 ? (
                        <div className="mt-3 space-y-2 rounded-md border bg-background/70 p-3">
                          <Label className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Photos</Label>
                          <div className="flex flex-wrap gap-2">
                            {item.photos.map((photo, photoIndex) => (
                              <div key={`${item.id}-photo-${photoIndex}`} className="group flex items-center gap-2 rounded-md border bg-muted/20 p-2">
                                <a href={photo.url} target="_blank" rel="noreferrer" className="relative h-12 w-12 overflow-hidden rounded bg-background">
                                  <img src={photo.url} alt={photo.description} className="h-full w-full object-cover" />
                                </a>
                                <div className="min-w-0">
                                  <p className="max-w-[180px] truncate text-[11px] font-semibold text-foreground">{photo.description || 'Photo'}</p>
                                  <p className="text-[10px] font-black uppercase tracking-[0.12em] text-muted-foreground">Question photo</p>
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive opacity-100 md:opacity-0 md:group-hover:opacity-100"
                                  onClick={() => removeChecklistPhoto(index, photoIndex)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Findings</Label>
                  <Textarea value={findings} onChange={(event) => setFindings(event.target.value)} placeholder="Summarize defects, observations, or serviceability issues." className="min-h-28" />
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Additional inspection notes, references, or follow-up actions." className="min-h-28" />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Next Inspection Date</Label>
                  <Input type="date" value={nextInspectionDate} onChange={(event) => setNextInspectionDate(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Selected Asset</Label>
                  <div className="flex h-10 items-center rounded-md border bg-muted/20 px-3 text-sm font-semibold text-foreground">
                    {selectedAssetLabel || 'Select an asset to continue'}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button asChild variant="outline" size="compact" className="h-9 border-slate-300">
                  <Link href="/assets/aircraft">Cancel</Link>
                </Button>
                <Button type="submit" size="compact" disabled={isSaving || !canManageAssets}>
                  {isSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : 'Save Inspection'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
