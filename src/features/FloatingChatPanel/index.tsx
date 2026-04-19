'use client';

import { type UIChatMessage } from '@lobechat/types';
import { FloatingSheet, type FloatingSheetProps } from '@lobehub/ui/base-ui';
import { createStaticStyles } from 'antd-style';
import type { ReactNode } from 'react';
import { memo, useMemo, useState } from 'react';

import { type ActionsBarConfig, ConversationProvider } from '@/features/Conversation';
import { type ConversationContext } from '@/features/Conversation/types';
import { useOperationState } from '@/hooks/useOperationState';
import { useActionsBarConfig } from '@/routes/(main)/agent/features/Conversation/useActionsBarConfig';
import { useChatStore } from '@/store/chat';
import { messageMapKey } from '@/store/chat/utils/messageMapKey';

import ChatBody from './ChatBody';
import { useSingleInstanceGuard } from './guard';

const styles = createStaticStyles(({ css }) => ({
  sheet: css`
    overflow: hidden;
    display: flex;
    flex: 1;
    flex-direction: column;

    min-height: 0;
  `,
  header: css`
    display: flex;
    flex-shrink: 0;
    gap: 8px;
    align-items: center;
    justify-content: space-between;
  `,
  title: css`
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  body: css`
    overflow: hidden;
    display: flex;
    flex-direction: column;

    width: 100%;
    height: 100%;
    min-height: 0;
  `,
}));

export interface FloatingChatPanelProps {
  /**
   * Override the actions bar config. When omitted, defaults to the shared
   * `useActionsBarConfig()` hook for parity with the main agent page.
   */
  actionsBar?: ActionsBarConfig;
  activeSnapPoint?: number;
  /** Agent identifier. */
  agentId: string;
  className?: string;
  dismissible?: boolean;
  headerActions?: ReactNode;
  maxHeight?: number;
  minHeight?: number;
  mode?: 'embedded' | 'overlay';
  onOpenChange?: (open: boolean) => void;
  onSnapPointChange?: (point: number) => void;
  open?: boolean;
  snapPoints?: number[];
  /** Optional thread identifier. When provided, scope becomes `'thread'`. */
  threadId?: string | null;
  title?: ReactNode;
  /** Topic identifier. `null` means a new / unpersisted conversation. */
  topicId: string | null;
  variant?: 'elevated' | 'embedded';
  width?: number | string;
}

/**
 * FloatingChatPanel
 *
 * A reusable floating conversation panel. Composes ChatList + MainChatInput inside
 * a container shell. Consumers provide conversation coordinates via flat
 * `agentId`/`topicId` props; the component builds its own `ConversationContext`
 * internally.
 *
 * @FIXME ⚠️ Single instance per page. Mounting a second FloatingChatPanel while one is
 * already mounted will throw. See `./guard.ts` for the rationale.
 *
 * @FIXME ⚠️ Must not coexist with the main-page ConversationArea (both use MainChatInput,
 * which writes to the global `useChatStore.mainInputEditor` slot). This is NOT
 * enforced at runtime — consumer responsibility.
 */
const FloatingChatPanel = memo<FloatingChatPanelProps>(
  ({
    agentId,
    topicId,
    threadId = null,
    actionsBar,

    minHeight = 240,
    maxHeight = 0.9,

    width = '100%',

    title,
    headerActions,
  }) => {
    useSingleInstanceGuard();

    const context = useMemo<ConversationContext>(
      () => ({
        agentId,
        scope: threadId ? 'thread' : 'main',
        threadId,
        topicId,
      }),
      [agentId, topicId, threadId],
    );

    const chatKey = useMemo(() => messageMapKey(context), [context]);
    const messages = useChatStore((s) => s.dbMessagesMap[chatKey]);
    const replaceMessages = useChatStore((s) => s.replaceMessages);

    const operationState = useOperationState(context);
    const defaultActionsBar = useActionsBarConfig();
    const resolvedActionsBar = actionsBar ?? defaultActionsBar;

    const handleMessagesChange = useMemo(
      () => (next: UIChatMessage[], ctx: ConversationContext) => {
        replaceMessages(next, { context: ctx });
      },
      [replaceMessages],
    );

    const [open, setOpen] = useState(true);
    const sheetProps: FloatingSheetProps = {
      className: 'floating-sheet-demo-inline',
      closeThreshold: 0.3,
      defaultOpen: true,
      dismissible: false,

      maxHeight: 520,
      minHeight: 320,
      mode: 'inline',
      onOpenChange: setOpen,
      open,
      restingHeight: 180,
      snapPoints: [180, 320, 520],

      variant: 'embedded',
      width: '100%',
    };

    return (
      <FloatingSheet {...sheetProps}>
        <div className={styles.body}>
          <ConversationProvider
            actionsBar={resolvedActionsBar}
            context={context}
            hasInitMessages={!!messages}
            messages={messages}
            operationState={operationState}
            onMessagesChange={handleMessagesChange}
          >
            <ChatBody />
          </ConversationProvider>
        </div>
      </FloatingSheet>
    );
  },
);

FloatingChatPanel.displayName = 'FloatingChatPanel';

export default FloatingChatPanel;
