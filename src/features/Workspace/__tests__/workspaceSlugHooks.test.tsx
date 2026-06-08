import { renderHook } from '@testing-library/react';
import { type ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as workspaceStoreModule from '@/store/workspace';
import { workspaceSelectors } from '@/store/workspace';

import { useWorkspaceFromSlug } from '../useWorkspaceFromSlug';
import { useWorkspaceUrlSync } from '../useWorkspaceUrlSync';

interface WorkspaceStateMock {
  activeWorkspaceId: null | string;
  isWorkspaceLoading: boolean;
  switchToPersonal: () => void;
  switchWorkspace: (id: string) => void;
  workspaces: { id: string; slug: string }[];
}

const createState = (overrides: Partial<WorkspaceStateMock> = {}): WorkspaceStateMock => ({
  activeWorkspaceId: null,
  isWorkspaceLoading: false,
  switchToPersonal: vi.fn(),
  switchWorkspace: vi.fn(),
  workspaces: [{ id: 'ws-1', slug: 'acme' }],
  ...overrides,
});

const mockWorkspaceStore = (state: WorkspaceStateMock) => {
  vi.spyOn(workspaceStoreModule, 'useWorkspaceStore').mockImplementation((selector?: any) =>
    selector ? selector(state) : state,
  );
  vi.spyOn(workspaceSelectors, 'workspaces').mockImplementation((s: any) => s.workspaces);
  vi.spyOn(workspaceSelectors, 'isLoading').mockImplementation((s: any) => s.isWorkspaceLoading);
  vi.spyOn(workspaceSelectors, 'activeWorkspaceId').mockImplementation(
    (s: any) => s.activeWorkspaceId,
  );
};

const createRouteWrapper =
  (initialEntry: string, path = '/:workspaceSlug/*') =>
  ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route element={children} path={path} />
      </Routes>
    </MemoryRouter>
  );

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useWorkspaceFromSlug', () => {
  it('returns ok when the URL slug matches a workspace', () => {
    mockWorkspaceStore(createState());

    const { result } = renderHook(() => useWorkspaceFromSlug(), {
      wrapper: createRouteWrapper('/acme/settings'),
    });

    expect(result.current).toEqual({ slug: 'acme', status: 'ok', workspaceId: 'ws-1' });
  });

  it('returns loading for an unknown slug while workspaces are loading', () => {
    mockWorkspaceStore(createState({ isWorkspaceLoading: true, workspaces: [] }));

    const { result } = renderHook(() => useWorkspaceFromSlug(), {
      wrapper: createRouteWrapper('/acme/settings'),
    });

    expect(result.current).toEqual({ slug: 'acme', status: 'loading' });
  });

  it('returns not-found for an unknown slug after loading completes', () => {
    mockWorkspaceStore(createState({ workspaces: [] }));

    const { result } = renderHook(() => useWorkspaceFromSlug(), {
      wrapper: createRouteWrapper('/missing/settings'),
    });

    expect(result.current).toEqual({ slug: 'missing', status: 'not-found' });
  });

  it('returns no-slug outside the workspace route tree', () => {
    mockWorkspaceStore(createState());

    const { result } = renderHook(() => useWorkspaceFromSlug(), {
      wrapper: createRouteWrapper('/settings/profile', '/settings/*'),
    });

    expect(result.current).toEqual({ status: 'no-slug' });
  });
});

describe('useWorkspaceUrlSync', () => {
  it('switches to the workspace when the first segment is a known slug', () => {
    const state = createState();
    mockWorkspaceStore(state);

    renderHook(() => useWorkspaceUrlSync(), {
      wrapper: createRouteWrapper('/acme/agent/inbox', '*'),
    });

    expect(state.switchWorkspace).toHaveBeenCalledWith('ws-1');
    expect(state.switchToPersonal).not.toHaveBeenCalled();
  });

  it('does not switch while the workspace list is loading', () => {
    const state = createState({ isWorkspaceLoading: true });
    mockWorkspaceStore(state);

    renderHook(() => useWorkspaceUrlSync(), {
      wrapper: createRouteWrapper('/acme/agent/inbox', '*'),
    });

    expect(state.switchWorkspace).not.toHaveBeenCalled();
    expect(state.switchToPersonal).not.toHaveBeenCalled();
  });

  it('leaves the current workspace untouched for an unknown slug', () => {
    const state = createState({ activeWorkspaceId: 'ws-1' });
    mockWorkspaceStore(state);

    renderHook(() => useWorkspaceUrlSync(), {
      wrapper: createRouteWrapper('/unknown/agent/inbox', '*'),
    });

    expect(state.switchWorkspace).not.toHaveBeenCalled();
    expect(state.switchToPersonal).not.toHaveBeenCalled();
  });

  it('switches to personal mode on reserved personal routes', () => {
    const state = createState({ activeWorkspaceId: 'ws-1' });
    mockWorkspaceStore(state);

    renderHook(() => useWorkspaceUrlSync(), {
      wrapper: createRouteWrapper('/settings/profile', '*'),
    });

    expect(state.switchToPersonal).toHaveBeenCalled();
    expect(state.switchWorkspace).not.toHaveBeenCalled();
  });
});
