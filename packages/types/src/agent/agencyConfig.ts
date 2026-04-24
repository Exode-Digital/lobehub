/**
 * Authentication mode for a heterogeneous agent CLI.
 * - 'subscription': use the CLI's built-in auth (e.g. `claude auth login`).
 * - 'api': inject API credentials from a LobeHub provider at spawn time.
 */
export type HeterogeneousAuthMode = 'subscription' | 'api';

/**
 * API-mode config: bind a LobeHub provider + model to the CLI.
 * Resolved into env vars (ANTHROPIC_API_KEY, ANTHROPIC_BASE_URL, etc.) when spawning.
 */
export interface HeterogeneousApiConfig {
  /** Primary model id, maps to ANTHROPIC_MODEL / equivalent */
  model: string;
  /** LobeHub AiProvider.id whose keyVaults supplies credentials */
  providerId: string;
  /** Optional fast-path model, maps to ANTHROPIC_SMALL_FAST_MODEL */
  smallFastModel?: string;
}

/**
 * Heterogeneous agent provider configuration.
 * When set, the assistant delegates execution to an external agent CLI
 * instead of using the built-in model runtime.
 */
export interface HeterogeneousProviderConfig {
  /** API-mode binding to a LobeHub provider. Only read when authMode === 'api'. */
  apiConfig?: HeterogeneousApiConfig;
  /** Additional CLI arguments for the agent command */
  args?: string[];
  /** Auth mode. Defaults to 'subscription' for backwards compatibility. */
  authMode?: HeterogeneousAuthMode;
  /** Command to spawn the agent (e.g. 'claude') */
  command?: string;
  /** Custom environment variables */
  env?: Record<string, string>;
  /**
   * Static context prepended to every user prompt before it reaches the agent CLI.
   * Use this to prime the agent with workspace conventions, rules, or instructions
   * that should apply to every conversation.
   * Combined with any runtime-generated context (e.g. cloned repo list).
   */
  systemContext?: string;
  /** Agent runtime type */
  type: 'claude-code' | 'codex';
}

/**
 * Agent agency configuration.
 * Contains settings for agent execution modes and device binding.
 */
export interface LobeAgentAgencyConfig {
  boundDeviceId?: string;
  heterogeneousProvider?: HeterogeneousProviderConfig;
}
