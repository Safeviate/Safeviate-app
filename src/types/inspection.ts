
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
}

export interface AssetInspectionRecord {
  id: string;
  assetType: AssetInspectionAssetType;
  assetId: string;
  assetLabel?: string;
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
