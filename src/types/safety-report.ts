export type ReportStatus = 'Open' | 'Under Review' | 'Awaiting Action' | 'Closed';
export type ReportType = string;
export type EventClassification = 'Hazard' | 'Incident' | 'Accident';
export type InvestigationMemberRole = 'Lead Investigator' | 'Team Member' | 'Technical Expert' | 'Observer';
export type InvestigationTaskStatus = 'Open' | 'In Progress' | 'Completed';
export type CorrectiveActionStatus = 'Open' | 'In Progress' | 'Closed' | 'Cancelled';
export type RiskLevel = 'Low' | 'Medium' | 'High' | 'Critical';

export interface InvestigationMember {
    userId: string;
    name: string;
    role: InvestigationMemberRole;
}

export interface RiskAssessment {
    severity: number;
    likelihood: number;
    riskScore: number;
    riskLevel: RiskLevel;
}

export interface ReportRisk {
    id: string;
    description: string;
    riskAssessment: RiskAssessment;
}

export interface ReportHazard {
    id: string;
    description: string;
    risks?: ReportRisk[];
}

export interface InvestigationTask {
    id: string;
    description: string;
    assigneeId: string;
    dueDate: string; // ISO String
    status: InvestigationTaskStatus;
}

export interface ReportDiscussionItem {
    id: string;
    userId: string;
    userName: string;
    message: string;
    timestamp: string; // ISO String
    assignedToId?: string;
    assignedToName?: string;
}

export interface CorrectiveAction {
    id: string;
    description: string;
    responsiblePersonId: string;
    deadline: string; // ISO String
    status: CorrectiveActionStatus;
}

export interface ReportSignature {
    userId: string;
    userName: string;
    role: string;
    signatureUrl: string;
    signedAt: string; // ISO String
}

export interface SafetyReport {
    id: string;
    reportNumber: string;
    reportType: ReportType;
    status: ReportStatus;
    submittedBy: string;
    submittedByEmail?: string | null;
    submittedByName: string;
    submittedAt: string; // ISO String
    closedDate?: string; // ISO String
    isAnonymous: boolean;
    eventDate: string; // ISO String
    eventTime: string;
    location: string;
    description: string;
    immediateAction?: string | null;
    organizationId?: string | null; // Associated external company ID
    // Conditional Fields
    phaseOfFlight?: string;
    systemOrComponent?: string;
    // Triage Fields
    departmentId?: string;
    occurrenceCategory?: string;
    eventClassification?: EventClassification;
    // Investigation Fields
    investigationTeam?: InvestigationMember[];
    initialHazards?: ReportHazard[];
    investigationTasks?: InvestigationTask[];
    investigationNotes?: string;
    discussion?: ReportDiscussionItem[];
    // CAP Fields
    correctiveActions?: CorrectiveAction[];
    mitigatedHazards?: ReportHazard[];
    // Closure Fields
    signatures?: ReportSignature[];
    sourceQuickReportId?: string;
    sourceQuickReportNumber?: string;
}
