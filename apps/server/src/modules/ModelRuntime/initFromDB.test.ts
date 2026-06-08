import { describe, expect, it, vi } from 'vitest';

const mockGetAiProviderById = vi.hoisted(() => vi.fn());
const mockAiProviderModel = vi.hoisted(() => vi.fn());
const mockInitializeWithProvider = vi.hoisted(() => vi.fn());

vi.mock('@/database/models/aiProvider', () => ({
  AiProviderModel: mockAiProviderModel.mockImplementation(() => ({
    getAiProviderById: mockGetAiProviderById,
  })),
}));

vi.mock('@/business/server/model-runtime', () => ({
  getBusinessModelRuntimeHooks: vi.fn(),
}));

vi.mock('@/envs/llm', () => ({
  getLLMConfig: vi.fn(() => ({ OPENAI_API_KEY: 'env-key' })),
}));

vi.mock('@/server/services/llmGenerationTracing/hook', () => ({
  createLLMGenerationTracingHook: vi.fn(),
}));

vi.mock('../KeyVaultsEncrypt', () => ({
  KeyVaultsGateKeeper: {
    getUserKeyVaults: vi.fn(),
  },
}));

vi.mock('./apiKeyManager', () => ({
  default: {
    pick: (value: string) => value,
  },
}));

vi.mock('@lobechat/model-runtime', () => ({
  mergeModelRuntimeHooks: vi.fn(),
  ModelRuntime: {
    initializeWithProvider: mockInitializeWithProvider,
  },
}));

vi.mock('@lobechat/model-runtime/vertexai', () => ({
  LobeVertexAI: {
    initFromVertexAI: vi.fn(),
  },
}));

const { initModelRuntimeFromDB } = await import('./index');

describe('initModelRuntimeFromDB', () => {
  it('passes workspaceId to AiProviderModel when reading provider config', async () => {
    const db = {} as any;
    mockGetAiProviderById.mockResolvedValue({
      keyVaults: { apiKey: 'user-key' },
      settings: {},
    });
    mockInitializeWithProvider.mockReturnValue({ chat: vi.fn() });

    await initModelRuntimeFromDB(db, 'user-1', 'openai', 'workspace-1');

    expect(mockAiProviderModel).toHaveBeenCalledWith(db, 'user-1', 'workspace-1');
  });
});
