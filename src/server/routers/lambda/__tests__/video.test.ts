import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AsyncTaskModel } from '@/database/models/asyncTask';
import { FileService } from '@/server/services/file';
import { AsyncTaskStatus } from '@/types/asyncTask';

// ---- hoisted mocks (available inside vi.mock factories) ----

const {
  mockAfter,
  mockCreateVideo,
  mockProcessBackgroundVideoPolling,
  mockResolveBusinessModelMapping,
  mockServerDB,
  mockTransaction,
} = vi.hoisted(() => {
  const mockTransaction = vi.fn();
  const mockServerDB = { transaction: mockTransaction };
  const mockCreateVideo = vi.fn();
  const mockAfter = vi.fn((cb: () => void) => cb());
  const mockProcessBackgroundVideoPolling = vi.fn().mockResolvedValue(undefined);
  const mockResolveBusinessModelMapping = vi.fn();
  return {
    mockAfter,
    mockCreateVideo,
    mockProcessBackgroundVideoPolling,
    mockResolveBusinessModelMapping,
    mockServerDB,
    mockTransaction,
  };
});

// ---- module-level mocks ----

vi.mock('@/database/models/asyncTask');
vi.mock('@/server/services/file');

vi.mock('@/database/core/db-adaptor', () => ({
  getServerDB: vi.fn().mockResolvedValue(mockServerDB),
}));
vi.mock('@/database/server', () => ({
  getServerDB: vi.fn().mockResolvedValue(mockServerDB),
}));
vi.mock('@/server/modules/ModelRuntime', () => ({
  initModelRuntimeFromDB: vi.fn().mockResolvedValue({ createVideo: mockCreateVideo }),
}));
vi.mock('@/business/server/video-generation/chargeBeforeGenerate', () => ({
  chargeBeforeGenerate: vi.fn().mockResolvedValue({ errorBatch: null, prechargeResult: null }),
}));
vi.mock('@/business/server/video-generation/chargeAfterGenerate', () => ({
  chargeAfterGenerate: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@lobechat/business-model-runtime', async (importOriginal) => ({
  ...((await importOriginal()) as any),
  resolveBusinessModelMapping: (...args: [string, string]) =>
    mockResolveBusinessModelMapping(...args),
}));
vi.mock('@/business/server/video-generation/getVideoFreeQuota', () => ({
  getVideoFreeQuota: vi.fn().mockResolvedValue({ remaining: 10 }),
}));
vi.mock('next/server', () => ({ after: (cb: () => void) => mockAfter(cb) }));
vi.mock('@/server/services/generation/videoBackgroundPolling', () => ({
  processBackgroundVideoPolling: mockProcessBackgroundVideoPolling,
}));
vi.mock('@/envs/app', () => ({
  appEnv: { APP_URL: 'https://app.example.com' },
}));
vi.mock('debug', () => ({ default: vi.fn(() => vi.fn()) }));

// ---- helpers ----

const defaultInput = {
  generationTopicId: 'topic-1',
  model: 'test-model',
  params: { prompt: 'a cat dancing' },
  provider: 'volcengine',
};

const txResult = {
  asyncTaskCreatedAt: new Date('2026-01-01'),
  asyncTaskId: 'async-1',
  batch: { id: 'batch-1' },
  generation: { id: 'gen-1' },
};

// Minimal drizzle-like chain mocks
function createInsertChain() {
  return vi.fn().mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi
        .fn()
        .mockResolvedValueOnce([txResult.batch])
        .mockResolvedValueOnce([txResult.generation])
        .mockResolvedValueOnce([
          { id: txResult.asyncTaskId, createdAt: txResult.asyncTaskCreatedAt },
        ]),
    }),
  });
}

const mockDbUpdate = vi.fn().mockReturnValue({
  set: vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue(undefined),
  }),
});

function setupMocks() {
  const mockUpdate = vi.fn().mockResolvedValue(undefined);

  vi.mocked(AsyncTaskModel).mockImplementation(() => ({ update: mockUpdate }) as any);
  vi.mocked(FileService).mockImplementation(
    () =>
      ({
        getFullFileUrl: vi.fn().mockResolvedValue(null),
        getKeyFromFullUrl: vi.fn().mockResolvedValue(null),
      }) as any,
  );

  const mockInsert = createInsertChain();
  mockTransaction.mockImplementation(async (cb: any) =>
    cb({ insert: mockInsert, update: mockDbUpdate }),
  );

  return { mockUpdate };
}

// ---- import router AFTER mocks are set up ----

const { videoRouter } = await import('../video');

// ---- tests ----

