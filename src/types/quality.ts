import type { CorrectiveAction } from './safety-report';

export type AuditChecklistItemType = 'Checkbox' | 'Textbox' | 'Number' | 'Date';
export type AuditFinding = 'Compliant' | 'Non Compliant' | 'Not Applicable';
export type AuditStatus = 'Scheduled' | 'In Progress' | 'Finalized' | 'Closed' | 'Archived';
export type CorrectiveActionStatus = 'Open' | 'In Progress' | 'Closed' | 'Cancelled';
export type AuditScheduleStatus = 'Scheduled' | 'Completed' | 'Pending' | 'Not Scheduled';
export type GapStatus = 'Open gap' | 'Partial coverage' | 'Covered' | 'Unassessed' | 'Not applicable';

export type IndustryType = 
  | 'Aviation: Flight Training (ATO)' 
  | 'Aviation: Charter / Ops (AOC)' 
  | 'Aviation: Maintenance (AMO)' 
  | 'General: Occupational Health & Safety (OHS)';

export interface AuditScheduleItem {
    id: string;
    area: string;
    month: string;
    year: number;
    status: AuditScheduleStatus;
}

export interface ClauseAnalysisEntry {
    id: string;
    marker: string;
    content: string;
    gapStatus?: GapStatus;
    gapStatusDate?: string;
    companyReference?: string;
}

export interface ComplianceRequirement {
    id: string;
    structureType?: 'header' | 'subheader' | 'item';
    regulationFamily?: 'sacaa-cars' | 'sacaa-cats' | 'ohs';
    regulationCode: string;
    parentRegulationCode?: string;
    documentHeading?: string;
    regulationStatement: string; // The short title/heading
    technicalStandard?: string; // The full, detailed body text
    technicalStandardIndentation?: number[];
    companyReference: string;
    responsibleManagerId: string;
    gapStatus?: GapStatus;
    gapStatusDate?: string;
    lastAuditDate?: string; // ISO String
    nextAuditDate?: string; // ISO String
    organizationId?: string | null; // Associated external company ID
    analysisEntries?: ClauseAnalysisEntry[];
}

export interface AuditChecklistItem {
    id: string;
    text: string;
    type: AuditChecklistItemType;
    regulationReference?: string;
    companyReference?: string;
    responsibleManagerId?: string;
    nextAuditDate?: string;
}

export interface ChecklistSection {
    id: string;
    title: string;
    items: AuditChecklistItem[];
}

export interface QualityAuditChecklistTemplate {
    id: string;
    title: string;
    departmentId: string;
    organizationId?: string | null;
    category?: string;
    sections: ChecklistSection[];
}

export type { CorrectiveAction } from './safety-report';

export interface QualityFinding {
    checklistItemId: string;
    finding?: AuditFinding;
    gapStatus?: GapStatus;
    companyReference?: string;
    regulationReference?: string;
    currentState?: string;
    desiredState?: string;
    gapDescription?: string;
    actionPlan?: string;
    ownerId?: string;
    targetDate?: string;
    notes?: string;
    level?: string; // e.g., 'Level 1', 'Level 2'
    comment?: string;
    suggestedImprovements?: string;
    evidence?: {
        url: string;
        description: string;
    }[];
}

export interface QualityAuditSignoff {
    signedById: string;
    signedByName: string;
    signatureUrl: string;
    signedAt: string;
}

export interface QualityAudit {
    id: string;
    tenantId?: string | null;
    templateId: string;
    title: string;
    auditNumber: string;
    auditorId: string;
    auditorName?: string | null;
    auditeeId: string;
    auditeeName?: string | null;
    targetId?: string | null;
    targetName?: string | null;
    assetId?: string | null;
    organizationId?: string | null; // NULL for internal (Safeviate) audits
    scope: string;
    auditDate: string; // ISO String
    status: AuditStatus;
    findings: QualityFinding[];
    complianceScore?: number;
    auditorSignoff?: QualityAuditSignoff;
    auditeeSignoff?: QualityAuditSignoff;
}

export interface CorrectiveActionPlan {
    id: string;
    tenantId?: string | null;
    auditId: string;
    findingId: string;
    rootCauseAnalysis: string;
    status: CorrectiveActionStatus;
    actions?: CorrectiveAction[];
    responsiblePersonId?: string;
    dueDate?: string;
    createdAt?: string;
    updatedAt?: string;
}

export interface QualityRiskPlanSignoff {
    signedById?: string;
    signedAt?: string;
    notes?: string;
}

export interface QualityRiskPlanEntry {
    id: string;
    activity: string;
    hazardOrThreat: string;
    changeTriggeredRisk?: string;
    mitigationPlan: string;
    ownerId: string;
    reviewDate: string;
    managementReviewSignoff?: QualityRiskPlanSignoff;
    organizationId?: string | null;
}

export interface ExternalOrganization {
    id: string;
    name: string;
    contactEmail?: string;
    address?: string;
}

export interface TabVisibilitySettings {
  id: string;
  visibilities: Record<string, boolean>;
}

export interface PageLayoutState {
  enabled: boolean;
  sections: Record<string, boolean>;
  tabs: Record<string, boolean>;
}

export interface PageLayoutSettings {
  id: string;
  pages: Record<string, PageLayoutState>;
}

export interface Tenant {
    id: string;
    name: string;
    industry?: IndustryType;
    logoUrl?: string;
    theme?: {
        primaryColour?: string;
        backgroundColour?: string;
        accentColour?: string;
        // Expanded theme keys
        main?: Record<string, string>;
        button?: Record<string, string>;
        card?: Record<string, string>;
        popover?: Record<string, string>;
        sidebar?: Record<string, string>;
        sidebarBackgroundImage?: string;
        sidebarBackgroundOpacity?: number;
        sidebarLogoImage?: string;
        sidebarLogoBackgroundColor?: string;
        header?: Record<string, string>;
        headerBackgroundImage?: string;
        headerBackgroundOpacity?: number;
        swimlane?: Record<string, string>;
        matrix?: Record<string, string>;
        scale?: number;
    };
    enabledMenus?: string[];
    pageLayoutSettings?: PageLayoutSettings | null;
    tabVisibilitySettings?: TabVisibilitySettings | null;
}
