import { ClarifyIdentifier } from '@lobechat/builtin-tool-clarify';
import { ClarifyExecutionRuntime } from '@lobechat/builtin-tool-clarify/executionRuntime';

import { type ServerRuntimeRegistration } from './types';

export const clarifyRuntime: ServerRuntimeRegistration = {
  factory: () => {
    return new ClarifyExecutionRuntime();
  },
  identifier: ClarifyIdentifier,
};
