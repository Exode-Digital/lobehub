'use client';

import { CopyButton, Flexbox, Icon, Skeleton, Text } from '@lobehub/ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { MonitorIcon, ServerIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { lambdaQuery } from '@/libs/trpc/client';

const styles = createStaticStyles(({ css }) => ({
  card: css`
    overflow: hidden;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};
    background: ${cssVar.colorBgContainer};
  `,
  codeBlock: css`
    display: flex;
    gap: 12px;
    align-items: center;

    margin-block-start: 12px;
    padding-block: 10px;
    padding-inline: 14px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadius};

    background: ${cssVar.colorFillQuaternary};
  `,
  command: css`
    overflow: hidden;
    flex: 1;

    font-family: ${cssVar.fontFamilyCode};
    font-size: 13px;
    color: ${cssVar.colorText};
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  dotOffline: css`
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: ${cssVar.colorTextQuaternary};
  `,
  dotOnline: css`
    width: 6px;
    height: 6px;
    border-radius: 50%;

    background: ${cssVar.colorSuccess};
    box-shadow: 0 0 0 2px ${cssVar.colorSuccessBg};
  `,
  empty: css`
    padding-block: 32px;
    font-size: 13px;
    color: ${cssVar.colorTextQuaternary};
    text-align: center;
  `,
  enroll: css`
    padding: 20px;
  `,
  row: css`
    display: flex;
    gap: 12px;
    align-items: center;

    padding-block: 14px;
    padding-inline: 16px;

    &:not(:last-child) {
      border-block-end: 1px solid ${cssVar.colorBorderSecondary};
    }
  `,
  rowIcon: css`
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;

    width: 36px;
    height: 36px;
    border-radius: ${cssVar.borderRadius};

    color: ${cssVar.colorTextSecondary};

    background: ${cssVar.colorFillSecondary};
  `,
  subtitle: css`
    font-size: 13px;
    color: ${cssVar.colorTextTertiary};
  `,
}));

const WorkspaceDevices = memo(() => {
  const { t } = useTranslation('setting');
  const workspaceId = useActiveWorkspaceId();

  const { data, isLoading } = lambdaQuery.device.listDevices.useQuery(undefined, {
    staleTime: 30_000,
  });
  // Only this workspace's shared devices — personal devices are managed under
  // the user's own settings.
  const devices = (data ?? []).filter((d) => d.scope === 'workspace');

  const command = `lh connect --workspace ${workspaceId ?? '<workspace-id>'}`;

  return (
    <Flexbox gap={24}>
      <Text className={styles.subtitle}>{t('workspaceSetting.devices.desc')}</Text>

      {/* Enroll guide — run on the shared machine (admin only). */}
      <Flexbox className={styles.card}>
        <Flexbox className={styles.enroll} gap={4}>
          <Text style={{ fontSize: 14, fontWeight: 500 }}>
            {t('workspaceSetting.devices.enrollTitle')}
          </Text>
          <Text className={styles.subtitle}>{t('workspaceSetting.devices.enrollDesc')}</Text>
          <div className={styles.codeBlock}>
            <code className={styles.command}>{command}</code>
            <CopyButton content={command} size={'small'} />
          </div>
        </Flexbox>
      </Flexbox>

      {/* Device list */}
      {isLoading ? (
        <Skeleton active paragraph={{ rows: 3 }} title={false} />
      ) : devices.length === 0 ? (
        <Flexbox className={styles.card}>
          <div className={styles.empty}>{t('workspaceSetting.devices.empty')}</div>
        </Flexbox>
      ) : (
        <Flexbox className={styles.card}>
          {devices.map((device) => (
            <div className={styles.row} key={device.deviceId}>
              <span className={styles.rowIcon}>
                <Icon icon={ServerIcon} size={18} />
              </span>
              <Flexbox flex={1} gap={2} style={{ minWidth: 0 }}>
                <Text ellipsis style={{ fontSize: 14, fontWeight: 500 }}>
                  {device.friendlyName || device.hostname || device.deviceId}
                </Text>
                <Flexbox horizontal align={'center'} gap={6}>
                  <span className={device.online ? styles.dotOnline : styles.dotOffline} />
                  <Text className={styles.subtitle} style={{ fontSize: 12 }}>
                    {device.online
                      ? t('workspaceSetting.devices.online')
                      : t('workspaceSetting.devices.offline')}
                  </Text>
                </Flexbox>
              </Flexbox>
              <Icon icon={MonitorIcon} size={16} style={{ color: cssVar.colorTextQuaternary }} />
            </div>
          ))}
        </Flexbox>
      )}
    </Flexbox>
  );
});

WorkspaceDevices.displayName = 'WorkspaceDevices';

export default WorkspaceDevices;
