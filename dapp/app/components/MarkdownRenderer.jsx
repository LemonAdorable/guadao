"use client";

import { useState, useCallback, memo, useMemo, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkEmoji from 'remark-emoji';
import remarkDirective from 'remark-directive';
import remarkWikiLink from 'remark-wiki-link';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import rehypeExternalLinks from 'rehype-external-links';
import { visit } from 'unist-util-visit';
import { h } from 'hastscript';
import mermaid from 'mermaid';
import { useI18n } from './LanguageProvider';

// Initialize Mermaid
mermaid.initialize({
    startOnLoad: false,
    theme: 'dark',
    securityLevel: 'loose',
});

/**
 * Mermaid Component
 */
const Mermaid = ({ chart }) => {
    const ref = useRef(null);
    const [svg, setSvg] = useState('');
    const [id] = useState(`mermaid-${Math.random().toString(36).substr(2, 9)}`);

    useEffect(() => {
        if (chart && ref.current) {
            mermaid.render(id, chart).then(({ svg }) => {
                setSvg(svg);
            }).catch((error) => {
                console.error('Mermaid render error:', error);
                setSvg(`<div class="error">Failed to render diagram</div>`);
            });
        }
    }, [chart, id]);

    return (
        <div
            className="mermaid-wrapper"
            ref={ref}
            dangerouslySetInnerHTML={{ __html: svg }}
        />
    );
};

/**
 * Remark Plugin to transform directives to HTML
 * :::note
 * content
 * :::
 * -> <div class="admonition note">...</div>
 */
function remarkRehypeDirective() {
    return (tree) => {
        visit(tree, (node) => {
            if (
                node.type === 'containerDirective' ||
                node.type === 'leafDirective' ||
                node.type === 'textDirective'
            ) {
                const data = node.data || (node.data = {});
                const tagName = node.type === 'textDirective' ? 'span' : 'div';

                // Add CSS class based on directive name (note, warning, etc.)
                const validTypes = ['note', 'tip', 'warning', 'important', 'caution'];
                const type = validTypes.includes(node.name) ? node.name : 'note';

                data.hName = tagName;
                data.hProperties = h(tagName, {
                    class: `admonition ${type}`,
                    ...node.attributes,
                }).properties;
            }
        });
    };
}

/**
 * 提取代码块的纯文本内容
 */
function extractTextContent(node) {
    if (typeof node === 'string') return node;
    if (Array.isArray(node)) return node.map(extractTextContent).join('');
    if (node?.props?.children) return extractTextContent(node.props.children);
    return '';
}

function CodeBlock({ node, className, children, ...props }) {
    const { t } = useI18n();
    const [copied, setCopied] = useState(false);

    const isInline = !className && !node?.tagName;

    const match = /language-(\w+)/.exec(className || '');
    const language = match ? match[1] : '';

    const codeString = extractTextContent(children).replace(/\n$/, '');

    // Handle Mermaid
    if (language === 'mermaid') {
        return <Mermaid chart={codeString} />;
    }

    const lines = codeString.split('\n');

    const handleCopy = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(codeString);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    }, [codeString]);

    if (isInline) {
        return <code className="inline-code" {...props}>{children}</code>;
    }

    return (
        <div className="code-block-wrapper">
            <div className="code-block-header">
                {language && <span className="code-language">{language}</span>}
                <button
                    type="button"
                    className="copy-code-btn"
                    onClick={handleCopy}
                    title={t('markdown.copy')}
                >
                    {copied ? (
                        <>✓ {t('markdown.copied')}</>
                    ) : (
                        <>📋 {t('markdown.copy')}</>
                    )}
                </button>
            </div>
            <div className="code-block-content">
                <div className="line-numbers" aria-hidden="true">
                    {lines.map((_, i) => (
                        <span key={i}>{i + 1}</span>
                    ))}
                </div>
                <pre className={className}>
                    <code className={className} {...props}>
                        {children}
                    </code>
                </pre>
            </div>
        </div>
    );
}

const MemoizedCodeBlock = memo(CodeBlock);

function extractHeadings(markdown) {
    if (!markdown) return [];
    const headingRegex = /^(#{1,6})\s+(.+)$/gm;
    const headings = [];
    let match;
    while ((match = headingRegex.exec(markdown)) !== null) {
        const level = match[1].length;
        const text = match[2].trim();
        const id = text
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^\w\u4e00-\u9fff-]/g, '');
        headings.push({ level, text, id });
    }
    return headings;
}

function TableOfContents({ headings }) {
    const { t } = useI18n();

    if (!headings || headings.length === 0) return null;

    return (
        <nav className="toc">
            <div className="toc-title">{t('markdown.toc') || '目录'}</div>
            <ul className="toc-list">
                {headings.map((heading, index) => (
                    <li
                        key={index}
                        className={`toc-item toc-level-${heading.level}`}
                        style={{ paddingLeft: `${(heading.level - 1) * 12}px` }}
                    >
                        <a href={`#${heading.id}`}>{heading.text}</a>
                    </li>
                ))}
            </ul>
        </nav>
    );
}

export default function MarkdownRenderer({ children, showToc = false }) {
    const headings = useMemo(() => {
        if (!showToc) return [];
        return extractHeadings(children);
    }, [children, showToc]);

    return (
        <div className="markdown-container">
            {showToc && headings.length > 2 && (
                <TableOfContents headings={headings} />
            )}
            <div className="markdown-body">
                <ReactMarkdown
                    remarkPlugins={[
                        remarkGfm,
                        remarkMath,
                        remarkEmoji,
                        remarkDirective,
                        remarkRehypeDirective,
                        [remarkWikiLink, {
                            hrefTemplate: (permalink) => {
                                // Double bracket links: [[1]] -> /proposals/1, [[1#topic-1]] -> /proposals/1#topic-1
                                if (permalink.match(/^(\d+)(#.*)?$/)) { // Matches "123" or "123#topic-1"
                                    return `/proposals/${permalink}`;
                                }
                                // Fallback for pure text search if it's not a proposal ID
                                return `https://google.com/search?q=${permalink}`;
                            },
                            aliasDivider: '|',
                            pageResolver: (name) => [name.replace(/ /g, '-').toLowerCase()],
                            wikiLinkClassName: 'wiki-link',
                            newClassName: 'new-wiki-link'
                        }]
                    ]}
                    rehypePlugins={[
                        rehypeKatex,
                        rehypeHighlight,
                        rehypeSlug,
                        [rehypeAutolinkHeadings, {
                            behavior: 'prepend',
                            properties: { className: 'heading-anchor', 'aria-hidden': 'true', tabIndex: -1 },
                            content: { type: 'text', value: '' }
                        }],
                        [rehypeExternalLinks, {
                            target: '_blank',
                            rel: ['noopener', 'noreferrer']
                        }],
                    ]}
                    components={{
                        code: MemoizedCodeBlock,
                    }}
                >
                    {children}
                </ReactMarkdown>
            </div>
        </div>
    );
}
