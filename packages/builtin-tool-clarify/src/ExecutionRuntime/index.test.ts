import { describe, expect, it } from 'vitest';

import { ClarifyExecutionRuntime } from '.';

const validArgs = {
  questions: [
    {
      header: 'Auth',
      id: 'auth_method',
      options: [
        { description: 'Use the existing account provider.', label: 'OAuth (Recommended)' },
        { description: 'Use a password-based login.', label: 'Password' },
      ],
      question: 'Which auth method should we use?',
    },
  ],
};

describe('ClarifyExecutionRuntime', () => {
  it('creates a pending clarification state for valid questions', async () => {
    const runtime = new ClarifyExecutionRuntime();

    const result = await runtime.askUserQuestion(validArgs);

    expect(result.success).toBe(true);
    expect(result.state).toMatchObject({
      requestId: 'clarify:auth_method',
      status: 'pending',
    });
  });

  it('rejects more than four questions', async () => {
    const runtime = new ClarifyExecutionRuntime();

    const result = await runtime.askUserQuestion({
      questions: Array.from({ length: 5 }, (_, index) => ({
        ...validArgs.questions[0],
        id: `question_${index}`,
      })),
    });

    expect(result.success).toBe(false);
    expect(result.content).toContain('questions');
  });

  it('rejects duplicate question ids', async () => {
    const runtime = new ClarifyExecutionRuntime();

    const result = await runtime.askUserQuestion({
      questions: [validArgs.questions[0], validArgs.questions[0]],
    });

    expect(result.success).toBe(false);
    expect(result.content).toContain('Question ids must be unique');
  });

  it('rejects duplicate option labels within a question', async () => {
    const runtime = new ClarifyExecutionRuntime();

    const result = await runtime.askUserQuestion({
      questions: [
        {
          ...validArgs.questions[0],
          options: [
            { description: 'First path.', label: 'Same' },
            { description: 'Second path.', label: 'Same' },
          ],
        },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.content).toContain('Option labels must be unique');
  });

  it('rejects preview on multi-select questions', async () => {
    const runtime = new ClarifyExecutionRuntime();

    const result = await runtime.askUserQuestion({
      questions: [
        {
          ...validArgs.questions[0],
          multiSelect: true,
          options: [
            { description: 'Enable sync.', label: 'Sync', preview: '# Sync' },
            { description: 'Enable search.', label: 'Search' },
          ],
        },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.content).toContain('preview is only supported');
  });
});
