import { BaseExecutor, type BuiltinToolContext, type BuiltinToolResult } from '@lobechat/types';

import { ClarifyExecutionRuntime } from '../ExecutionRuntime';
import { type AskUserQuestionArgs, ClarifyApiName, ClarifyIdentifier } from '../types';

export class ClarifyExecutor extends BaseExecutor<typeof ClarifyApiName> {
  readonly identifier = ClarifyIdentifier;
  protected readonly apiEnum = ClarifyApiName;

  private runtime: ClarifyExecutionRuntime;

  constructor(runtime: ClarifyExecutionRuntime) {
    super();
    this.runtime = runtime;
  }

  askUserQuestion = async (
    params: AskUserQuestionArgs,
    _ctx: BuiltinToolContext,
  ): Promise<BuiltinToolResult> => {
    return this.runtime.askUserQuestion(params);
  };
}

const fallbackRuntime = new ClarifyExecutionRuntime();

export const clarifyExecutor = new ClarifyExecutor(fallbackRuntime);
