import { Block, Empty, Flexbox, Icon, Text } from '@lobehub/ui';
import { cssVar } from 'antd-style';
import { ClipboardCheckIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { TaskTemplateRecommendationsView } from '@/features/RecommendTaskTemplates/TaskTemplateRecommendationsView';
import type { TaskTemplateRecommendationsUIState } from '@/features/RecommendTaskTemplates/useTaskTemplateRecommendationsUI';

interface RecommendedTaskTemplatesEmptyStateProps {
  recommendationState: TaskTemplateRecommendationsUIState;
}

export const RecommendedTaskTemplatesEmptyState = memo<RecommendedTaskTemplatesEmptyStateProps>(
  ({ recommendationState }) => {
    const { t } = useTranslation('chat');
    const { t: tTaskTemplate } = useTranslation('taskTemplate');

    if (recommendationState.mode === 'hidden') {
      return (
        <Flexbox align={'center'} paddingBlock={32} style={{ width: '100%' }}>
          <Empty description={t('taskList.empty')} icon={ClipboardCheckIcon} />
        </Flexbox>
      );
    }

    return (
      <Flexbox
        align={'center'}
        gap={16}
        paddingBlock={24}
        style={{ marginInline: 'auto', maxWidth: 720, width: '100%' }}
      >
        <Flexbox horizontal align={'center'} gap={12} style={{ width: '100%' }}>
          <Block
            align={'center'}
            height={40}
            justify={'center'}
            style={{ background: cssVar.colorFillSecondary, flexShrink: 0 }}
            width={40}
          >
            <Icon color={cssVar.colorTextSecondary} icon={ClipboardCheckIcon} size={22} />
          </Block>
          <Flexbox gap={2} style={{ minWidth: 0 }}>
            <Text ellipsis fontSize={18} weight={600}>
              {tTaskTemplate('section.emptyTitle')}
            </Text>
          </Flexbox>
        </Flexbox>
        <TaskTemplateRecommendationsView state={recommendationState} />
      </Flexbox>
    );
  },
);

RecommendedTaskTemplatesEmptyState.displayName = 'RecommendedTaskTemplatesEmptyState';
