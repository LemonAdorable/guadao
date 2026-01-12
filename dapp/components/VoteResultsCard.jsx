"use client";

import { useMemo } from 'react';
import { formatUnits } from 'viem';
import { useI18n } from '../app/components/LanguageProvider';

export default function VoteResultsCard({ proposalData, quorum, symbol = 'GUA' }) {
    const { t } = useI18n();

    // proposalData should have:
    // forVotes, againstVotes, abstainVotes (BigInt)
    // status (to show if passed)

    const stats = useMemo(() => {
        if (!proposalData) return null;
        const forVotes = BigInt(proposalData.forVotes || 0n);
        const againstVotes = BigInt(proposalData.againstVotes || 0n);
        const abstainVotes = BigInt(proposalData.abstainVotes || 0n);

        const totalVotes = forVotes + againstVotes + abstainVotes;
        const total = Number(formatUnits(totalVotes, 18)); // Assuming 18 decimals

        // Avoid division by zero
        const safeTotal = total === 0 ? 1 : total;

        const forVal = Number(formatUnits(forVotes, 18));
        const againstVal = Number(formatUnits(againstVotes, 18));
        const abstainVal = Number(formatUnits(abstainVotes, 18));

        return {
            for: forVal,
            against: againstVal,
            abstain: abstainVal,
            total: total,
            forPercent: (forVal / safeTotal) * 100,
            againstPercent: (againstVal / safeTotal) * 100,
            abstainPercent: (abstainVal / safeTotal) * 100,
        };
    }, [proposalData]);

    const quorumVal = quorum ? Number(formatUnits(quorum, 18)) : 0;
    const quorumPercent = (stats?.total && quorumVal > 0) ? Math.min((stats.total / quorumVal) * 100, 100) : 0;
    const quorumReached = stats?.total >= quorumVal;

    if (!stats) return null;

    return (
        <div className="vote-results-card">
            <h3>{t('proposal.results.title') || 'Results'}</h3>

            <div className="result-row">
                <div className="result-header">
                    <span className="label type-for">{t('governance.votes.for')}</span>
                    <span className="value">{stats.for.toLocaleString(undefined, { maximumFractionDigits: 2 })} {symbol}</span>
                </div>
                <div className="progress-bar-bg">
                    <div className="progress-bar type-for" style={{ width: `${stats.forPercent}%` }}></div>
                </div>
                <div className="result-meta">
                    <span>{stats.forPercent.toFixed(2)}%</span>
                </div>
            </div>

            <div className="result-row">
                <div className="result-header">
                    <span className="label type-against">{t('governance.votes.against')}</span>
                    <span className="value">{stats.against.toLocaleString(undefined, { maximumFractionDigits: 2 })} {symbol}</span>
                </div>
                <div className="progress-bar-bg">
                    <div className="progress-bar type-against" style={{ width: `${stats.againstPercent}%` }}></div>
                </div>
                <div className="result-meta">
                    <span>{stats.againstPercent.toFixed(2)}%</span>
                </div>
            </div>

            <div className="result-row">
                <div className="result-header">
                    <span className="label type-abstain">{t('governance.votes.abstain')}</span>
                    <span className="value">{stats.abstain.toLocaleString(undefined, { maximumFractionDigits: 2 })} {symbol}</span>
                </div>
                <div className="progress-bar-bg">
                    <div className="progress-bar type-abstain" style={{ width: `${stats.abstainPercent}%` }}></div>
                </div>
                <div className="result-meta">
                    <span>{stats.abstainPercent.toFixed(2)}%</span>
                </div>
            </div>

            <div className="result-divider" />

            {quorumVal > 0 && (
                <div className="quorum-section">
                    <div className="result-header">
                        <span className="label">{t('governance.quorum')}</span>
                        <span className="value">
                            {stats.total.toLocaleString(undefined, { maximumFractionDigits: 0 })} / {quorumVal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </span>
                    </div>
                    <div className="progress-bar-bg">
                        <div className="progress-marker" style={{ left: `${Math.min(100, (quorumVal / (stats.total || 1)) * 100)}%` }} />
                        {/* Actually quorum progress calculates how much of Quorum is met. 
                            If Total > Quorum, bar is full.
                        */}
                        <div
                            className={`progress-bar ${quorumReached ? 'type-success' : 'type-neutral'}`}
                            style={{ width: `${Math.min((stats.total / quorumVal) * 100, 100)}%` }}
                        ></div>
                    </div>
                    <div className="result-meta">
                        {quorumReached ? (
                            <span className="text-success">✓ {t('governance.quorum.reached') || 'Quorum Reached'}</span>
                        ) : (
                            <span className="text-muted">{t('governance.quorum.needed') || 'Quorum Needed'}</span>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
