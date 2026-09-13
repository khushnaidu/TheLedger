// The brief, typeset. Renders the clerk's markdown subset — headings,
// bold, inline code, fenced blocks, lists — by hand, because a whole
// markdown dependency for five constructs would be poor economy.
// No clerk output (fail-open path) → the raw brief in a plain pre.

const inline = (text) => {
  // split on `code` first, then **bold** inside the prose runs
  const out = [];
  let k = 0;
  for (const chunk of text.split(/(`[^`]+`)/g)) {
    if (chunk.startsWith('`') && chunk.endsWith('`') && chunk.length > 2) {
      out.push(<code key={k++} className="gym-md-code-inline">{chunk.slice(1, -1)}</code>);
    } else {
      for (const b of chunk.split(/(\*\*[^*]+\*\*)/g)) {
        if (b.startsWith('**') && b.endsWith('**') && b.length > 4) {
          out.push(<strong key={k++}>{b.slice(2, -2)}</strong>);
        } else if (b) {
          out.push(b);
        }
      }
    }
  }
  return out;
};

function blocks(md) {
  const out = [];
  const fenced = md.split(/^```[^\n]*\n?/m);
  // odd indexes are inside fences
  fenced.forEach((part, fi) => {
    if (fi % 2 === 1) {
      out.push({ kind: 'pre', text: part.replace(/\n$/, '') });
      return;
    }
    let para = [];
    let list = [];
    const flushPara = () => { if (para.length) { out.push({ kind: 'p', text: para.join(' ') }); para = []; } };
    const flushList = () => { if (list.length) { out.push({ kind: 'ul', items: list }); list = []; } };
    for (const line of part.split('\n')) {
      const t = line.trim();
      if (!t) { flushPara(); flushList(); continue; }
      const h = t.match(/^(#{1,4})\s+(.*)/);
      const li = t.match(/^[-*]\s+(.*)/);
      if (h) { flushPara(); flushList(); out.push({ kind: 'h', text: h[2] }); }
      else if (li) { flushPara(); list.push(li[1]); }
      else { flushList(); para.push(t); }
    }
    flushPara();
    flushList();
  });
  return out;
}

export default function BriefMd({ md, fallback }) {
  if (!md?.trim()) return <pre className="gym-brief-raw">{fallback}</pre>;
  return (
    <div className="gym-md">
      {blocks(md).map((b, i) => {
        if (b.kind === 'h') return <p key={i} className="gym-md-h">{inline(b.text)}</p>;
        if (b.kind === 'pre') return <pre key={i} className="gym-md-pre">{b.text}</pre>;
        if (b.kind === 'ul') return (
          <ul key={i} className="gym-md-ul">
            {b.items.map((it, j) => <li key={j}>{inline(it)}</li>)}
          </ul>
        );
        return <p key={i} className="gym-md-p">{inline(b.text)}</p>;
      })}
    </div>
  );
}
