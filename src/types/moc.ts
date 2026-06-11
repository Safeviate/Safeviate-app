import type { RiskAssessment } from './safety-report';

export type MocStatus = 'Proposed' | 'Under Review' | 'Approved' | 'In Progress' | 'Closed' | 'Cancelled';
export type MocMitigationStatus = 'Open' | 'In Progress' | 'Closed' | 'Cancelled';

export interface MocSignature {
    userId: string;
    userName: string;
    role: string;
    signatureUrl: string;
    signedAt: string; // ISO String
}

export interface MocMitigation {
    id: string;
    description: string;
    responsiblePersonId: string;
    completionDate: string; // ISO String
    status: MocMitigationStatus;
    residualRiskAssessment: RiskAssessment;
}

export interface MocRisk {
    id: string;
    description: string;
    initialRiskAssessment: RiskAssessment;
    mitigations: MocMitigation[];
}

export interface MocHazard {
    id: string;
    description: string;
    risks: MocRisk[];
}

export interface MocStep {
    id: string;
    description: string;
    hazards: MocHazard[];
}

export interface MocPhase {
    id: string;
    title: string;
    steps: MocStep[];
}

export interface ManagementOfChange {
    id: string;
    tenantId?: string | null;
    mocNumber: string;
    title: string;
    description: string;
    reason: string;
    scope: string;
    proposingDepartmentId: string;
    responsiblePersonId: string;
    proposedBy: string;
    proposalDate: string; // ISO String
    status: MocStatus;
    phases: MocPhase[];
    signatures?: MocSignature[];
    organizationId?: string | null; // Associated external company ID
}
