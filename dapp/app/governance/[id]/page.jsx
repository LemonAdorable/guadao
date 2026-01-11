"use client";

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useAccount, useChainId, useSwitchChain, usePublicClient, useWriteContract, useReadContract } from 'wagmi';
import { isAddress, parseAbi, formatUnits, keccak256, toBytes, decodeFunctionData } from 'viem';
import { defaultChainId, getChainOptions } from '../../../lib/appConfig';
import { statusReady, statusLoading, statusLoaded, statusError, statusTxSubmitted, statusTxConfirming, statusTxConfirmed, statusNetworkMismatch, statusNoRpc } from '../../../lib/status';
import { useI18n } from '../../components/LanguageProvider';
import StatusNotice from '../../components/StatusNotice';
import ExplorerLink from '../../components/ExplorerLink';
import MarkdownRenderer from '../../components/MarkdownRenderer';
import ScrollProgress from '../../components/ScrollProgress';
import GovernanceTimeline from '../../../components/GovernanceTimeline';
import CopyButton from '../../components/CopyButton';

const GOVERNOR_ABI = parseAbi([
    'event ProposalCreated(uint256 proposalId, address proposer, address[] targets, uint256[] values, string[] signatures, bytes[] calldatas, uint256 voteStart, uint256 voteEnd, string description)',
    'function state(uint256 proposalId) view returns (uint8)',
    'function proposalSnapshot(uint256 proposalId) view returns (uint256)',
    'function proposalDeadline(uint256 proposalId) view returns (uint256)',
    'function proposalVotes(uint256 proposalId) view returns (uint256 againstVotes, uint256 forVotes, uint256 abstainVotes)',
    'function castVote(uint256 proposalId, uint8 support)',
    'function hasVoted(uint256 proposalId, address account) view returns (bool)',
    'function queue(address[] targets, uint256[] values, bytes[] calldatas, bytes32 descriptionHash)',
    'function execute(address[] targets, uint256[] values, bytes[] calldatas, bytes32 descriptionHash)'
]);

const TOKEN_ABI = parseAbi([
    'function getVotes(address account) view returns (uint256)',
    'function delegates(address account) view returns (address)',
    'function delegate(address delegatee)',
    'function balanceOf(address account) view returns (uint256)'
]);



const shortAddress = (address) =>
    (address && typeof address === 'string') ? `${address.slice(0, 6)}...${address.slice(-4)}` : '-';

const formatDateTime = (timestamp) => {
    if (!timestamp) return '-';
    const date = new Date(Number(timestamp) * 1000);
    return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString();
};

