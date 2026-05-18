/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Nav from './Nav';

const mutateMock = vi.hoisted(() => vi.fn());
const openNewTopicOrSaveTopicMock = vi.hoisted(() => vi.fn());
const pushMock = vi.hoisted(() => vi.fn());
const switchTopicMock = vi.hoisted(() => vi.fn());
const toggleCommandMenuMock = vi.hoisted(() => vi.fn());
const useParamsMock = vi.hoisted(() => vi.fn());
const usePathnameMock = vi.hoisted(() => vi.fn());
const agentStoreMock = vi.hoisted(() => ({
  activeAgentId: undefined as string | undefined,
  heterogeneousProviderType: undefined as string | undefined,
}));

vi.mock('@lobehub/ui', () => ({
  Flexbox: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => (
    <div {...props}>{children}</div>
  ),
}));

vi.mock('@lobehub/ui/icons', () => ({
  BotPromptIcon: () => null,
}));

vi.mock('lucide-react', () => ({
  MessageSquarePlusIcon: () => null,
  RadioTowerIcon: () => null,
  SearchIcon: () => null,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('react-router-dom', async () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = (await vi.importActual('react-router-dom')) as typeof import('react-router-dom');

  return {
    ...actual,
    useParams: useParamsMock,
  };
});

vi.mock('@/const/url', () => ({
  SESSION_CHAT_URL: (agentId: string) => `/agent/${agentId}`,
}));

vi.mock('@/features/NavPanel/components/NavItem', () => ({
  default: ({
    active,
    onClick,
    title,
  }: {
    active?: boolean;
    onClick?: () => void;
    title: ReactNode;
  }) => (
    <button data-active={String(active)} type="button" onClick={onClick}>
      {title}
    </button>
  ),
}));

vi.mock('@/hooks/useQueryRoute', () => ({
  useQueryRoute: () => ({
    push: pushMock,
  }),
}));

vi.mock('@/libs/router/navigation', () => ({
  usePathname: usePathnameMock,
}));

vi.mock('@/libs/swr', () => ({
  useActionSWR: () => ({
    mutate: mutateMock,
  }),
}));

vi.mock('@/store/agent', () => ({
  useAgentStore: (selector: (state: typeof agentStoreMock) => unknown) => selector(agentStoreMock),
}));

vi.mock('@/store/agent/selectors', () => ({
  agentSelectors: {
    currentAgentHeterogeneousProviderType: (state: typeof agentStoreMock) =>
      state.heterogeneousProviderType,
  },
}));

vi.mock('@/store/chat', () => ({
  useChatStore: (
    selector: (state: {
      openNewTopicOrSaveTopic: () => void;
      switchTopic: (topicId: string | null, options?: unknown) => void;
    }) => unknown,
  ) =>
    selector({
      openNewTopicOrSaveTopic: openNewTopicOrSaveTopicMock,
      switchTopic: switchTopicMock,
    }),
}));

vi.mock('@/store/global', () => ({
  useGlobalStore: (selector: (state: { toggleCommandMenu: (open: boolean) => void }) => unknown) =>
    selector({ toggleCommandMenu: toggleCommandMenuMock }),
}));

vi.mock('@/store/serverConfig', () => ({
  featureFlagsSelectors: (state: { featureFlags: { isAgentEditable: boolean } }) =>
    state.featureFlags,
  useServerConfigStore: (
    selector: (state: { featureFlags: { isAgentEditable: boolean } }) => unknown,
  ) => selector({ featureFlags: { isAgentEditable: true } }),
}));

describe('Agent sidebar header nav', () => {
  beforeEach(() => {
    mutateMock.mockReset();
    openNewTopicOrSaveTopicMock.mockReset();
    pushMock.mockReset();
    switchTopicMock.mockReset();
    toggleCommandMenuMock.mockReset();
    useParamsMock.mockReset();
    usePathnameMock.mockReset();
    agentStoreMock.activeAgentId = undefined;
    agentStoreMock.heterogeneousProviderType = undefined;

    useParamsMock.mockReturnValue({ aid: 'agt_eH4zL98zBx5u', topicId: 'tpc_2FCHvjS7d4CA' });
  });

  it('returns to the agent chat route before opening a new topic from a topic page document route', () => {
    usePathnameMock.mockReturnValue(
      '/agent/agt_eH4zL98zBx5u/tpc_2FCHvjS7d4CA/page/docs_9B8hFkmEOZyPZb60',
    );

    render(<Nav />);

    fireEvent.click(screen.getByRole('button', { name: 'actions.addNewTopic' }));

    expect(pushMock).toHaveBeenCalledWith('/agent/agt_eH4zL98zBx5u');
    expect(mutateMock).toHaveBeenCalledTimes(1);
  });

  it('pushes the agent chat route even when already on it', () => {
    usePathnameMock.mockReturnValue('/agent/agt_eH4zL98zBx5u');

    render(<Nav />);

    fireEvent.click(screen.getByRole('button', { name: 'actions.addNewTopic' }));

    expect(pushMock).toHaveBeenCalledWith('/agent/agt_eH4zL98zBx5u');
    expect(mutateMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to the active agent when retained on a task route without an agent param', () => {
    agentStoreMock.activeAgentId = 'agt_from_task';
    useParamsMock.mockReturnValue({});
    usePathnameMock.mockReturnValue('/task/T-1');

    render(<Nav />);

    fireEvent.click(screen.getByRole('button', { name: 'actions.addNewTopic' }));
    fireEvent.click(screen.getByRole('button', { name: 'tab.profile' }));
    fireEvent.click(screen.getByRole('button', { name: 'tab.integration' }));

    expect(pushMock).toHaveBeenNthCalledWith(1, '/agent/agt_from_task');
    expect(pushMock).toHaveBeenNthCalledWith(2, '/agent/agt_from_task/profile');
    expect(pushMock).toHaveBeenNthCalledWith(3, '/agent/agt_from_task/channel');
    expect(mutateMock).toHaveBeenCalledTimes(1);
    expect(switchTopicMock).toHaveBeenCalledTimes(2);
    expect(switchTopicMock).toHaveBeenNthCalledWith(1, null, { skipRefreshMessage: true });
    expect(switchTopicMock).toHaveBeenNthCalledWith(2, null, { skipRefreshMessage: true });
  });

  it('keeps channel visible for Claude Code heterogeneous agents', () => {
    agentStoreMock.heterogeneousProviderType = 'claude-code';
    usePathnameMock.mockReturnValue('/agent/agt_eH4zL98zBx5u');

    render(<Nav />);

    expect(screen.getByRole('button', { name: 'tab.integration' })).toBeInTheDocument();
  });

  it('hides channel for non-Claude Code heterogeneous agents', () => {
    agentStoreMock.heterogeneousProviderType = 'codex';
    usePathnameMock.mockReturnValue('/agent/agt_eH4zL98zBx5u');

    render(<Nav />);

    expect(screen.queryByRole('button', { name: 'tab.integration' })).not.toBeInTheDocument();
  });
});
