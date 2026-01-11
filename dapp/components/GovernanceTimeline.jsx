"use client";

import { useI18n } from '../app/components/LanguageProvider';

const STATUS_CONFIG = [
    { status: 0, key: 'Pending' },
    { status: 1, key: 'Active' },
    { status: 2, key: 'Canceled' },
    { status: 3, key: 'Defeated' },
    { status: 4, key: 'Succeeded' },
    { status: 5, key: 'Queued' },
    { status: 6, key: 'Expired' },
    { status: 7, key: 'Executed' },
];

const formatDateTime = (timestamp) => {
    if (!timestamp) return '-';
    const date = new Date(Number(timestamp) * 1000);
    return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString();
};

export default function GovernanceTimeline({ currentStatus, proposal }) {
    const { t } = useI18n();

    // Lifecycle paths:
    // Success: Pending -> Active -> Succeeded -> Queued -> Executed
    // Defeat: Pending -> Active -> Defeated
    // Cancel: Pending -> Active -> Canceled (or from Pending)
    // Expired: Pending -> Active -> Succeeded -> Queued -> Expired

    const getTimelineSteps = () => {
        if (currentStatus === 2) return [0, 1, 2]; // Canceled
        if (currentStatus === 3) return [0, 1, 3]; // Defeated
        if (currentStatus === 7) return [0, 1, 4, 5, 7]; // Executed
        if (currentStatus === 6) return [0, 1, 4, 5, 6]; // Expired
        if (currentStatus === 5) return [0, 1, 4, 5, 7]; // Queued (target Executed)
        if (currentStatus === 4) return [0, 1, 4, 5, 7]; // Succeeded (target Executed)

        // Default Active/Pending path
        return [0, 1, 4, 5, 7];
    };

    const timelineSteps = getTimelineSteps();
    // Determine current index based on status
    // Note: status values (0-7) don't map linear to index for all cases, but map to step values

    // Find where the CURRENT status is in the active path
    let activeStepIndex = timelineSteps.indexOf(currentStatus);

    // Fallback: If current status is not in the path (e.g. we are at Active (1) but path shows Succeeded (4)), 
    // we need to set active index to where we are.
    if (activeStepIndex === -1) {
        // If we are Active (1), and path is [0, 1, 4, 5, 7], index is 1.
        // Logic: Iterate steps, if step <= currentStatus (conceptually), but that's hard for non-linear.
        // Simplified:
        if (currentStatus === 1) activeStepIndex = 1;
        if (currentStatus === 0) activeStepIndex = 0;
    }

    const getStepClassName = (stepStatus, index) => {
        if (stepStatus === currentStatus) return 'timeline-step active';
        if (index < activeStepIndex) return 'timeline-step done';
        return 'timeline-step pending';
    };

    const getStepInfo = (stepStatus) => {
        // Map status to labels
        const labels = {
            0: t('governance.status.0'), // Pending
            1: t('governance.status.1'), // Active
            2: t('governance.status.2'), // Canceled
            3: t('governance.status.3'), // Defeated
            4: t('governance.status.4'), // Succeeded
            5: t('governance.status.5'), // Queued
            6: t('governance.status.6'), // Expired
            7: t('governance.status.7'), // Executed
        };

        let time = null;
        if (stepStatus === 0) time = proposal?.voteStart ? formatDateTime(proposal.voteStart) : null;
        if (stepStatus === 1) time = proposal?.voteEnd ? `${t('voting.window.end')}: ${formatDateTime(proposal.voteEnd)}` : null;
        if (stepStatus === 5 && proposal?.eta) time = `ETA: ${formatDateTime(proposal.eta)}`;

        return {
            label: labels[stepStatus] || `Status ${stepStatus}`,
            time: time
        };
    };

    return (
        <div className="proposal-timeline">
            <div className="timeline-track">
                {timelineSteps.map((stepStatus, index) => {
                    const { label, time } = getStepInfo(stepStatus);
                    return (
                        <div key={stepStatus} className={getStepClassName(stepStatus, index)}>
                            <div className="timeline-dot">
                                {index < activeStepIndex ? '✓' : index + 1}
                            </div>
                            <div className="timeline-content">
                                <div className="timeline-label">{label}</div>
                                {time && <div className="timeline-time">{time}</div>}
                            </div>
                            {index < timelineSteps.length - 1 && (
                                <div className={`timeline-connector ${index < activeStepIndex ? 'done' : ''}`} />
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
