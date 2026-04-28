'use client';

import type { BuiltinInterventionProps } from '@lobechat/types';
import { Button, Flexbox, Icon, Markdown, Text, TextArea } from '@lobehub/ui';
import { cx } from 'antd-style';
import { Check, PenLine, SendHorizontal } from 'lucide-react';
import { memo, useCallback, useMemo, useState } from 'react';

import type {
  AskUserQuestionArgs,
  ClarifyAnswer,
  ClarifyQuestion,
  ClarifySubmitPayload,
} from '../../../types';
import { styles } from './style';

type DraftAnswer = Omit<ClarifyAnswer, 'question'>;

const getInitialAnswers = (questions: ClarifyQuestion[]): Record<string, DraftAnswer> =>
  Object.fromEntries(
    questions.map((question) => [
      question.id,
      {
        selected: [],
      },
    ]),
  );

const getSelectedOption = (question: ClarifyQuestion, answer?: DraftAnswer) => {
  const selectedLabel = answer?.selected[0];
  if (!selectedLabel || question.multiSelect) return;

  return question.options.find((option) => option.label === selectedLabel);
};

const isAnswered = (answer?: DraftAnswer) =>
  !!answer && (answer.selected.length > 0 || !!answer.other?.trim());

const QuestionBlock = memo<{
  answer: DraftAnswer;
  onChange: (questionId: string, answer: DraftAnswer) => void;
  question: ClarifyQuestion;
}>(({ question, answer, onChange }) => {
  const selectedOption = getSelectedOption(question, answer);
  const preview = selectedOption?.preview;

  const handleToggleOption = useCallback(
    (label: string) => {
      const selected = question.multiSelect
        ? answer.selected.includes(label)
          ? answer.selected.filter((item) => item !== label)
          : [...answer.selected, label]
        : [label];

      onChange(question.id, {
        ...answer,
        selected,
        selectedPreview: question.multiSelect
          ? undefined
          : question.options.find((option) => option.label === label)?.preview,
      });
    },
    [answer, onChange, question],
  );

  return (
    <Flexbox className={styles.questionBlock} gap={12}>
      <Flexbox gap={6}>
        <Text className={styles.header}>{question.header}</Text>
        <Text style={{ fontWeight: 500 }}>{question.question}</Text>
      </Flexbox>

      <Flexbox gap={8}>
        {question.options.map((option) => {
          const selected = answer.selected.includes(option.label);

          return (
            <Flexbox
              aria-checked={selected}
              className={cx(styles.option, selected && styles.optionSelected)}
              gap={4}
              horizontal={false}
              key={option.label}
              role={question.multiSelect ? 'checkbox' : 'radio'}
              onClick={() => handleToggleOption(option.label)}
            >
              <Flexbox horizontal align={'center'} gap={8}>
                {selected && <Icon icon={Check} size={14} />}
                <Text style={{ fontWeight: 500 }}>{option.label}</Text>
              </Flexbox>
              <Text style={{ fontSize: 13 }} type={'secondary'}>
                {option.description}
              </Text>
            </Flexbox>
          );
        })}
      </Flexbox>

      <Flexbox gap={8}>
        <Text className={styles.actionLink} type={'secondary'}>
          <Icon icon={PenLine} /> Other
        </Text>
        <TextArea
          autoSize={{ maxRows: 4, minRows: 2 }}
          placeholder={'Type another answer'}
          value={answer.other ?? ''}
          variant={'filled'}
          onChange={(event) =>
            onChange(question.id, {
              ...answer,
              other: event.target.value,
            })
          }
        />
      </Flexbox>

      {preview && (
        <Flexbox gap={8}>
          <Text style={{ fontSize: 13 }} type={'secondary'}>
            Preview
          </Text>
          <Flexbox className={styles.preview}>
            <Markdown fontSize={13} style={{ overflow: 'unset' }} variant={'chat'}>
              {preview}
            </Markdown>
          </Flexbox>
          <TextArea
            autoSize={{ maxRows: 4, minRows: 2 }}
            placeholder={'Optional notes for this choice'}
            value={answer.notes ?? ''}
            variant={'filled'}
            onChange={(event) =>
              onChange(question.id, {
                ...answer,
                notes: event.target.value,
              })
            }
          />
        </Flexbox>
      )}
    </Flexbox>
  );
});

const AskUserQuestionIntervention = memo<BuiltinInterventionProps<AskUserQuestionArgs>>(
  ({ args, interactionMode, onInteractionAction }) => {
    const questions = args.questions ?? [];
    const isCustom = interactionMode === 'custom';
    const [answers, setAnswers] = useState<Record<string, DraftAnswer>>(() =>
      getInitialAnswers(questions),
    );
    const [submitting, setSubmitting] = useState(false);

    const handleAnswerChange = useCallback((questionId: string, answer: DraftAnswer) => {
      setAnswers((prev) => ({ ...prev, [questionId]: answer }));
    }, []);

    const allAnswered = useMemo(
      () => questions.length > 0 && questions.every((question) => isAnswered(answers[question.id])),
      [answers, questions],
    );

    const handleSubmit = useCallback(async () => {
      if (!onInteractionAction || !allAnswered) return;

      const payload: ClarifySubmitPayload = {
        answers: Object.fromEntries(
          questions.map((question) => {
            const answer = answers[question.id] ?? { selected: [] };
            return [
              question.id,
              {
                ...answer,
                notes: answer.notes?.trim() || undefined,
                other: answer.other?.trim() || undefined,
                question: question.question,
              },
            ];
          }),
        ),
      };

      setSubmitting(true);
      try {
        await onInteractionAction({
          payload: payload as unknown as Record<string, unknown>,
          type: 'submit',
        });
      } finally {
        setSubmitting(false);
      }
    }, [allAnswered, answers, onInteractionAction, questions]);

    const handleSkip = useCallback(async () => {
      if (!onInteractionAction) return;
      await onInteractionAction({ type: 'skip' });
    }, [onInteractionAction]);

    if (!isCustom) {
      return (
        <Flexbox gap={8}>
          {questions.map((question) => (
            <Flexbox gap={4} key={question.id}>
              <Text>{question.question}</Text>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {question.options.map((option) => (
                  <li key={option.label}>{option.label}</li>
                ))}
              </ul>
            </Flexbox>
          ))}
        </Flexbox>
      );
    }

    return (
      <Flexbox gap={16}>
        {questions.map((question) => (
          <QuestionBlock
            answer={answers[question.id] ?? { selected: [] }}
            key={question.id}
            question={question}
            onChange={handleAnswerChange}
          />
        ))}
        <Flexbox horizontal align={'center'} justify={'space-between'}>
          <Text className={styles.actionLink} type={'secondary'} onClick={handleSkip}>
            Skip
          </Text>
          <Button
            disabled={!allAnswered}
            icon={SendHorizontal}
            loading={submitting}
            type={'primary'}
            onClick={handleSubmit}
          >
            Send
          </Button>
        </Flexbox>
      </Flexbox>
    );
  },
);

AskUserQuestionIntervention.displayName = 'ClarifyAskUserQuestionIntervention';

export default AskUserQuestionIntervention;
