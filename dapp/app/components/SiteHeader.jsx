"use client";

import Link from 'next/link';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';

import { useI18n } from './LanguageProvider';
import { useAdmin } from './AdminProvider';
import NetworkStatus from './NetworkStatus';
import TokenBalance from '../../components/TokenBalance';

export default function SiteHeader() {
  const { address, isConnected } = useAccount();
  const { lang, setLang, t } = useI18n();
  const { isAdmin } = useAdmin();

  const toggleLang = () => {
    setLang(lang === 'zh' ? 'en' : 'zh');
  };

  return (
    <header className="site-header">
      <div className="brand">
        <span className="brand-mark">GUA</span>
        <div className="brand-text">
          <span className="title">{t('brand.title')}</span>
          <span className="subtitle">{t('brand.subtitle')}</span>
        </div>
      </div>
      <nav className="nav">
        <Link href="/">{t('nav.home')}</Link>
        <Link href="/features">{lang === 'zh' ? '功能' : 'Guide'}</Link>
        <Link href="/airdrop">{t('nav.airdrop')}</Link>
        <Link href="/proposals">{t('nav.proposals')}</Link>
        <Link href="/profile">{t('nav.profile')}</Link>
        {isAdmin && <Link href="/admin">{t('nav.admin')}</Link>}
      </nav>
      <div className="header-actions">
        {isConnected && <TokenBalance />}
        <button className="lang-toggle" type="button" onClick={toggleLang}>
          {lang === 'zh' ? t('lang.en') : t('lang.zh')}
        </button>
        <ConnectButton.Custom>
          {({ account, openConnectModal, openAccountModal }) => (
            <button
              className="btn primary"
              onClick={account ? openAccountModal : openConnectModal}
            >
              {account
                ? `${account.address.slice(0, 6)}...${account.address.slice(-4)}`
                : t('wallet.connect')}
            </button>
          )}
        </ConnectButton.Custom>
      </div>
      <NetworkStatus />
    </header>
  );
}
