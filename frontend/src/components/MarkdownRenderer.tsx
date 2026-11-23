import React from 'react';

interface MarkdownRendererProps {
  content: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  if (!content) return null;

  // Split by double newline or table blocks
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let tableBuffer: string[] = [];
  let inTable = false;

  const renderInline = (text: string): React.ReactNode => {
    // 1. Bold + Code + Italics inline parser
    const parts: React.ReactNode[] = [];
    let remaining = text;
    let keyIdx = 0;

    // Regex for **bold**, `code`, and *italic*
    const inlineRegex = /(\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*)/;

    while (remaining) {
      const match = remaining.match(inlineRegex);
      if (!match) {
        parts.push(remaining);
        break;
      }

      const matchIndex = match.index || 0;
      if (matchIndex > 0) {
        parts.push(remaining.slice(0, matchIndex));
      }

      const fullMatch = match[0];
      if (fullMatch.startsWith('**')) {
        parts.push(
          <strong key={keyIdx++} className="font-semibold text-ink-light dark:text-ink-dark">
            {match[2]}
          </strong>
        );
      } else if (fullMatch.startsWith('`')) {
        parts.push(
          <code
            key={keyIdx++}
            className="font-mono text-[11px] px-1.5 py-0.5 bg-black/5 dark:bg-white/10 text-sage dark:text-sage rounded"
          >
            {match[3]}
          </code>
        );
      } else if (fullMatch.startsWith('*')) {
        parts.push(
          <em key={keyIdx++} className="italic text-muted">
            {match[4]}
          </em>
        );
      }

      remaining = remaining.slice(matchIndex + fullMatch.length);
    }

    return parts;
  };

  const flushTable = (rows: string[], key: number) => {
    if (rows.length < 2) return null;
    const headerRow = rows[0].split('|').map(c => c.trim()).filter(Boolean);
    const bodyRows = rows.slice(2).map(r => r.split('|').map(c => c.trim()).filter(Boolean));

    return (
      <div key={key} className="overflow-x-auto my-2 rounded-tile border border-hairline-light dark:border-hairline-dark">
        <table className="w-full text-[11px] text-left border-collapse">
          <thead>
            <tr className="bg-canvas-light dark:bg-black/20 text-muted font-medium border-b border-hairline-light dark:border-hairline-dark">
              {headerRow.map((h, i) => (
                <th key={i} className="py-1.5 px-2.5 font-medium">{renderInline(h)}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline-light dark:divide-hairline-dark">
            {bodyRows.map((r, ri) => (
              <tr key={ri} className="hover:bg-black/2 dark:hover:bg-white/2">
                {r.map((c, ci) => (
                  <td key={ci} className="py-1 px-2.5">{renderInline(c)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check if table line
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      inTable = true;
      tableBuffer.push(line.trim());
      continue;
    } else if (inTable) {
      elements.push(flushTable(tableBuffer, i));
      tableBuffer = [];
      inTable = false;
    }

    // Headings
    if (line.startsWith('### ')) {
      elements.push(
        <h4 key={i} className="text-xs font-bold text-ink-light dark:text-ink-dark mt-2.5 mb-1 tracking-tight">
          {renderInline(line.replace('### ', ''))}
        </h4>
      );
      continue;
    }
    if (line.startsWith('## ')) {
      elements.push(
        <h3 key={i} className="text-sm font-bold text-ink-light dark:text-ink-dark mt-3 mb-1 tracking-tight">
          {renderInline(line.replace('## ', ''))}
        </h3>
      );
      continue;
    }

    // Bullet items
    if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
      elements.push(
        <div key={i} className="flex items-start gap-2 my-0.5 text-xs">
          <span className="w-1.5 h-1.5 rounded-full bg-sage mt-1.5 shrink-0" />
          <span className="flex-1">{renderInline(line.trim().replace(/^[-*]\s+/, ''))}</span>
        </div>
      );
      continue;
    }

    // Empty lines
    if (!line.trim()) {
      elements.push(<div key={i} className="h-1.5" />);
      continue;
    }

    // Normal text
    elements.push(
      <p key={i} className="text-xs leading-relaxed my-0.5 text-ink-light dark:text-ink-dark">
        {renderInline(line)}
      </p>
    );
  }

  if (inTable && tableBuffer.length > 0) {
    elements.push(flushTable(tableBuffer, lines.length));
  }

  return <div className="space-y-0.5">{elements}</div>;
};
