export const ClarifyIdentifier = 'lobe-clarify';

export const ClarifyApiName = {
  askUserQuestion: 'askUserQuestion',
} as const;

export type ClarifyStatus = 'pending';

export interface ClarifyOption {
  description: string;
  label: string;
  preview?: string;
}

export interface ClarifyQuestion {
  header: string;
  id: string;
  multiSelect?: boolean;
  options: ClarifyOption[];
  question: string;
}

export interface AskUserQuestionArgs {
  metadata?: Record<string, unknown>;
  questions: ClarifyQuestion[];
}

export interface ClarifyAnswer {
  notes?: string;
  other?: string;
  question: string;
  selected: string[];
  selectedPreview?: string;
}

export interface ClarifySubmitPayload {
  answers: Record<string, ClarifyAnswer>;
}

export interface ClarifyState {
  questions: ClarifyQuestion[];
  requestId: string;
  status: ClarifyStatus;
}
