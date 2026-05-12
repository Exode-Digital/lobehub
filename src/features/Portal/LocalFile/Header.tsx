'use client';

import { memo } from 'react';

import OpenInAppButton from '@/features/OpenInAppButton';
import { useChatStore } from '@/store/chat';
import { chatPortalSelectors } from '@/store/chat/selectors';

import PortalHeader from '../components/Header';
import TabStrip from './TabStrip';

const Header = memo(() => {
  const activeWorkingDirectory = useChatStore(
    (s) => chatPortalSelectors.currentLocalFile(s)?.workingDirectory ?? '',
  );

  return (
    <PortalHeader
      rightExtra={<OpenInAppButton workingDirectory={activeWorkingDirectory} />}
      title={<TabStrip />}
    />
  );
});

Header.displayName = 'LocalFileHeader';

export default Header;
