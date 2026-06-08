import { Center, Flexbox } from '@lobehub/ui';
import { Drawer } from 'antd';
import { createStaticStyles, cssVar } from 'antd-style';
import { Suspense, useCallback, useEffect } from 'react';

import { BrandTextLoading } from '@/components/Loading';
import LoginStep from '@/routes/(desktop)/desktop-onboarding/features/LoginStep';
import { useElectronStore } from '@/store/electron';
import { useUserStore } from '@/store/user';
import { isMacOS } from '@/utils/platform';

import RemoteStatus from './RemoteStatus';

const isMac = isMacOS();

const styles = createStaticStyles(({ css }) => {
  return {
    modal: css`
      .ant-drawer-close {
        position: absolute;
        inset-block-start: ${isMac ? '12px' : '46px'};
        inset-inline-end: 6px;
      }
    `,
  };
});

const Connection = () => {
  const [isOpen, setConnectionDrawerOpen] = useElectronStore((s) => [
    s.isConnectionDrawerOpen,
    s.setConnectionDrawerOpen,
  ]);
  const refreshUserState = useUserStore((s) => s.refreshUserState);

  // Re-probe the session whenever the drawer opens. `getUserState` is fetched once at
  // startup, so a session that expired afterwards would otherwise leave a stale
  // signed-in state and make the panel claim "Authorization Successful". Revalidating
  // refreshes that state (and surfaces a dead session via the backend's 401 → re-auth flow).
  useEffect(() => {
    if (!isOpen) return;
    refreshUserState().catch(() => {});
  }, [isOpen, refreshUserState]);

  const handleClose = useCallback(() => {
    setConnectionDrawerOpen(false);
  }, [setConnectionDrawerOpen]);

  return (
    <>
      <RemoteStatus
        onClick={() => {
          setConnectionDrawerOpen(true);
        }}
      />
      <Drawer
        classNames={{ header: styles.modal }}
        open={isOpen}
        placement={'top'}
        size={'100vh'}
        styles={{ body: { padding: 0 }, header: { padding: 0 } }}
        style={{
          background: cssVar.colorBgLayout,
        }}
        onClose={handleClose}
      >
        <Suspense
          fallback={
            <Center style={{ height: '100%' }}>
              <BrandTextLoading debugId="Connection" />
            </Center>
          }
        >
          <Center style={{ height: '100%', overflow: 'auto', padding: 24 }}>
            <Flexbox style={{ maxWidth: 560, width: '100%' }}>
              <LoginStep onBack={handleClose} onNext={handleClose} />
            </Flexbox>
          </Center>
        </Suspense>
      </Drawer>
    </>
  );
};

export default Connection;