export default function GovernanceDetailPage() {
    const { t, lang } = useI18n();
    const params = useParams();
    const chainOptions = useMemo(getChainOptions, []);
    const [targetChainId, setTargetChainId] = useState(defaultChainId || '');
    const [governorAddress, setGovernorAddress] = useState('');
    const [guaTokenAddress, setGuaTokenAddress] = useState('');

    const [proposalData, setProposalData] = useState(null);
    const [status, setStatus] = useState(statusReady());
    const [action, setAction] = useState('');
    const [userDelegatee, setUserDelegatee] = useState(null);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [delegateeInput, setDelegateeInput] = useState(''); // For input field

    const { address, isConnected } = useAccount();
    const chainId = useChainId();
    const { switchChainAsync, isPending: isSwitching } = useSwitchChain();
    const { writeContractAsync, isPending: isWriting } = useWriteContract();
    const publicClient = usePublicClient();

    // Read User Voting Power (Current)
    const votesResult = useReadContract({
        address: isAddress(guaTokenAddress) ? guaTokenAddress : undefined,
        abi: TOKEN_ABI,
        functionName: 'getVotes',
        args: address ? [address] : undefined,
        query: {
            enabled: isAddress(guaTokenAddress) && Boolean(address),
        },
    });

    // Read User Balance
    const balanceResult = useReadContract({
        address: isAddress(guaTokenAddress) ? guaTokenAddress : undefined,
        abi: TOKEN_ABI,
        functionName: 'balanceOf',
        args: address ? [address] : undefined,
        query: {
            enabled: isAddress(guaTokenAddress) && Boolean(address),
        },
    });

    const userCurrentVotes = votesResult.data || 0n;
    const userBalance = balanceResult.data || 0n;
    const formatGUA = (val) => `${formatUnits(val || 0n, 18)} GUA`;

    const proposalId = useMemo(() => {
        try {
            return params?.id ? BigInt(params.id) : null;
        } catch { return null; }
    }, [params]);

    const activeChainConfig = useMemo(() =>
        chainOptions.find((item) => item.id === Number(targetChainId)),
        [chainOptions, targetChainId]);

    const chainMismatch = isConnected && targetChainId && chainId !== targetChainId;

    // Sync chainId
    useEffect(() => {
        if (chainId && chainOptions.some(c => c.id === chainId)) {
            setTargetChainId(chainId);
        }
    }, [chainId, chainOptions]);

    // Set addresses
    useEffect(() => {
        if (!activeChainConfig) return;
        setGovernorAddress(activeChainConfig.governorAddress || '');
        setGuaTokenAddress(activeChainConfig.guaTokenAddress || '');
    }, [activeChainConfig]);

    // Fetch Logic
    useEffect(() => {
        const load = async () => {
            if (!publicClient || !isAddress(governorAddress) || proposalId === null) return;

            try {
                setStatus(statusLoading());

                // 1. Fetch State & Votes using Promise.all
                const [state, votes, hasVotedUser, snapshot, deadline, quorumVal] = await Promise.all([
                    publicClient.readContract({ address: governorAddress, abi: GOVERNOR_ABI, functionName: 'state', args: [proposalId] }),
                    publicClient.readContract({ address: governorAddress, abi: GOVERNOR_ABI, functionName: 'proposalVotes', args: [proposalId] }),
                    publicClient.readContract({ address: governorAddress, abi: GOVERNOR_ABI, functionName: 'hasVoted', args: [proposalId, address || '0x0000000000000000000000000000000000000000'] }),
                    publicClient.readContract({ address: governorAddress, abi: GOVERNOR_ABI, functionName: 'proposalSnapshot', args: [proposalId] }),
                    publicClient.readContract({ address: governorAddress, abi: GOVERNOR_ABI, functionName: 'proposalDeadline', args: [proposalId] }),
                    publicClient.readContract({ address: governorAddress, abi: GOVERNOR_ABI, functionName: 'quorum', args: [proposalId] }).catch(() => 0n),
                ]);

                // Fetch User's Voting Power at Snapshot & Current Delegatee
                let myVotes = 0n;
                let delegatee = '0x0000000000000000000000000000000000000000';
                if (address && isAddress(guaTokenAddress)) {
                    try {
                        const [pastVotes, currentDelegatee] = await Promise.all([
                            publicClient.readContract({
                                address: guaTokenAddress,
                                abi: parseAbi(['function getPastVotes(address, uint256) view returns (uint256)']),
                                functionName: 'getPastVotes',
                                args: [address, snapshot]
                            }),
                            publicClient.readContract({
                                address: guaTokenAddress,
                                abi: TOKEN_ABI,
                                functionName: 'delegates',
                                args: [address]
                            })
                        ]);
                        myVotes = pastVotes;
                        delegatee = currentDelegatee;
                    } catch (e) { console.warn('Failed to fetch token data', e); }
                }
                console.log('Debug Delegate:', { address, guaTokenAddress, delegatee, userBalance: balanceResult.data });
                setUserDelegatee(delegatee);

                // 2. Fetch Description from Event
                // 2. Fetch Description from Event
                const startBlock = activeChainConfig?.startBlock ? BigInt(activeChainConfig.startBlock) : 0n;
                const currentBlock = await publicClient.getBlockNumber();

                const CHUNK_SIZE = 50000n;
                const chunks = [];
                for (let i = startBlock; i <= currentBlock; i += CHUNK_SIZE) {
                    const toBlock = i + CHUNK_SIZE - 1n < currentBlock ? i + CHUNK_SIZE - 1n : currentBlock;
                    chunks.push({ from: i, to: toBlock });
                }

                // Fetch logs in chunks
                const logsChunks = await Promise.all(
                    chunks.map(async ({ from, to }) => {
                        try {
                            return await publicClient.getLogs({
                                address: governorAddress,
                                event: GOVERNOR_ABI[0],
                                // Note: proposalId is NOT indexed in standard Governor, so we must fetch all and filter client usage if strictly needed
                                // But since we are looking for ONE specific proposalId, we can filter in memory efficiently.
                                // However, viem gets everything.
                                // Optimization: If we could filter by non-indexed args, we would, but eth_getLogs generally doesn't support it standardly without extended APIs.
                                // We rely on client side filtering for the ID.
                                fromBlock: from,
                                toBlock: to
                            });
                        } catch (e) {
                            console.warn(`Failed to fetch governance logs range ${from}-${to}`, e);
                            return [];
                        }
                    })
                );

                const allLogs = logsChunks.flat();

                // Filter for the specific proposalId
                const log = allLogs.find(l => l.args && l.args.proposalId === proposalId);
                console.log('Found Proposal Log:', log);
                if (log?.args) {
                    console.log('Log Args Targets:', log.args.targets);
                    console.log('Log Args Calldatas:', log.args.calldatas);
                }

                setProposalData({
                    id: proposalId,
                    state: Number(state),
                    forVotes: votes ? votes[1] : 0n,
                    againstVotes: votes ? votes[0] : 0n,
                    abstainVotes: votes ? votes[2] : 0n,
                    hasVoted: hasVotedUser,
                    snapshot,
                    deadline,
                    quorum: quorumVal,
                    myVotes,
                    description: log?.args?.description || '',
                    proposer: log?.args?.proposer,
                    voteStart: log?.args?.voteStart,
                    voteEnd: log?.args?.voteEnd,
                    targets: log?.args?.targets || [],
                    values: log?.args?.values || [],
                    calldatas: log?.args?.calldatas || [],
                    signatures: log?.args?.signatures || [],
                });

                setStatus(statusLoaded());
            } catch (e) {
                console.error(e);
                setStatus(statusError('status.error', { message: e.message }));
            }
        };
        load();
    }, [publicClient, governorAddress, proposalId, address, activeChainConfig, guaTokenAddress]);

    // Voting
    const handleVote = async (support) => {
        if (!isConnected || chainMismatch) return;
        try {
            setAction('vote');
            setStatus(statusTxSubmitted());
            const hash = await writeContractAsync({
                address: governorAddress,
                abi: GOVERNOR_ABI,
                functionName: 'castVote',
                args: [proposalId, support]
            });
            setStatus(statusTxConfirming());
            await publicClient.waitForTransactionReceipt({ hash });
            setStatus(statusTxConfirmed());
            // Reload would be good here, but for now just status
        } catch (e) {
            if (e.message.includes('User rejected') || e.message.includes('User denied')) {
                setStatus(statusError('status.tx.rejected'));
            } else {
                setStatus(statusError('status.tx.failed', { reason: e.message }));
            }
        } finally {
            setAction('');
        }
    };

    // Delegate
    const handleDelegate = async () => {
        if (!isConnected || chainMismatch) return;
        try {
            setAction('delegate');
            setStatus(statusTxSubmitted());
            const hash = await writeContractAsync({
                address: guaTokenAddress,
                abi: TOKEN_ABI,
                functionName: 'delegate',
                args: [address]
            });
            setStatus(statusTxConfirming());
            await publicClient.waitForTransactionReceipt({ hash });
            setStatus(statusTxConfirmed());
            setUserDelegatee(address); // Optimistic update
        } catch (e) {
            if (e.message.includes('User rejected') || e.message.includes('User denied')) {
                setStatus(statusError('status.tx.rejected'));
            } else {
                setStatus(statusError('status.tx.failed', { reason: e.message }));
            }
        } finally {
            setAction('');
        }
    };

    // Queue (state 4 -> 5)
    const handleQueue = async () => {
        if (!isConnected || chainMismatch || !proposalData) return;
        try {
            setAction('queue');
            setStatus(statusTxSubmitted());
            const descriptionHash = keccak256(toBytes(proposalData.description));
            const hash = await writeContractAsync({
                address: governorAddress,
                abi: GOVERNOR_ABI,
                functionName: 'queue',
                args: [proposalData.targets, proposalData.values, proposalData.calldatas, descriptionHash]
            });
            setStatus(statusTxConfirming());
            await publicClient.waitForTransactionReceipt({ hash });
            setStatus(statusTxConfirmed());
        } catch (e) {
            if (e.message.includes('User rejected') || e.message.includes('User denied')) {
                setStatus(statusError('status.tx.rejected'));
            } else {
                setStatus(statusError('status.tx.failed', { reason: e.message }));
            }
        } finally {
            setAction('');
        }
    };

    // Execute (state 5 -> 7)
    const handleExecute = async () => {
        if (!isConnected || chainMismatch || !proposalData) return;
        try {
            setAction('execute');
            setStatus(statusTxSubmitted());
            const descriptionHash = keccak256(toBytes(proposalData.description));
            const hash = await writeContractAsync({
                address: governorAddress,
                abi: GOVERNOR_ABI,
                functionName: 'execute',
                args: [proposalData.targets, proposalData.values, proposalData.calldatas, descriptionHash]
            });
            setStatus(statusTxConfirming());
            await publicClient.waitForTransactionReceipt({ hash });
            setStatus(statusTxConfirmed());
        } catch (e) {
            if (e.message.includes('User rejected') || e.message.includes('User denied')) {
                setStatus(statusError('status.tx.rejected'));
            } else {
                setStatus(statusError('status.tx.failed', { reason: e.message }));
            }
        } finally {
            setAction('');
        }
    };


    return (
        <main className="layout">
            <ScrollProgress />
            <section className="panel hero">
                <div>
                    <p className="eyebrow">{t('proposal.detail.eyebrow')}</p>
                    <h1 style={{ wordBreak: 'break-all' }}>
                        {proposalData?.title ? proposalData.title : `${t('proposal.detail.title')}${proposalId?.toString() || '-'}`}
                    </h1>
                    <div className="hero-actions">
                        <button
                            className="mode-toggle"
                            type="button"
                            onClick={() => setShowAdvanced((c) => !c)}
                        >
                            {showAdvanced ? t('ui.mode.hideAdvanced') : t('ui.mode.showAdvanced')}
                        </button>
                    </div>
                </div>

                {proposalData && (
                    <>
                        <div className="status-card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem', alignItems: 'start' }}>
                            {/* Row 1 */}
                            <div>
                                <span className="muted">{t('admin.statusLabel')}</span>
                                <div style={{ fontSize: '1.2em', fontWeight: 'bold', marginTop: '6px' }}>
                                    <span className={`badge ${['Cancelled', 'Defeated', 'Expired'].includes(proposalData.stateString) ? 'error' : 'success'} large`}>
                                        {t(`governance.status.${proposalData.state}`) || proposalData.state}
                                    </span>
                                </div>
                            </div>

                            <div>
                                <span className="muted">{t('governance.snapshot')}</span>
                                <div style={{ marginTop: '6px', fontFamily: 'monospace', fontSize: '1.1em' }}>
                                    #{proposalData.snapshot.toString()}
                                </div>
                            </div>

                            <div>
                                <span className="muted">{t('governance.quorum')}</span>
                                <div style={{ marginTop: '6px', fontSize: '1.1em' }}>
                                    {formatUnits(proposalData.quorum, 18)} GUA
                                    <span className="muted" style={{ fontSize: '0.8em', marginLeft: '6px' }}>
                                        ({Number(proposalData.quorum) > 0 ? Math.min(((Number(proposalData.forVotes) + Number(proposalData.abstainVotes)) / Number(proposalData.quorum)) * 100, 100).toFixed(1) : '0'}%)
                                    </span>
                                </div>
                            </div>

                            {/* Row 2 */}
                            <div>
                                <span className="muted">{t('governance.proposer')}</span>
                                <div style={{ display: 'flex', alignItems: 'center', marginTop: '6px', gap: '6px' }}>
                                    <span style={{ fontFamily: 'monospace', fontSize: '1.1em' }}>{shortAddress(proposalData.proposer)}</span>
                                    <CopyButton value={proposalData.proposer} />
                                    <ExplorerLink chainId={chainId} value={proposalData.proposer} type="address" iconOnly />
                                </div>
                            </div>

                            {/* Votes Block */}
                            <div style={{ gridColumn: 'span 2', background: 'var(--bg-subtle)', padding: '10px 16px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div className="muted" style={{ fontSize: '0.9em' }}>{t('governance.votes.for')}</div>
                                    <div style={{ color: 'var(--success)', fontWeight: 'bold', fontSize: '1.2em' }}>
                                        {formatUnits(proposalData.forVotes, 18)}
                                    </div>
                                </div>
                                <div style={{ height: '30px', width: '1px', background: 'var(--border)' }}></div>
                                <div>
                                    <div className="muted" style={{ fontSize: '0.9em' }}>{t('governance.votes.against')}</div>
                                    <div style={{ color: 'var(--danger)', fontWeight: 'bold', fontSize: '1.2em' }}>
                                        {formatUnits(proposalData.againstVotes, 18)}
                                    </div>
                                </div>
                                <div style={{ height: '30px', width: '1px', background: 'var(--border)' }}></div>
                                <div>
                                    <div className="muted" style={{ fontSize: '0.9em' }}>{t('governance.myVotes')}</div>
                                    <div style={{ fontWeight: 'bold', fontSize: '1.2em' }}>
                                        {formatUnits(proposalData.myVotes || 0n, 18)}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </section>

            {/* Delegate Warning Section (New Placement) */}
            {isConnected && userBalance > 0n && userDelegatee === '0x0000000000000000000000000000000000000000' && (
                <div className="notice warning" style={{ marginBottom: '1.5rem', animation: 'fadeIn 0.3s' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <h3 style={{ margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {t('governance.warning.delegate.title')}
                        </h3>

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', fontSize: '0.9em', color: 'var(--muted)', marginTop: '4px' }}>
                            <div>
                                <span>{t('governance.delegate.yourVotes')} </span>
                                <strong style={{ color: 'var(--error)' }}>{formatGUA(userCurrentVotes)}</strong>
                            </div>
                            <div>
                                <span>{t('governance.delegate.yourBalance')} </span>
                                <strong style={{ color: 'var(--success)' }}>
                                    {formatGUA(userBalance)}
                                </strong>
                            </div>
                        </div>

                        <p style={{ margin: '0', fontSize: '0.95em', lineHeight: '1.5' }}>
                            {t('governance.warning.delegateCheck')}
                        </p>

                        <div style={{ marginTop: '4px', padding: '16px', background: 'var(--bg-sub)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                            <p style={{ marginBottom: '8px', fontSize: '0.9em', fontWeight: 'bold' }}>{t('governance.delegate.to')}</p>
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                                <input
                                    value={delegateeInput}
                                    onChange={(e) => setDelegateeInput(e.target.value)}
                                    placeholder={t('governance.delegate.placeholder')}
                                    style={{
                                        flex: 1,
                                        minWidth: '200px',
                                        padding: '10px 12px',
                                        fontSize: '0.95em',
                                        background: 'var(--input-bg)',
                                        border: '1px solid var(--border)',
                                        borderRadius: '6px',
                                        color: 'var(--fg)'
                                    }}
                                />
                                <button
                                    className="btn primary sm"
                                    onClick={handleDelegate}
                                    disabled={!!action || isWriting}
                                    style={{ whiteSpace: 'nowrap', padding: '10px 20px' }}
                                >
                                    {t('governance.delegate.action')}
                                </button>
                            </div>
                            <p style={{ fontSize: '0.85em', color: 'var(--muted)', marginTop: '8px', fontStyle: 'italic' }}>
                                {delegateeInput && isAddress(delegateeInput)
                                    ? t('governance.delegate.status.to', { address: `${delegateeInput.slice(0, 6)}...${delegateeInput.slice(-4)}` })
                                    : t('governance.delegate.status.self')}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            <section className="panel">
                <h2>{t('escrow.steps.title')}</h2>
                <GovernanceTimeline currentStatus={proposalData?.state} proposal={proposalData} />
            </section>

            {proposalData?.description && (
                <section className="panel">
                    <h2>{t('proposals.create.description')}</h2>
                    <MarkdownRenderer showToc={true}>{proposalData.description}</MarkdownRenderer>
                </section>
            )}

            {/* Actions Section */}
            {proposalData?.targets?.length > 0 && (
                <section className="panel">
                    <h2>{t('governance.actions.title')}</h2>
                    <div className="table-responsive">
                        <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                                    <th style={{ padding: '0.75rem' }}>#</th>
                                    <th style={{ padding: '0.75rem' }}>{t('governance.actions.target')}</th>
                                    <th style={{ padding: '0.75rem' }}>Action</th>
                                    <th style={{ padding: '0.75rem' }}>Details</th>
                                </tr>
                            </thead>
                            <tbody>
                                {proposalData.targets.map((target, idx) => {
                                    const signature = proposalData.signatures[idx];
                                    const calldata = proposalData.calldatas[idx];
                                    const value = proposalData.values[idx];

                                    // Decoding
                                    let type = 'Custom Call';
                                    let details = '';
                                    let raw = true;

                                    // 1. Native
                                    if (value > 0n && (!calldata || calldata === '0x')) {
                                        type = 'Native Transfer';
                                        details = `${formatUnits(value, 18)} ETH`;
                                        raw = false;
                                    }
                                    // 2. Decode Standard
                                    else if (calldata && calldata !== '0x') {
                                        try {
                                            const decoded = decodeFunctionData({
                                                abi: parseAbi([
                                                    'function transfer(address to, uint256 amount)',
                                                    'function approve(address spender, uint256 amount)',
                                                    'function transferFrom(address from, address to, uint256 amount)',
                                                    'function delegate(address delegatee)',
                                                    'function mint(address to, uint256 amount)'
                                                ]),
                                                data: calldata
                                            });
                                            type = decoded.functionName;
                                            details = decoded.args.map(arg => {
                                                if (typeof arg === 'bigint') return formatUnits(arg, 18);
                                                return arg.toString();
                                            }).join(', ');

                                            if (type === 'transfer' || type === 'approve') {
                                                const addr = decoded.args[0].toString();
                                                const amt = decoded.args[1];
                                                details = `To: ${addr.slice(0, 6)}...${addr.slice(-4)} | Amount: ${formatUnits(amt, 18)}`;
                                            }
                                            raw = false;
                                        } catch (e) { /* ignore */ }
                                    }

                                    return (
                                        <tr key={idx} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                            <td style={{ padding: '0.75rem' }}>{idx + 1}</td>
                                            <td style={{ padding: '0.75rem' }}>
                                                {target ? <ExplorerLink chainId={chainId} value={target} type="address" short /> : <span className="muted">Invalid Target</span>}
                                            </td>
                                            <td style={{ padding: '0.75rem', fontWeight: 'bold' }}>
                                                {signature || type}
                                            </td>
                                            <td style={{ padding: '0.75rem' }}>
                                                {raw ? (
                                                    <div className="code-block-sm" title={calldata} style={{
                                                        maxWidth: '300px',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap',
                                                        fontFamily: 'monospace',
                                                        background: 'var(--bg-subtle)',
                                                        padding: '4px',
                                                        borderRadius: '4px',
                                                        cursor: 'help'
                                                    }}>
                                                        {calldata || '0x'}
                                                    </div>
                                                ) : (
                                                    <span>{details}</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}

            <section className="panel">
                <h2>{t('governance.voting.title')}</h2>
                {proposalData?.state === 0 && (
                    <div className="status-message">
                        <p>{t('voting.window.pending', { time: formatDateTime(proposalData.voteStart) })}</p>
                    </div>
                )}

                {proposalData?.state === 1 && (
                    <>
                        {isConnected ? (
                            proposalData.hasVoted ? (
                                <p className="muted">{t('voting.steps.submit')} (Done)</p>
                            ) : (
                                <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                                    <button className="btn primary" onClick={() => handleVote(1)} disabled={!!action || proposalData.myVotes === 0n}>
                                        {t('governance.votes.for')}
                                    </button>
                                    <button className="btn secondary" onClick={() => handleVote(0)} disabled={!!action || proposalData.myVotes === 0n}>
                                        {t('governance.votes.against')}
                                    </button>
                                    <button className="btn ghost" onClick={() => handleVote(2)} disabled={!!action || proposalData.myVotes === 0n}>
                                        {t('governance.votes.abstain')}
                                    </button>
                                </div>
                            )
                        ) : (
                            <p className="muted">{t('wallet.connect')}</p>
                        )}
                        {isConnected && proposalData.myVotes === 0n && (
                            <p className="warning-text" style={{ color: 'orange', marginTop: '0.5rem' }}>
                                {t('governance.warning.noVotes')} {t('governance.warning.delegateCheck')}
                            </p>
                        )}
                    </>
                )}

                {/* Succeeded (4) -> Queue */}
                {proposalData?.state === 4 && (
                    <div className="actions">
                        <p className="muted" style={{ marginBottom: '1rem' }}>Proposal has succeeded. Queue it for execution.</p>
                        <button className="btn primary" onClick={handleQueue} disabled={!!action || isWriting}>
                            {t('governance.queue')}
                        </button>
                    </div>
                )}

                {/* Queued (5) -> Execute */}
                {proposalData?.state === 5 && (
                    <div className="actions">
                        <p className="muted" style={{ marginBottom: '1rem' }}>Proposal is queued. It can be executed after the timelock delay.</p>
                        <button className="btn primary" onClick={handleExecute} disabled={!!action || isWriting}>
                            {t('governance.execute')}
                        </button>
                    </div>
                )}

                {proposalData?.state === 2 && <p className="muted">Proposal Canceled</p>}
                {proposalData?.state === 3 && <p className="muted">Proposal Defeated</p>}
                {proposalData?.state === 6 && <p className="muted">Proposal Expired</p>}
                {proposalData?.state === 7 && <p className="muted">Proposal Executed</p>}
            </section>
        </main>
    );
}
