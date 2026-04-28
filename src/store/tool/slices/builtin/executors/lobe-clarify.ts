import { ClarifyExecutionRuntime } from '@lobechat/builtin-tool-clarify/executionRuntime';
import { ClarifyExecutor } from '@lobechat/builtin-tool-clarify/executor';

const runtime = new ClarifyExecutionRuntime();

export const clarifyExecutor = new ClarifyExecutor(runtime);
