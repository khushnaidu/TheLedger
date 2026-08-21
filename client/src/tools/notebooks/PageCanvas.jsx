import { useRef } from 'react';
import { PAGE_W, PAGE_H, newText, newLineText, newSticker, snapLineY } from './model';
import TextItem from './TextItem';
import ImageItem from './ImageItem';
import StickerItem from './StickerItem';
import InkLayer, { StrokeSvg } from './InkLayer';

const ITEM_COMPONENTS = { text: TextItem, image: ImageItem, sticker: StickerItem };

// One page of the spread, drawn at 700×920 logical units and scaled by the
// reader. Paper furniture comes from nb-paper-* classes; items sit above the
// paper, ink above the items (pointer-through unless the pen/eraser is out).
export default function PageCanvas({
  page, paperStyle, scale, tool, penColor, penSize, armedSticker,
  selectedId, onSelect, onToolDone,
  mutatePage, pushUndo,
}) {
  const pageRef = useRef(null);
  const items = page.content.items;
  const inkItems = items.filter((i) => i.type === 'ink');

  const toPagePoint = (e) => {
    const rect = pageRef.current.getBoundingClientRect();
    return [
      ((e.clientX - rect.left) / rect.width) * PAGE_W,
      ((e.clientY - rect.top) / rect.height) * PAGE_H,
    ];
  };

  const addItem = (item) => {
    mutatePage(page.id, (c) => ({ ...c, items: [...c.items, item] }));
    onSelect(item.id);
  };

  const patchItem = (id, patch) =>
    mutatePage(page.id, (c) => ({
      ...c,
      items: c.items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    }), { withUndo: false });

  const deleteItem = (id) => {
    mutatePage(page.id, (c) => ({ ...c, items: c.items.filter((i) => i.id !== id) }));
    onSelect(null);
  };

  // array order IS stacking order — front/back moves to the ends
  const moveLayer = (id, dir) =>
    mutatePage(page.id, (c) => {
      const it = c.items.find((i) => i.id === id);
      const rest = c.items.filter((i) => i.id !== id);
      return { ...c, items: dir === 'front' ? [...rest, it] : [it, ...rest] };
    });

  const handlePageClick = (e) => {
    const onPaper = e.target === e.currentTarget || e.target.classList?.contains('nb-paper-layer');
    if (tool === 'text') {
      const [x, y] = toPagePoint(e);
      addItem(newText(Math.min(x, PAGE_W - 260), y));
      onToolDone();
    } else if (tool === 'sticker' && armedSticker) {
      const [x, y] = toPagePoint(e);
      addItem(newSticker(x - 32, y - 32, armedSticker));
      onToolDone();
    } else if (tool === 'select' && onPaper) {
      // doc mode: click the paper and just start writing on that rule —
      // like placing a caret in a document. Empty boxes delete themselves
      // on blur, so a click that was only meant to deselect costs nothing.
      // preventDefault keeps the browser's mousedown focus-shift from
      // blurring the just-focused editable into self-deletion.
      e.preventDefault();
      const [x, rawY] = toPagePoint(e);
      const tx = Math.max(16, Math.min(x, PAGE_W - 140));
      addItem(newLineText(tx, snapLineY(paperStyle, rawY), PAGE_W - tx - 24));
    } else if (onPaper) {
      onSelect(null);
    }
  };

  return (
    <div
      ref={pageRef}
      className={`nb-page nb-paper-${paperStyle} ${tool === 'text' || tool === 'sticker' ? 'nb-page-placing' : ''}`}
      style={{ width: PAGE_W, height: PAGE_H, transform: `scale(${scale})` }}
      onPointerDown={handlePageClick}
    >
      <div className="nb-paper-layer nb-grain" />
      {paperStyle === 'ruled' && <div className="nb-paper-layer nb-margin" />}

      {items.map((item) => {
        if (item.type === 'ink') return <StrokeSvg key={item.id} item={item} />;
        const Comp = ITEM_COMPONENTS[item.type];
        if (!Comp) return null;
        return (
          <Comp
            key={item.id}
            item={item}
            scale={scale}
            paperStyle={paperStyle}
            selected={selectedId === item.id}
            onSelect={() => onSelect(item.id)}
            onChange={(patch) => patchItem(item.id, patch)}
            onGestureStart={() => pushUndo(page.id)}
            onDelete={() => deleteItem(item.id)}
            onLayer={(dir) => moveLayer(item.id, dir)}
          />
        );
      })}

      <InkLayer
        strokes={inkItems}
        tool={tool}
        penColor={penColor}
        penSize={penSize}
        scale={scale}
        onAddStroke={(stroke) => mutatePage(page.id, (c) => ({ ...c, items: [...c.items, stroke] }))}
        onEraseStroke={(id) => mutatePage(page.id, (c) => ({ ...c, items: c.items.filter((i) => i.id !== id) }))}
      />

      <span className="nb-pageno">{String(page.pageNumber).padStart(2, '0')}</span>
    </div>
  );
}
