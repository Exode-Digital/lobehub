'use client';

import { useTranslation } from 'react-i18next';

import WorkspaceDevices from '@/features/WorkspaceSetting/Devices';
import SettingHeader from '@/routes/(main)/settings/features/SettingHeader';

const WorkspaceDevicesSetting = () => {
  const { t } = useTranslation('setting');
  return (
    <>
      <SettingHeader title={t('tab.devices')} />
      <WorkspaceDevices />
    </>
  );
};

WorkspaceDevicesSetting.displayName = 'WorkspaceDevicesSetting';

export default WorkspaceDevicesSetting;
