export interface Contact {
  name: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  designation: string;
  email: string;
  confidence: 'Verified' | 'AI Estimated — Verify Before Send' | 'Not Verified';
  linkedin?: string;
}

export interface Lead {
  industry: string;
  companyName: string;
  website: string;
  contacts: Contact[];
  generalEmail?: string;
  cityState: string;
  employeeSize: string;
  yearFounded: string;
  hiringStatus?: string;
  fundingStatus?: string;
  isFallbackResult?: boolean;
}

export type ProcessingStatus = 'pending' | 'searching' | 'extracting' | 'completed' | 'failed' | 'no-data';

export interface DomainProcess {
  domain: string;
  status: ProcessingStatus;
  result?: Lead;
  error?: string;
}
