import type { BuiltinServerRuntimeOutput } from '@lobechat/types';
import { z } from 'zod';

import type { ClarifyQuestion, ClarifyState } from '../types';

const clarifyOptionSchema = z
  .object({
    description: z.string().min(1),
    label: z.string().min(1),
    preview: z.string().optional(),
  })
  .strict();

const clarifyQuestionSchema = z
  .object({
    header: z.string().min(1),
    id: z.string().min(1),
    multiSelect: z.boolean().optional(),
    options: z.array(clarifyOptionSchema).min(2).max(4),
    question: z.string().min(1),
  })
  .strict()
  .refine(
    (question) => !question.multiSelect || !question.options.some((option) => option.preview),
    {
      message: 'preview is only supported for single-select questions.',
      path: ['options'],
    },
  )
  .refine(
    (question) => {
      const labels = question.options.map((option) => option.label);
      return labels.length === new Set(labels).size;
    },
    {
      message: 'Option labels must be unique within each question.',
      path: ['options'],
    },
  );

const askUserQuestionArgsSchema = z
  .object({
    metadata: z.record(z.unknown()).optional(),
    questions: z.array(clarifyQuestionSchema).min(1).max(4),
  })
  .strict()
  .refine(
    (args) => {
      const ids = args.questions.map((question) => question.id);
      return ids.length === new Set(ids).size;
    },
    {
      message: 'Question ids must be unique.',
      path: ['questions'],
    },
  );

const getRequestId = (questions: { id: string }[]) =>
  `clarify:${questions.map((question) => question.id).join(':')}`;

export class ClarifyExecutionRuntime {
  async askUserQuestion(args: unknown): Promise<BuiltinServerRuntimeOutput> {
    const parsed = askUserQuestionArgsSchema.safeParse(args);

    if (!parsed.success) {
      const issues = parsed.error.issues.map(
        (issue) => `${issue.path.join('.')}: ${issue.message}`,
      );
      return {
        content: `Invalid askUserQuestion args:\n${issues.join('\n')}\nPlease regenerate the tool call with the correct schema.`,
        success: false,
      };
    }

    const questions = parsed.data.questions as ClarifyQuestion[];
    const state: ClarifyState = {
      questions,
      requestId: getRequestId(questions),
      status: 'pending',
    };

    return {
      content: `Clarification questions are now pending user response: ${questions
        .map((question) => question.question)
        .join(' | ')}`,
      state,
      success: true,
    };
  }
}
