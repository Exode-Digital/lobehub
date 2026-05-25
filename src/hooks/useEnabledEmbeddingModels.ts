import isEqual from 'fast-deep-equal';

import { useAiInfraStore } from '@/store/aiInfra';
import type { EnabledProviderWithModels } from '@/types/aiProvider';

export const useEnabledEmbeddingModels = (): EnabledProviderWithModels[] => {
  const enabledEmbeddingModelList = useAiInfraStore((s) => s.enabledEmbeddingModelList, isEqual);

  return enabledEmbeddingModelList || [];
};
