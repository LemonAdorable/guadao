"use client";

import { useEffect, useMemo, useState } from 'react';
import {
  useAccount,
  useChainId,
  useReadContract,
  useSwitchChain,
  useWriteContract,
  usePublicClient,
} from 'wagmi';
import { isAddress, parseAbi } from 'viem';

import { defaultChainId, getChainOptions } from '../../lib/appConfig';
import {
  makeStatus,
  statusReady,
  statusLoading,
  statusLoaded,
  statusError,
  statusNetworkMismatch,
  statusNoRpc,
  statusInvalidAddress,
  statusTxSubmitted,
  statusTxConfirming,
  statusTxConfirmed,
} from '../../lib/status';
import { useI18n } from '../components/LanguageProvider';
import CopyButton from '../components/CopyButton';
import StatusNotice from '../components/StatusNotice';

const AIRDROP_ABI = parseAbi([
  'function claim(address to,uint256 amount,bytes32[] proof)',
  'function claimed(address account) view returns (bool)',
]);

const shortAddress = (address) =>
  address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '-';

const normalizeAddress = (address) => (address ? address.toLowerCase() : '');

const parseProofJson = (text) => {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || !parsed.proofs) {
    throw new Error('Invalid proofs.json format');
  }
  return parsed;
};

export default function AirdropPage() {
  const { t } = useI18n();
  const chainOptions = useMemo(getChainOptions, []);
  const [targetChainId, setTargetChainId] = useState(defaultChainId || '');
  const [contractAddress, setContractAddress] = useState('');
  const [proofsUrl, setProofsUrl] = useState('');
  const [proofsStatus, setProofsStatus] = useState(
    makeStatus('empty', 'airdrop.proofs.status.empty')
  );
  const [proofs, setProofs] = useState(null);
  const [recipientAddress, setRecipientAddress] = useState('');
  const [claimAmount, setClaimAmount] = useState('');
  const [claimProof, setClaimProof] = useState('');
  const [claimStatus, setClaimStatus] = useState(statusReady());

  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain();
  const { writeContractAsync, isPending: isClaiming } = useWriteContract();
  const publicClient = usePublicClient();

  const chainMismatch = isConnected && targetChainId && chainId !== targetChainId;

  const claimedResult = useReadContract({
    address: isAddress(contractAddress) ? contractAddress : undefined,
    abi: AIRDROP_ABI,
    functionName: 'claimed',
    args: address ? [address] : undefined,
    query: {
      enabled: isAddress(contractAddress) && Boolean(address),
    },
  });

  useEffect(() => {
    const active = chainOptions.find((item) => item.id === Number(targetChainId));
    if (!active) return;
    setContractAddress((current) => current || active.airdropAddress || '');
    setProofsUrl((current) => current || active.proofsUrl || '');
  }, [chainOptions, targetChainId]);

  useEffect(() => {
    if (!address) return;
    setRecipientAddress(address);
    if (!proofs) return;
    const entry = proofs.proofs?.[normalizeAddress(address)];
    if (!entry) return;
    if (!claimAmount) {
      setClaimAmount(entry.amount);
    }
    if (!claimProof) {
      setClaimProof(JSON.stringify(entry.proof, null, 2));
    }
  }, [address, proofs, claimAmount, claimProof]);

  useEffect(() => {
    if (claimedResult.isError) {
      setClaimStatus(statusInvalidAddress());
    }
  }, [claimedResult.isError]);

  const claimEligibility = (() => {
    if (!address || !proofs) {
      return claimedResult.data ? t('airdrop.status.claimed.yes') : '-';
    }
    if (claimedResult.data) return t('airdrop.status.claimed.yes');
    const entry = proofs.proofs?.[normalizeAddress(address)];
    if (!entry) return t('airdrop.status.notEligible');
    return t('airdrop.status.eligible');
  })();

  const loadProofsFromUrl = async () => {
    const url = proofsUrl.trim();
    if (!url) {
      setProofsStatus(statusError('airdrop.proofs.url'));
      return;
    }
    setProofsStatus(statusLoading());
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const json = await response.json();
      const parsed = parseProofJson(JSON.stringify(json));
      setProofs(parsed);
      setProofsStatus(statusLoaded());
    } catch (error) {
      setProofsStatus(statusError('status.error', { message: error.message }));
    }
  };

  const loadProofsFromFile = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    setProofsStatus(statusLoading());
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseProofJson(reader.result);
        setProofs(parsed);
        setProofsStatus(statusLoaded());
      } catch (error) {
        setProofsStatus(statusError('status.error', { message: error.message }));
      }
    };
    reader.readAsText(file);
  };

  const fillFromProofs = () => {
    if (!proofs) {
      setClaimStatus(statusError('airdrop.proofs.status.empty'));
      return;
    }
    const addressInput = recipientAddress.trim();
    if (!isAddress(addressInput)) {
      setClaimStatus(statusInvalidAddress());
      return;
    }
    const entry = proofs.proofs?.[normalizeAddress(addressInput)];
    if (!entry) {
      setClaimStatus(statusError('airdrop.status.notEligible'));
      return;
    }
    setClaimAmount(entry.amount);
    setClaimProof(JSON.stringify(entry.proof, null, 2));
    setClaimStatus(statusLoaded());
  };

  const handleSwitchChain = async () => {
    if (!targetChainId) return;
    try {
      await switchChainAsync({ chainId: Number(targetChainId) });
    } catch (error) {
      setClaimStatus(statusNetworkMismatch());
    }
  };

  const handleClaim = async () => {
    if (!isConnected) {
      setClaimStatus(statusError('airdrop.status.disconnected'));
      return;
    }
    if (!isAddress(contractAddress)) {
      setClaimStatus(statusInvalidAddress());
      return;
    }
    if (!isAddress(recipientAddress)) {
      setClaimStatus(statusInvalidAddress());
      return;
    }
    if (!claimAmount.trim()) {
      setClaimStatus(statusError('airdrop.claim.amount'));
      return;
    }
    let amount;
    try {
      amount = BigInt(claimAmount.trim());
    } catch (error) {
      setClaimStatus(statusError('airdrop.claim.amount'));
      return;
    }
    let proof;
    try {
      proof = JSON.parse(claimProof.trim() || '[]');
      if (!Array.isArray(proof)) {
        throw new Error('Proof must be an array.');
      }
    } catch (error) {
      setClaimStatus(statusError('status.error', { message: error.message }));
      return;
    }
    if (chainMismatch) {
      setClaimStatus(statusNetworkMismatch());
      return;
    }
    if (!publicClient) {
      setClaimStatus(statusNoRpc());
      return;
    }
    try {
      setClaimStatus(statusTxSubmitted());
      const hash = await writeContractAsync({
        address: contractAddress,
        abi: AIRDROP_ABI,
        functionName: 'claim',
        args: [recipientAddress, amount, proof],
      });
      setClaimStatus(statusTxConfirming());
      await publicClient.waitForTransactionReceipt({ hash });
      setClaimStatus(statusTxConfirmed());
    } catch (error) {
      const message = error?.shortMessage || error?.message || 'Claim failed';
      setClaimStatus(statusError('status.error', { message }));
    }
  };

  return (
    <main className="layout">
      <section className="panel hero">
        <div>
          <p className="eyebrow">{t('airdrop.eyebrow')}</p>
          <h1>{t('airdrop.title')}</h1>
          <p className="lede">{t('airdrop.lede')}</p>
        </div>
        <div className="status-card">
          <div className="status-row">
            <span>{t('airdrop.status.wallet')}</span>
            <span>{isConnected ? t('airdrop.status.connected') : t('airdrop.status.disconnected')}</span>
          </div>
          <div className="status-row">
            <span>{t('airdrop.status.address')}</span>
            <span className="inline-group">
              {shortAddress(address)}
              <CopyButton value={address} />
            </span>
          </div>
          <div className="status-row">
            <span>{t('airdrop.status.network')}</span>
            <span>
              {chainId ? `${chainId}${chainMismatch ? ' (mismatch)' : ''}` : '-'}
            </span>
          </div>
          <div className="status-row">
            <span>{t('airdrop.status.claimed')}</span>
            <span>{claimEligibility}</span>
          </div>
          <p className="hint">{t('airdrop.lede')}</p>
        </div>
      </section>

      <section className="panel">
        <h2>{t('airdrop.config.title')}</h2>
        <div className="form-grid">
          <label className="field">
            <span>{t('airdrop.config.contract')}</span>
            <input
              value={contractAddress}
              placeholder="0x..."
              onChange={(event) => setContractAddress(event.target.value)}
            />
          </label>
          <label className="field">
            <span>{t('airdrop.config.network')}</span>
            <select
              value={targetChainId}
              onChange={(event) => setTargetChainId(Number(event.target.value))}
            >
              {chainOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label} ({option.id})
                </option>
              ))}
            </select>
          </label>
        </div>
        {chainMismatch && (
          <div className="notice">
            {t('airdrop.config.mismatch')}
            <button
              className="btn ghost"
              onClick={handleSwitchChain}
              disabled={isSwitching}
            >
              {isSwitching ? t('airdrop.config.switching') : t('airdrop.config.switch')}
            </button>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>{t('airdrop.proofs.title')}</h2>
        <div className="form-grid">
          <label className="field">
            <span>{t('airdrop.proofs.url')}</span>
            <input
              value={proofsUrl}
              onChange={(event) => setProofsUrl(event.target.value)}
            />
          </label>
          <button className="btn ghost" onClick={loadProofsFromUrl}>
            {t('airdrop.proofs.load')}
          </button>
          <label className="field">
            <span>{t('airdrop.proofs.upload')}</span>
            <input type="file" accept="application/json" onChange={loadProofsFromFile} />
          </label>
        </div>
        <StatusNotice status={proofsStatus} />
      </section>

      <section className="panel">
        <h2>{t('airdrop.claim.title')}</h2>
        <div className="form-grid">
          <label className="field">
            <span>{t('airdrop.claim.recipient')}</span>
            <input
              value={recipientAddress}
              placeholder="0x..."
              onChange={(event) => setRecipientAddress(event.target.value)}
            />
          </label>
          <label className="field">
            <span>{t('airdrop.claim.amount')}</span>
            <input
              value={claimAmount}
              placeholder="0"
              onChange={(event) => setClaimAmount(event.target.value)}
            />
          </label>
          <label className="field full">
            <span>{t('airdrop.claim.proof')}</span>
            <textarea
              value={claimProof}
              rows="4"
              placeholder='["0xabc...", "0xdef..."]'
              onChange={(event) => setClaimProof(event.target.value)}
            ></textarea>
          </label>
        </div>
        <div className="actions">
          <button className="btn ghost" onClick={fillFromProofs}>
            {t('airdrop.claim.fill')}
          </button>
          <button className="btn primary" onClick={handleClaim} disabled={isClaiming}>
            {isClaiming ? t('airdrop.claim.submitting') : t('airdrop.claim.submit')}
          </button>
        </div>
        <StatusNotice status={claimStatus} />
      </section>
    </main>
  );
}
