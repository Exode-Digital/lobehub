import type { BuiltinIntervention } from '@lobechat/types';

import { ClarifyApiName } from '../../types';
import AskUserQuestionIntervention from './AskUserQuestion';

export const ClarifyInterventions: Record<string, BuiltinIntervention> = {
  [ClarifyApiName.askUserQuestion]: AskUserQuestionIntervention as BuiltinIntervention,
};
