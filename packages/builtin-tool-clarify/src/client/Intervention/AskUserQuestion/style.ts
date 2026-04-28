import { createStaticStyles } from 'antd-style';

export const styles = createStaticStyles(({ css, cssVar }) => ({
  actionLink: css`
    cursor: pointer;

    display: inline-flex;
    gap: 4px;
    align-items: center;

    padding-block: 4px;
    padding-inline: 0;

    font-size: 13px;

    transition: color ${cssVar.motionDurationMid};

    &:hover {
      color: ${cssVar.colorPrimary} !important;
    }
  `,
  header: css`
    width: fit-content;
    max-width: 100%;
    padding-block: 2px;
    padding-inline: 8px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusSM}px;

    color: ${cssVar.colorTextSecondary};

    background: ${cssVar.colorFillQuaternary};
  `,
  option: css`
    cursor: pointer;

    padding-block: 10px;
    padding-inline: 12px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadius}px;

    background: ${cssVar.colorBgContainer};

    transition:
      border-color ${cssVar.motionDurationMid},
      background ${cssVar.motionDurationMid};

    &:hover {
      border-color: ${cssVar.colorPrimaryBorder};
      background: ${cssVar.colorFillQuaternary};
    }
  `,
  optionSelected: css`
    border-color: ${cssVar.colorPrimary};
    background: ${cssVar.colorPrimaryBg};
  `,
  preview: css`
    overflow: auto;

    max-height: 240px;
    padding-block: 10px;
    padding-inline: 12px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadius}px;

    background: ${cssVar.colorFillQuaternary};
  `,
  questionBlock: css`
    padding-block: 4px 8px;
  `,
}));
