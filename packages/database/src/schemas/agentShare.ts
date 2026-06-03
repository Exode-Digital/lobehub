import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { createNanoId } from '../utils/idGenerator';
import { timestamps } from './_helpers';
import { agents } from './agent';
import { users } from './user';

export interface AgentShareFilePermissionConfig {
  /** Whether visitors can see agent-level uploaded files */
  agentFiles: 'hidden' | 'name-only' | 'visible';
  /** Whether guests are allowed to upload files in conversation */
  guestUpload: boolean;
  /** Whether visitors can see knowledge base files */
  knowledgeBase: 'hidden' | 'name-only' | 'visible';
}

export const agentShares = pgTable(
  'agent_shares',
  {
    id: text('id')
      .$defaultFn(() => createNanoId(8)())
      .primaryKey(),

    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),

    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    visibility: text('visibility').default('private').notNull(), // 'private' | 'link'

    /** Whether unauthenticated visitors can start a conversation */
    guestEnabled: boolean('guest_enabled').default(true).notNull(),

    /**
     * Fraction of each tip credited to the creator's personal Tip Budget (0.00–1.00).
     * The remainder (1 - tipSplitRatio) goes into this agent's Share Budget.
     * E.g. 0.10 → 10% to creator, 90% to Share Budget.
     */
    tipSplitRatio: numeric('tip_split_ratio', { precision: 3, scale: 2 }).default('0.10').notNull(),

    /**
     * Per-dimension file visibility for visitors.
     * Stored as JSONB to avoid additional migrations when new permission axes are added.
     */
    filePermissionConfig: jsonb('file_permission_config').$type<AgentShareFilePermissionConfig>(),

    pageViewCount: integer('page_view_count').default(0).notNull(),

    ...timestamps,
  },
  (t) => [
    uniqueIndex('agent_shares_agent_id_unique').on(t.agentId),
    index('agent_shares_user_id_idx').on(t.userId),
  ],
);

export type NewAgentShare = typeof agentShares.$inferInsert;
export type AgentShareItem = typeof agentShares.$inferSelect;
