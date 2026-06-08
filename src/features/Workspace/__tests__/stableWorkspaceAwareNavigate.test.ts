import { afterEach, describe, expect, it, vi } from 'vitest';

import { workspaceSelectors } from '@/store/workspace';
import * as stableNavigateModule from '@/utils/stableNavigate';

import { stableWorkspaceAwareNavigate } from '../stableWorkspaceAwareNavigate';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('stableWorkspaceAwareNavigate', () => {
  it('prefixes the path with the active workspace slug', () => {
    const navigate = vi.fn();
    vi.spyOn(stableNavigateModule, 'getStableNavigate').mockReturnValue(navigate);
    vi.spyOn(workspaceSelectors, 'activeWorkspace').mockReturnValue({ slug: 'acme' } as any);

    stableWorkspaceAwareNavigate('/group/group-1');

    expect(navigate).toHaveBeenCalledWith('/acme/group/group-1', {});
  });

  it('leaves the path unchanged in personal mode (no active workspace)', () => {
    const navigate = vi.fn();
    vi.spyOn(stableNavigateModule, 'getStableNavigate').mockReturnValue(navigate);
    // default mock: activeWorkspace() === null

    stableWorkspaceAwareNavigate('/group/group-1');

    expect(navigate).toHaveBeenCalledWith('/group/group-1', {});
  });

  it('bypasses prefixing when escape is set', () => {
    const navigate = vi.fn();
    vi.spyOn(stableNavigateModule, 'getStableNavigate').mockReturnValue(navigate);
    vi.spyOn(workspaceSelectors, 'activeWorkspace').mockReturnValue({ slug: 'acme' } as any);

    stableWorkspaceAwareNavigate('/group/group-1', { escape: true });

    expect(navigate).toHaveBeenCalledWith('/group/group-1', {});
  });

  it('no-ops when the navigate ref is not yet registered', () => {
    vi.spyOn(stableNavigateModule, 'getStableNavigate').mockReturnValue(null);
    const activeWorkspace = vi.spyOn(workspaceSelectors, 'activeWorkspace');

    expect(() => stableWorkspaceAwareNavigate('/group/group-1')).not.toThrow();
    expect(activeWorkspace).not.toHaveBeenCalled();
  });
});
