export type QuickReportWorkflowStatus = 'Preliminary' | 'Under Review' | 'Assigned' | 'Closed' | 'Classified';

export interface QuickReportPhotoAttachment {
  id: string;
  name: string;
  mimeType: string;
  dataUrl: string;
}

export interface TechnicalQuickReport {
  id: string;
  reportNumber: string;
  reportType: string;
  status: 'Open' | 'Closed';
  workflowStatus: QuickReportWorkflowStatus;
  submittedByEmail?: string | null;
  submittedById?: string | null;
  submittedByName: string;
  submittedAt: string;
  eventDate: string;
  eventTime: string;
  location: string;
  title: string;
  systemOrComponent?: string | null;
  grounded: boolean;
  urgency: 'Low' | 'Medium' | 'High';
  summary: string;
  immediateAction?: string | null;
  photoAttachments?: QuickReportPhotoAttachment[] | null;
  aircraftId?: string | null;
  aircraftLabel?: string | null;
  assignedToId?: string | null;
  assignedToName?: string | null;
  managementNotes?: string | null;
}

export interface QuickSafetyReport {
  id: string;
  reportNumber: string;
  reportType: string;
  status: 'Open' | 'Closed';
  workflowStatus: QuickReportWorkflowStatus;
  submittedByEmail?: string | null;
  submittedById?: string | null;
  submittedByName: string;
  submittedAt: string;
  eventDate: string;
  eventTime: string;
  location: string;
  aircraftId?: string | null;
  aircraftLabel?: string | null;
  summary: string;
  immediateAction?: string | null;
  photoAttachments?: QuickReportPhotoAttachment[] | null;
  recommendedClassification?: 'Hazard' | 'Incident' | 'Accident' | 'General Concern';
  linkedSafetyReportId?: string | null;
  linkedSafetyReportNumber?: string | null;
  managementNotes?: string | null;
}
