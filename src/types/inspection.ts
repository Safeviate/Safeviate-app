
export interface HourWarning {
  hours: number;
  color: string;
  foregroundColor: string;
}

export interface AircraftInspectionWarningSettings {
  id: string;
  fiftyHourWarnings: HourWarning[];
  oneHundredHourWarnings: HourWarning[];
}

export type AssetInspectionAssetType = 'aircraft' | 'vehicle';
export type AssetInspectionOutcome = 'Pass' | 'Fail' | 'N/A';
export type AssetInspectionStatus = 'Serviceable' | 'Attention Required' | 'Grounded';
export type AssetInspectionScope = 'Exterior' | 'Interior' | 'Both';

export interface AssetInspectionChecklistPhoto {
  url: string;
  description: string;
}

export interface AssetInspectionChecklistItem {
  id: string;
  label: string;
  outcome: AssetInspectionOutcome;
  notes?: string;
  photos?: AssetInspectionChecklistPhoto[];
  scope?: AssetInspectionScope;
  minPhotos?: number;
  sectionTitle?: string;
}

export interface AssetInspectionTemplateItem {
  id: string;
  label: string;
  outcome: AssetInspectionOutcome;
  notes?: string;
  scope?: AssetInspectionScope;
  minPhotos?: number;
}

export interface AssetInspectionTemplateSection {
  id: string;
  title: string;
  items: AssetInspectionTemplateItem[];
}

export interface AssetInspectionTemplate {
  id: string;
  title: string;
  assetType: AssetInspectionAssetType | 'all';
  organizationId?: string | null;
  sections: AssetInspectionTemplateSection[];
  createdAt?: string;
  updatedAt?: string;
}

export interface AssetInspectionRecord {
  id: string;
  assetType: AssetInspectionAssetType;
  assetId: string;
  assetLabel?: string;
  templateId?: string;
  templateTitle?: string;
  inspectionScope?: AssetInspectionScope;
  inspectionType: string;
  inspectionDate: string;
  inspectorId?: string;
  inspectorName?: string;
  status: AssetInspectionStatus;
  findings?: string;
  notes?: string;
  nextInspectionDate?: string;
  checklistItems?: AssetInspectionChecklistItem[];
  organizationId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}
