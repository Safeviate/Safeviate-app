
export type ERPContactCategory = 'Internal' | 'Aviation Authorities' | 'Emergency Services' | 'External Partners';

export interface ERPContact {
  id: string;
  name: string;
  role: string;
  organization: string;
  phone: string;
  email: string;
  priority: number;
  category: ERPContactCategory;
}

export interface ERPTrigger {
  id: string;
  eventType: string;
  criteria: string;
  checklist: string[];
}

export interface ERPMediaTemplate {
  id: string;
  type: 'Immediate' | 'Second Statement' | 'Post-Incident';
  title: string;
  content: string;
}

export interface ERPLogEntry {
  id: string;
  timestamp: string; // ISO String
  description: string;
  loggedBy: string;
  userName: string;
  isMilestone: boolean;
}

export type ERPEventStatus = 'Mock' | 'Active' | 'Closed';

export interface ERPCollectedDocument {
  id: string;
  name: string;
  securedAt?: string;
  securedBy?: string;
  status: 'Pending' | 'Secured' | 'Not Available';
}

export interface ERPFacilityRunCard {
  id: string;
  scenario: string;
  title: string;
  actions: string[];
}

export interface ERPEvent {
  id: string;
  title: string;
  status: ERPEventStatus;
  startedAt: string;
  endedAt?: string;
  summary?: string;
  facilityId?: string;
  facilityName?: string;
  scenario?: string;
  runCard?: ERPFacilityRunCard;
  linkedDocumentIds?: string[];
  followUpCapId?: string;
  completedTasks?: string[];
  collectedDocuments?: ERPCollectedDocument[];
  log: ERPLogEntry[];
}
