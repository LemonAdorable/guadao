'use client';
import { useI18n } from './LanguageProvider';

export default function Footer() {
    const { t } = useI18n();
    return (
        <footer style={{
            padding: '2rem 1rem',
            textAlign: 'center',
            fontSize: '0.875rem',
            color: 'var(--text-secondary, #666)',
            borderTop: '1px solid var(--border-color, rgba(0,0,0,0.1))',
            marginTop: 'auto', // Push to bottom if flex container
            background: 'var(--card-bg, rgba(255,255,255,0.5))',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
        }}>
            <div>
                {t('footer.copyright')}
            </div>
        </footer>
    );
}
