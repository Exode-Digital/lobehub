import {
  getServiceModelPolicy,
  isServiceModelCandidateAllowed,
  resolveServiceModelFallback,
} from '@lobechat/const';
import type { SystemAgentItem, UserServiceModelConfigKey } from '@lobechat/types';

import { getAiInfraStoreState } from '@/store/aiInfra';
import type { EnabledProviderWithModels } from '@/types/aiProvider';

interface ResolveClientServiceModelLists {
  chatList?: EnabledProviderWithModels[];
  embeddingList?: EnabledProviderWithModels[];
}

type ResolvedServiceModelConfig = Pick<SystemAgentItem, 'model' | 'provider'>;

export const resolveClientServiceModelConfig = (
  key: UserServiceModelConfigKey,
  config: SystemAgentItem | undefined,
  lists?: ResolveClientServiceModelLists,
): ResolvedServiceModelConfig | undefined => {
  if (!config) return;

  const policy = getServiceModelPolicy(key);

  if (!policy) return config;

  const state = getAiInfraStoreState();
  const candidates =
    policy.source === 'embedding'
      ? (lists?.embeddingList ?? state.enabledEmbeddingModelList ?? [])
      : (lists?.chatList ?? state.enabledChatModelList ?? []);

  const hasSavedCandidate = candidates.some(
    (provider) =>
      provider.id === config.provider &&
      provider.children.some((model) => model.id === config.model),
  );

  if (hasSavedCandidate && isServiceModelCandidateAllowed(policy, config)) {
    return {
      model: config.model,
      provider: config.provider,
    };
  }

  const fallback = resolveServiceModelFallback(policy, candidates);

  if (fallback) {
    console.warn('[ServiceModelPolicy] resolved fallback model', { fallback, key });
    return fallback;
  }

  if (policy.invalidSelection === 'empty') return;

  console.warn('[ServiceModelPolicy] no allowed fallback model, keeping saved config', {
    config,
    key,
  });
  return {
    model: config.model,
    provider: config.provider,
  };
};
