import { TRPCError } from '@trpc/server';
import { and, eq, sql } from 'drizzle-orm';

import { agents, agentShares } from '../schemas';
import type { AgentShareItem } from '../schemas/agentShare';
import type { LobeChatDatabase } from '../type';

export type { AgentShareItem };

export type SharedAgentData = NonNullable<
  Awaited<ReturnType<(typeof AgentShareModel)['findByShareId']>>
>;

export class AgentShareModel {
  private userId: string;
  private db: LobeChatDatabase;

  constructor(db: LobeChatDatabase, userId: string) {
    this.userId = userId;
    this.db = db;
  }

  /**
   * Create or get the existing share record for an agent.
   * Enforced unique constraint on agentId ensures at most one share per agent.
   */
  create = async (agentId: string) => {
    const agent = await this.db.query.agents.findFirst({
      where: and(eq(agents.id, agentId), eq(agents.userId, this.userId)),
    });

    if (!agent) throw new Error('Agent not found or not owned by user');

    const [result] = await this.db
      .insert(agentShares)
      .values({ agentId, userId: this.userId })
      .onConflictDoNothing({ target: agentShares.agentId })
      .returning();

    if (!result) return this.getByAgentId(agentId);

    return result;
  };

  updateConfig = async (
    agentId: string,
    config: Partial<
      Pick<AgentShareItem, 'filePermissionConfig' | 'guestEnabled' | 'tipSplitRatio' | 'visibility'>
    >,
  ) => {
    const [result] = await this.db
      .update(agentShares)
      .set({ ...config, updatedAt: new Date() })
      .where(and(eq(agentShares.agentId, agentId), eq(agentShares.userId, this.userId)))
      .returning();

    return result || null;
  };

  delete = async (agentId: string) => {
    return this.db
      .delete(agentShares)
      .where(and(eq(agentShares.agentId, agentId), eq(agentShares.userId, this.userId)));
  };

  getByAgentId = async (agentId: string) => {
    const [result] = await this.db
      .select()
      .from(agentShares)
      .where(and(eq(agentShares.agentId, agentId), eq(agentShares.userId, this.userId)))
      .limit(1);

    return result || null;
  };

  /**
   * Public lookup by share ID.
   * Returns sanitised agent metadata — does NOT expose systemRole, model, or provider.
   */
  static findByShareId = async (db: LobeChatDatabase, shareId: string) => {
    const [result] = await db
      .select({
        agentAvatar: agents.avatar,
        agentBackgroundColor: agents.backgroundColor,
        agentDescription: agents.description,
        agentId: agentShares.agentId,
        agentTags: agents.tags,
        agentTitle: agents.title,
        creatorId: agentShares.userId,
        filePermissionConfig: agentShares.filePermissionConfig,
        guestEnabled: agentShares.guestEnabled,
        pageViewCount: agentShares.pageViewCount,
        shareId: agentShares.id,
        tipSplitRatio: agentShares.tipSplitRatio,
        visibility: agentShares.visibility,
      })
      .from(agentShares)
      .innerJoin(agents, eq(agentShares.agentId, agents.id))
      .where(eq(agentShares.id, shareId))
      .limit(1);

    return result || null;
  };

  static findByShareIdWithAccessCheck = async (
    db: LobeChatDatabase,
    shareId: string,
    accessUserId?: string,
  ): Promise<SharedAgentData> => {
    const share = await AgentShareModel.findByShareId(db, shareId);

    if (!share) throw new TRPCError({ code: 'NOT_FOUND', message: 'Share not found' });

    const isOwner = accessUserId && share.creatorId === accessUserId;

    if (!isOwner && share.visibility === 'private') {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'This share is private' });
    }

    return share;
  };

  static incrementPageViewCount = async (db: LobeChatDatabase, shareId: string) => {
    await db
      .update(agentShares)
      .set({ pageViewCount: sql`${agentShares.pageViewCount} + 1` })
      .where(eq(agentShares.id, shareId));
  };
}
