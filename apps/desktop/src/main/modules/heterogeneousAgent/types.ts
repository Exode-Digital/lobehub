export interface HeterogeneousAgentImageAttachment {
  id: string;
  url: string;
}

export interface HeterogeneousAgentBuildPlan {
  args: string[];
  /**
   * Extra environment variables the controller MUST merge into the spawned
   * child's env. Used by Claude Code to set `CLAUDE_CODE_ENTRYPOINT=sdk-ts`,
   * which unlocks non-`-p` stream-json + the control protocol side channel.
   */
  env?: Record<string, string>;
  stdinPayload?: string;
}

export interface HeterogeneousAgentBuildPlanHelpers {
  buildClaudeStreamJsonInput: (
    prompt: string,
    imageList: HeterogeneousAgentImageAttachment[],
  ) => Promise<string>;
  resolveCliImagePaths: (imageList: HeterogeneousAgentImageAttachment[]) => Promise<string[]>;
}

export interface HeterogeneousAgentBuildPlanParams {
  args: string[];
  helpers: HeterogeneousAgentBuildPlanHelpers;
  imageList: HeterogeneousAgentImageAttachment[];
  /**
   * Optional path to an MCP config JSON written by the controller (e.g. for
   * the local `lobe_cc` AskUserQuestion server). Drivers that recognize the
   * field append `--mcp-config <path>`; others ignore it.
   */
  mcpConfigPath?: string;
  prompt: string;
  resumeSessionId?: string;
}

/**
 * Per-agent CLI flag composition + stdin shape. Stream framing is no longer the
 * driver's concern — `AgentStreamPipeline` (`@lobechat/heterogeneous-agents/spawn`)
 * runs JSONL parsing + adapter conversion uniformly for every agent type.
 */
export interface HeterogeneousAgentDriver {
  buildSpawnPlan: (
    params: HeterogeneousAgentBuildPlanParams,
  ) => Promise<HeterogeneousAgentBuildPlan>;
}
