import type { ReactNode } from 'react';

/**
 * Yapay zekâ yanıtları için küçük, güvenli Markdown gösterimi. Yalnız başlık,
 * liste, alıntı, kalın ve satır içi kod desteklenir; çıktı React elemanlarıdır,
 * HTML enjeksiyonu yoktur.
 */
function inline(text: string, keyPrefix: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${index++}`;
    parts.push(token.startsWith('**') ? <strong key={key}>{token.slice(2, -2)}</strong> : <code key={key}>{token.slice(1, -1)}</code>);
    last = match.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

type Block =
  | { type: 'h'; level: 2 | 3; text: string }
  | { type: 'p'; text: string }
  | { type: 'quote'; text: string }
  | { type: 'ul' | 'ol'; items: string[] };

function parse(source: string): Block[] {
  const blocks: Block[] = [];
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ type: 'p', text: paragraph.join(' ') });
    paragraph = [];
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const quote = line.match(/^>\s?(.*)$/);
    if (!line.trim()) { flush(); continue; }
    if (heading) { flush(); blocks.push({ type: 'h', level: heading[1].length <= 2 ? 2 : 3, text: heading[2] }); continue; }
    if (bullet || numbered) {
      flush();
      const type = bullet ? 'ul' : 'ol';
      const text = (bullet || numbered)![1];
      const previous = blocks[blocks.length - 1];
      if (previous && previous.type === type) previous.items.push(text);
      else blocks.push({ type, items: [text] });
      continue;
    }
    if (quote) { flush(); blocks.push({ type: 'quote', text: quote[1] }); continue; }
    const previous = blocks[blocks.length - 1];
    // Liste maddesinin devam satırı
    if (!paragraph.length && previous && (previous.type === 'ul' || previous.type === 'ol') && /^\s{2,}/.test(raw)) {
      previous.items[previous.items.length - 1] += ` ${line.trim()}`;
      continue;
    }
    paragraph.push(line.trim());
  }
  flush();
  return blocks;
}

export function MiniMarkdown({ source }: { source: string }) {
  return (
    <div className="ac-md">
      {parse(source).map((block, index) => {
        const key = `b${index}`;
        if (block.type === 'h') return block.level === 2 ? <h3 key={key}>{inline(block.text, key)}</h3> : <h4 key={key}>{inline(block.text, key)}</h4>;
        if (block.type === 'quote') return <blockquote key={key}>{inline(block.text, key)}</blockquote>;
        if (block.type === 'p') return <p key={key}>{inline(block.text, key)}</p>;
        const items = block.items.map((item, itemIndex) => <li key={`${key}-${itemIndex}`}>{inline(item, `${key}-${itemIndex}`)}</li>);
        return block.type === 'ul' ? <ul key={key}>{items}</ul> : <ol key={key}>{items}</ol>;
      })}
    </div>
  );
}
