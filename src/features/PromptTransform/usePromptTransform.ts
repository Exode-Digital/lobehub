import { chainRewriteGenerationPrompt, chainTranslate } from '@lobechat/prompts';
import type { SystemAgentItem } from '@lobechat/types';
import { useCallback, useState } from 'react';

import { chatService } from '@/services/chat';
import { resolveClientServiceModelConfig } from '@/services/serviceModelPolicy/client';
import { useUserStore } from '@/store/user';
import { systemAgentSelectors } from '@/store/user/selectors';
import { merge } from '@/utils/merge';

interface UsePromptTransformParams {
  mode: 'image' | 'video' | 'text';
  onPromptChange: (prompt: string) => void;
  prompt?: string | null;
}

type PromptTransformAction = 'rewrite' | 'translate';
type PromptTransformModelConfig = Partial<Pick<SystemAgentItem, 'model' | 'provider'>>;

export const usePromptTransform = ({ mode, prompt, onPromptChange }: UsePromptTransformParams) => {
  const [isTransforming, setIsTransforming] = useState(false);
  const [transformAction, setTransformAction] = useState<PromptTransformAction>('rewrite');

  const rewriteConfig = useUserStore(systemAgentSelectors.promptRewrite);
  const translateConfig = useUserStore(systemAgentSelectors.translation);
  const isRewriteActionEnabled = rewriteConfig?.enabled ?? false;

  const getConfigByAction = useCallback(
    (action: PromptTransformAction): PromptTransformModelConfig => {
      // Strip config-only fields (enabled, customPrompt); strict upstreams reject unknown OpenAI params.
      const config = action === 'rewrite' ? rewriteConfig : translateConfig;
      const resolved = resolveClientServiceModelConfig(
        action === 'rewrite' ? 'promptRewrite' : 'translation',
        config,
      );
      return resolved ?? {};
    },
    [rewriteConfig, translateConfig],
  );

  const runTransform = useCallback(
    async (action: PromptTransformAction) => {
      if (isTransforming || !prompt?.trim()) return;
      if (action === 'rewrite' && !isRewriteActionEnabled) return;

      const selectedConfig = getConfigByAction(action);
      if (!selectedConfig.model || !selectedConfig.provider) return;

      let transformedPrompt = '';
      setTransformAction(action);

      try {
        await chatService.fetchPresetTaskResult({
          onError: () => {
            setIsTransforming(false);
          },
          onFinish: async (text) => {
            const nextPrompt = text.trim() || transformedPrompt.trim();
            if (nextPrompt) onPromptChange(nextPrompt);
          },
          onLoadingChange: setIsTransforming,
          onMessageHandle: (chunk) => {
            if (chunk.type === 'text') transformedPrompt += chunk.text;
          },
          params: merge(
            selectedConfig,
            action === 'rewrite'
              ? chainRewriteGenerationPrompt({
                  mode,
                  prompt,
                })
              : chainTranslate(prompt, 'English'),
          ),
        });
      } finally {
        setIsTransforming(false);
        setTransformAction('rewrite');
      }
    },
    [getConfigByAction, isRewriteActionEnabled, isTransforming, mode, onPromptChange, prompt],
  );

  const rewritePrompt = useCallback(async () => {
    await runTransform('rewrite');
  }, [runTransform]);

  const translatePrompt = useCallback(async () => {
    await runTransform('translate');
  }, [runTransform]);

  return {
    isRewriteEnabled: isRewriteActionEnabled,
    isTransformDisabled: !prompt?.trim(),
    isTransforming,
    rewritePrompt,
    transformAction,
    translatePrompt,
  };
};
