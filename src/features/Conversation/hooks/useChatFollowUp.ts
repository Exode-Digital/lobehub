import { type LobeAgentChatConfig } from '@lobechat/types';
import { useMemo } from 'react';

import { useEnabledChatModels } from '@/hooks/useEnabledChatModels';
import { resolveClientServiceModelConfig } from '@/services/serviceModelPolicy/client';
import { useFollowUpActionStore } from '@/store/followUpAction';
import { useUserStore } from '@/store/user';
import { systemAgentSelectors } from '@/store/user/slices/settings/selectors/systemAgent';

import { type ConversationHooks } from '../types';

interface UseChatFollowUpParams {
  agentChatConfig: LobeAgentChatConfig | undefined;
  conversationKey: string | undefined;
  threadId?: string;
  topicId: string | undefined;
}

/**
 * Wire the chat-side Follow-up Chips lifecycle.
 *
 * Effective enable = `systemAgent.followUpAction.enabled` AND a valid global
 * model/provider AND per-agent `chatConfig.enableFollowUpChips` — otherwise
 * returns an empty `ConversationHooks` object so the merge chain treats it as
 * identity.
 *
 * Registration ordering note: callers MUST compose this hook LAST in a
 * `mergeConversationHooks(...)` chain. The hook's
 * `onBeforeSendMessage`/`onBeforeContinue`/`onBeforeRegenerate` clear the chip
 * slot; if a preceding validator returns `false`, the chain short-circuits
 * before the clear runs and chips persist for the blocked send.
 */
export const useChatFollowUp = ({
  agentChatConfig,
  conversationKey,
  threadId,
  topicId,
}: UseChatFollowUpParams): ConversationHooks => {
  const globalConfig = useUserStore(systemAgentSelectors.followUpAction);
  const enabledChatModels = useEnabledChatModels();
  const resolvedConfig = useMemo(() => {
    if (!globalConfig.model || !globalConfig.provider) return;

    return resolveClientServiceModelConfig('followUpAction', globalConfig, {
      chatList: enabledChatModels,
    });
  }, [enabledChatModels, globalConfig.model, globalConfig.provider]);

  const effective = useMemo(() => {
    const globalEnabled = globalConfig.enabled === true;
    const hasValidModel = !!resolvedConfig?.model && !!resolvedConfig.provider;
    const perAgentEnabled = agentChatConfig?.enableFollowUpChips === true;
    return globalEnabled && hasValidModel && perAgentEnabled;
  }, [
    globalConfig.enabled,
    resolvedConfig?.model,
    resolvedConfig?.provider,
    agentChatConfig?.enableFollowUpChips,
  ]);

  return useMemo<ConversationHooks>(() => {
    if (!effective || !conversationKey || !topicId || !resolvedConfig) return {};

    const clearSlot = () => useFollowUpActionStore.getState().clear(conversationKey);

    return {
      onAssistantTurnSettled: async (_messageId, { reason }) => {
        if (reason === 'stopped') return;
        await useFollowUpActionStore.getState().fetchFor(conversationKey, {
          hint: { kind: 'chat' },
          modelConfig: { model: resolvedConfig.model, provider: resolvedConfig.provider },
          threadId,
          topicId,
        });
      },
      onBeforeContinue: async () => {
        clearSlot();
      },
      onBeforeRegenerate: async () => {
        clearSlot();
      },
      onBeforeSendMessage: async () => {
        clearSlot();
      },
    };
  }, [effective, conversationKey, resolvedConfig, threadId, topicId]);
};
