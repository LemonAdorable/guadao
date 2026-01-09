"use client";

import { useState } from 'react';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@rainbow-me/rainbowkit/styles.css';
import { RainbowKitProvider, lightTheme } from '@rainbow-me/rainbowkit';

import { config } from '../lib/wagmi';
import { LanguageProvider, useI18n } from './components/LanguageProvider';
import { AdminProvider } from './components/AdminProvider';

/**
 * GUA 紫色主题
 * - 主色: 紫色渐变
 * - 圆角: Large (24px)
 */
const guaPurpleTheme = {
  ...lightTheme({
    accentColor: '#8b5cf6',
    accentColorForeground: 'white',
    borderRadius: 'large',
    fontStack: 'system',
    overlayBlur: 'small',
  }),
  colors: {
    ...lightTheme().colors,
    // ============ 主色调 (紫色系) ============
    accentColor: '#8b5cf6',
    accentColorForeground: 'white',

    // ============ 模态框 ============
    modalBackground: '#faf8ff',
    modalBorder: 'rgba(139, 92, 246, 0.1)',
    modalText: '#1a1a2e',
    modalTextDim: '#4a4a6a',
    modalTextSecondary: '#7a7a9a',

    // ============ 按钮 ============
    actionButtonBorder: 'rgba(139, 92, 246, 0.25)',
    actionButtonBorderMobile: 'rgba(139, 92, 246, 0.35)',
    actionButtonSecondaryBackground: 'rgba(139, 92, 246, 0.08)',

    // ============ 连接按钮 ============
    connectButtonBackground: '#faf8ff',
    connectButtonBackgroundError: '#ef4444',
    connectButtonInnerBackground: 'linear-gradient(0deg, #f3f0ff 0%, #ffffff 100%)',
    connectButtonText: '#1a1a2e',
    connectButtonTextError: 'white',

    // ============ 通用边框 ============
    generalBorder: 'rgba(139, 92, 246, 0.12)',
    generalBorderDim: 'rgba(139, 92, 246, 0.06)',

    // ============ 关闭按钮 ============
    closeButton: '#4a4a6a',
    closeButtonBackground: 'rgba(139, 92, 246, 0.06)',

    // ============ 下载卡片 ============
    downloadBottomCardBackground: 'linear-gradient(135deg, #f3f0ff 0%, #ede9fe 100%)',
    downloadTopCardBackground: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',

    // ============ 错误状态 ============
    error: '#ef4444',

    // ============ 个人资料 ============
    profileAction: 'rgba(139, 92, 246, 0.08)',
    profileActionHover: 'rgba(139, 92, 246, 0.14)',
    profileForeground: '#faf8ff',

    // ============ 选中状态 ============
    selectedOptionBorder: 'rgba(139, 92, 246, 0.6)',
    standby: '#06b6d4',

    // ============ 菜单 ============
    menuItemBackground: 'rgba(139, 92, 246, 0.06)',
  },
  fonts: {
    body: '"Sora", "Trebuchet MS", sans-serif',
  },
  radii: {
    actionButton: '999px',
    connectButton: '999px',
    menuButton: '999px',
    modal: '24px',
    modalMobile: '20px',
  },
  shadows: {
    connectButton: '0 4px 16px rgba(139, 92, 246, 0.15)',
    dialog: '0 24px 60px rgba(139, 92, 246, 0.1), 0 8px 24px rgba(26, 26, 46, 0.08)',
    profileDetailsAction: '0 2px 8px rgba(139, 92, 246, 0.12)',
    selectedOption: '0 0 0 2px rgba(139, 92, 246, 0.5)',
    selectedWallet: '0 0 0 2px rgba(139, 92, 246, 0.5)',
    walletLogo: '0 4px 12px rgba(0, 0, 0, 0.06)',
  },
};

function RainbowKitWrapper({ children }) {
  const { lang } = useI18n();

  return (
    <RainbowKitProvider
      theme={guaPurpleTheme}
      locale={lang === 'zh' ? 'zh-CN' : 'en'}
      modalSize="wide"
      showRecentTransactions={true}
      coolMode
    >
      {children}
    </RainbowKitProvider>
  );
}

export default function Providers({ children }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <LanguageProvider>
          <RainbowKitWrapper>
            <AdminProvider>{children}</AdminProvider>
          </RainbowKitWrapper>
        </LanguageProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}