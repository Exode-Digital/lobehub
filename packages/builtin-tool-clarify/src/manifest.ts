import type { BuiltinToolManifest } from '@lobechat/types';

import { systemPrompt } from './systemRole';
import { ClarifyApiName, ClarifyIdentifier } from './types';

const questionSchema = {
  properties: {
    header: {
      description: 'Short chip label for this question. Prefer 1-3 words.',
      type: 'string',
    },
    id: {
      description: 'Stable identifier for mapping answers. Use snake_case.',
      type: 'string',
    },
    multiSelect: {
      description: 'Whether the user may select more than one option.',
      type: 'boolean',
    },
    options: {
      description: 'Available choices. Do not include Other; the UI adds it automatically.',
      items: {
        properties: {
          description: {
            description: 'One sentence explaining this choice and its tradeoff.',
            type: 'string',
          },
          label: {
            description: 'Short display label, ideally 1-5 words.',
            type: 'string',
          },
          preview: {
            description:
              'Optional markdown preview for single-select questions. Do not use with multiSelect.',
            type: 'string',
          },
        },
        required: ['label', 'description'],
        type: 'object',
      },
      maxItems: 4,
      minItems: 2,
      type: 'array',
    },
    question: {
      description: 'The complete user-facing question.',
      type: 'string',
    },
  },
  required: ['id', 'header', 'question', 'options'],
  type: 'object',
};

export const ClarifyManifest: BuiltinToolManifest = {
  api: [
    {
      description:
        'Ask the user one or more structured multiple-choice clarification questions. Returns a pending interaction that the UI resolves with the user answer.',
      humanIntervention: 'always',
      name: ClarifyApiName.askUserQuestion,
      renderDisplayControl: 'collapsed',
      parameters: {
        properties: {
          metadata: {
            additionalProperties: true,
            description: 'Optional internal metadata for analytics or routing. Not displayed.',
            type: 'object',
          },
          questions: {
            description: 'Questions to ask the user. Use 1-4 questions.',
            items: questionSchema,
            maxItems: 4,
            minItems: 1,
            type: 'array',
          },
        },
        required: ['questions'],
        type: 'object',
      },
    },
  ],
  identifier: ClarifyIdentifier,
  meta: {
    avatar: '❔',
    description: 'Ask structured clarification questions through a dedicated UI',
    title: 'Clarify',
  },
  systemRole: systemPrompt,
  type: 'builtin',
};
