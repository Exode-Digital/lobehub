'use client';

import { Button, Flexbox, Icon, TextArea } from '@lobehub/ui';
import { cssVar } from 'antd-style';
import { SmilePlus } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import EmojiPicker from '@/components/EmojiPicker';
import { useGlobalStore } from '@/store/global';
import { globalGeneralSelectors } from '@/store/global/selectors';
import { truncateByWeightedLength } from '@/utils/textLength';

export interface TitleSectionProps {
  emoji?: string;
  onEmojiChange?: (emoji: string | undefined) => void;
  onTitleChange?: (title: string) => void;
  title?: string;
}

const TitleSection = memo<TitleSectionProps>(
  ({ emoji: emojiProp, title: titleProp, onEmojiChange, onTitleChange }) => {
    const { t } = useTranslation('file');
    const locale = useGlobalStore(globalGeneralSelectors.currentLanguage);

    const isTitleControlled = titleProp !== undefined;
    const isEmojiControlled = onEmojiChange !== undefined;

    const [innerTitle, setInnerTitle] = useState('');
    const [innerEmoji, setInnerEmoji] = useState<string | undefined>();

    const title = isTitleControlled ? titleProp : innerTitle;
    const emoji = isEmojiControlled ? emojiProp : innerEmoji;

    const setTitle = (value: string) => {
      if (!isTitleControlled) setInnerTitle(value);
      onTitleChange?.(value);
    };
    const setEmoji = (value: string | undefined) => {
      if (!isEmojiControlled) setInnerEmoji(value);
      onEmojiChange?.(value);
    };

    const [isHoveringTitle, setIsHoveringTitle] = useState(false);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);

    return (
      <Flexbox
        gap={16}
        paddingBlock={16}
        style={{ cursor: 'default' }}
        onMouseEnter={() => setIsHoveringTitle(true)}
        onMouseLeave={() => setIsHoveringTitle(false)}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
      >
        {(emoji || showEmojiPicker) && (
          <EmojiPicker
            allowDelete
            locale={locale}
            open={showEmojiPicker}
            shape={'square'}
            size={72}
            title={t('pageEditor.chooseIcon')}
            value={emoji}
            onChange={(e) => {
              setEmoji(e);
              setShowEmojiPicker(false);
            }}
            onDelete={() => {
              setEmoji(undefined);
              setShowEmojiPicker(false);
            }}
            onOpenChange={(open) => {
              setShowEmojiPicker(open);
            }}
          />
        )}

        {!emoji && !showEmojiPicker && (
          <Button
            icon={<Icon icon={SmilePlus} />}
            size="small"
            type="text"
            style={{
              opacity: isHoveringTitle ? 1 : 0,
              transition: `opacity ${cssVar.motionDurationMid} ${cssVar.motionEaseInOut}`,
              width: 'fit-content',
            }}
            onClick={() => {
              setEmoji('📄');
              setShowEmojiPicker(true);
            }}
          >
            {t('pageEditor.chooseIcon')}
          </Button>
        )}

        <TextArea
          autoSize={{ minRows: 1 }}
          placeholder={t('pageEditor.titlePlaceholder')}
          value={title}
          variant={'borderless'}
          style={{
            fontSize: 36,
            fontWeight: 600,
            padding: 0,
            resize: 'none',
            width: '100%',
          }}
          onChange={(e) => {
            const truncated = truncateByWeightedLength(e.target.value, 100);
            setTitle(truncated);
          }}
        />
      </Flexbox>
    );
  },
);

TitleSection.displayName = 'TopicCanvasTitleSection';

export default TitleSection;