describe('videoRouter', () => {
  const mockCtx = { userId: 'test-user' };

  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveBusinessModelMapping.mockImplementation(
      async (_provider: string, model: string) => ({
        resolvedModelId: model,
      }),
    );
  });

  describe('createVideo - async strategy routing', () => {
    it('should use webhook path when response contains useWebhook: true', async () => {
      const { mockUpdate } = setupMocks();
      mockCreateVideo.mockResolvedValue({ inferenceId: 'inf-1', useWebhook: true });

      const caller = videoRouter.createCaller(mockCtx);
      const result = await caller.createVideo(defaultInput);

      expect(result.success).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith('async-1', {
        inferenceId: 'inf-1',
        status: AsyncTaskStatus.Processing,
      });
      // Webhook: should NOT trigger background polling
      expect(mockAfter).not.toHaveBeenCalled();
    });

    it('should validate mapped model id before rejecting deprecated lobehub video models', async () => {
      setupMocks();
      mockResolveBusinessModelMapping.mockResolvedValue({
        requestedModelId: 'onboarding-video',
        resolvedModelId: 'dreamina-seedance-2-0-260128',
      });
      mockCreateVideo.mockResolvedValue({ inferenceId: 'inf-mapped', useWebhook: true });

      const caller = videoRouter.createCaller(mockCtx);
      const result = await caller.createVideo({
        ...defaultInput,
        model: 'onboarding-video',
        provider: 'lobehub',
      });

      expect(result.success).toBe(true);
      expect(mockResolveBusinessModelMapping).toHaveBeenCalledWith('lobehub', 'onboarding-video');
      expect(mockCreateVideo).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'dreamina-seedance-2-0-260128' }),
        expect.any(Object),
      );
    });

    it('should use polling path when response contains only inferenceId', async () => {
      const { mockUpdate } = setupMocks();
      mockCreateVideo.mockResolvedValue({ inferenceId: 'inf-2' });

      const caller = videoRouter.createCaller(mockCtx);
      const result = await caller.createVideo(defaultInput);

      expect(result.success).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith('async-1', {
        inferenceId: 'inf-2',
        status: AsyncTaskStatus.Processing,
      });
      // Polling: should trigger background polling via after()
      expect(mockAfter).toHaveBeenCalled();
      expect(mockProcessBackgroundVideoPolling).toHaveBeenCalled();
    });

    it('should use polling path when response contains videoUrl (no special handling)', async () => {
      const { mockUpdate } = setupMocks();
      mockCreateVideo.mockResolvedValue({
        inferenceId: 'inf-3',
        videoUrl: 'https://cdn.example.com/video.mp4',
      });

      const caller = videoRouter.createCaller(mockCtx);
      const result = await caller.createVideo(defaultInput);

      expect(result.success).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith('async-1', {
        inferenceId: 'inf-3',
        status: AsyncTaskStatus.Processing,
      });
      // No special videoUrl branch — falls through to polling
      expect(mockAfter).toHaveBeenCalled();
      expect(mockProcessBackgroundVideoPolling).toHaveBeenCalled();
    });

    it('should fall through to polling when useWebhook is false', async () => {
      setupMocks();
      mockCreateVideo.mockResolvedValue({ inferenceId: 'inf-4', useWebhook: false });

      const caller = videoRouter.createCaller(mockCtx);
      await caller.createVideo(defaultInput);

      // useWebhook=false means not webhook, should fall to polling
      expect(mockAfter).toHaveBeenCalled();
      expect(mockProcessBackgroundVideoPolling).toHaveBeenCalled();
    });
  });

  describe('createVideo - error handling', () => {
    it('should set error status when createVideo throws', async () => {
      const { mockUpdate } = setupMocks();
      mockCreateVideo.mockRejectedValue(new Error('API timeout'));

      const caller = videoRouter.createCaller(mockCtx);
      const result = await caller.createVideo(defaultInput);

      // Batch was already created, so still returns success structure
      expect(result.success).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith(
        'async-1',
        expect.objectContaining({ status: AsyncTaskStatus.Error }),
      );
    });
  });

  describe('createVideo - pre-charge', () => {
    it('should return error batch when pre-charge fails', async () => {
      setupMocks();
      const { chargeBeforeGenerate } =
        await import('@/business/server/video-generation/chargeBeforeGenerate');
      vi.mocked(chargeBeforeGenerate).mockResolvedValueOnce({
        errorBatch: { error: 'insufficient_balance' } as any,
        prechargeResult: undefined,
      });

      const caller = videoRouter.createCaller(mockCtx);
      const result = await caller.createVideo(defaultInput);

      expect(result).toEqual({ error: 'insufficient_balance' });
      // Should not proceed to createVideo
      expect(mockCreateVideo).not.toHaveBeenCalled();
    });
  });

  describe('createVideo - return value', () => {
    it('should return batch and generation data', async () => {
      setupMocks();
      mockCreateVideo.mockResolvedValue({ inferenceId: 'inf-5', useWebhook: true });

      const caller = videoRouter.createCaller(mockCtx);
      const result = await caller.createVideo(defaultInput);

      expect(result).toEqual({
        data: {
          batch: txResult.batch,
          generations: [{ ...txResult.generation, asyncTaskId: 'async-1' }],
        },
        success: true,
      });
    });
  });

  describe('createVideo - reference image URL normalization', () => {
    it('should rewrite imageUrls array to public URLs before calling provider', async () => {
      const { mockUpdate: _unused } = setupMocks();

      // FileService: getKeyFromFullUrl extracts key from proxy URL,
      // getFullFileUrl maps key -> public CDN URL.
      const getKeyFromFullUrl = vi.fn(async (url: string) => {
        const match = url.match(/\/f\/([^/?#]+)/);
        return match ? `uploads/${match[1]}.png` : null;
      });
      const getFullFileUrl = vi.fn(async (key: string) =>
        key.startsWith('http') ? key : `https://cdn.example.com/${key}`,
      );
      vi.mocked(FileService).mockImplementation(
        () => ({ getFullFileUrl, getKeyFromFullUrl }) as any,
      );

      mockCreateVideo.mockResolvedValue({ inferenceId: 'inf-img', useWebhook: true });

      const caller = videoRouter.createCaller(mockCtx);
      await caller.createVideo({
        ...defaultInput,
        params: {
          ...defaultInput.params,
          imageUrls: [
            'https://self-host.example:8443/f/file_abc',
            'https://self-host.example:8443/f/file_def',
          ],
        },
      });

      // 1) Provider receives publicly-reachable URLs, NOT the proxy URLs.
      expect(mockCreateVideo).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            imageUrls: [
              'https://cdn.example.com/uploads/file_abc.png',
              'https://cdn.example.com/uploads/file_def.png',
            ],
          }),
        }),
        expect.any(Object),
      );

      // 2) Key extraction was attempted for every reference image.
      expect(getKeyFromFullUrl).toHaveBeenCalledTimes(2);
      // 3) Public URL resolution happens unconditionally (not gated on NODE_ENV).
      expect(getFullFileUrl).toHaveBeenCalledWith('uploads/file_abc.png');
      expect(getFullFileUrl).toHaveBeenCalledWith('uploads/file_def.png');
    });

    it('should fall back to original URL when key extraction fails for an element', async () => {
      setupMocks();

      const getKeyFromFullUrl = vi.fn(async (url: string) =>
        url.includes('known') ? 'uploads/known.png' : null,
      );
      const getFullFileUrl = vi.fn(async (key: string) =>
        key.startsWith('http') ? key : `https://cdn.example.com/${key}`,
      );
      vi.mocked(FileService).mockImplementation(
        () => ({ getFullFileUrl, getKeyFromFullUrl }) as any,
      );

      mockCreateVideo.mockResolvedValue({ inferenceId: 'inf-mix', useWebhook: true });

      const caller = videoRouter.createCaller(mockCtx);
      await caller.createVideo({
        ...defaultInput,
        params: {
          ...defaultInput.params,
          imageUrls: ['https://ex.com/known.png', 'https://ex.com/unknown.png'],
        },
      });

      // Provider call must not contain undefined entries; unresolved
      // elements fall back to the original URL so we do not silently
      // lose reference images.
      const call = mockCreateVideo.mock.calls[0][0];
      expect(call.params.imageUrls).toHaveLength(2);
      expect(call.params.imageUrls[1]).toBe('https://ex.com/unknown.png');
      // And database config keeps original URLs on partial failure.
    });

    it('should rewrite imageUrl and endImageUrl to public URLs', async () => {
      setupMocks();

      const getKeyFromFullUrl = vi.fn(async (url: string) => {
        const m = url.match(/\/f\/([^/?#]+)/);
        return m ? `uploads/${m[1]}.png` : null;
      });
      const getFullFileUrl = vi.fn(async (key: string) => `https://cdn.example.com/${key}`);
      vi.mocked(FileService).mockImplementation(
        () => ({ getFullFileUrl, getKeyFromFullUrl }) as any,
      );

      mockCreateVideo.mockResolvedValue({ inferenceId: 'inf-frames', useWebhook: true });

      const caller = videoRouter.createCaller(mockCtx);
      await caller.createVideo({
        ...defaultInput,
        params: {
          ...defaultInput.params,
          imageUrl: 'https://self-host.example:8443/f/first_frame',
          endImageUrl: 'https://self-host.example:8443/f/last_frame',
        },
      });

      expect(mockCreateVideo).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            imageUrl: 'https://cdn.example.com/uploads/first_frame.png',
            endImageUrl: 'https://cdn.example.com/uploads/last_frame.png',
          }),
        }),
        expect.any(Object),
      );
    });

    it('should not call URL resolver when no reference images are provided', async () => {
      setupMocks();

      const getKeyFromFullUrl = vi.fn();
      const getFullFileUrl = vi.fn();
      vi.mocked(FileService).mockImplementation(
        () => ({ getFullFileUrl, getKeyFromFullUrl }) as any,
      );

      mockCreateVideo.mockResolvedValue({ inferenceId: 'inf-noop', useWebhook: true });

      const caller = videoRouter.createCaller(mockCtx);
      await caller.createVideo(defaultInput);

      expect(getKeyFromFullUrl).not.toHaveBeenCalled();
      expect(getFullFileUrl).not.toHaveBeenCalled();
    });
  });

});
