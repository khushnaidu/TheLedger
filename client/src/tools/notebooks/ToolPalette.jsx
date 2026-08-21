import { useRef } from 'react';
import { STICKERS } from './stickers';
import { INK_COLORS } from './model';

const TOOLS = [
  { id: 'select', label: 'Hand' },
  { id: 'pen', label: 'Pen' },
  { id: 'erase', label: 'Erase' },
  { id: 'text', label: 'Text' },
  { id: 'image', label: 'Photo' },
  { id: 'sticker', label: 'Stickers' },
];

export default function ToolPalette({
  tool, setTool,
  penColor, setPenColor, penSize, setPenSize,
  armedSticker, setArmedSticker,
  onImagePick, uploading,
  onUndo, canUndo,
}) {
  const fileRef = useRef(null);

  const pick = (id) => {
    if (id === 'image') {
      fileRef.current?.click();
      return;
    }
    setTool(id);
    if (id !== 'sticker') setArmedSticker(null);
  };

  return (
    <div data-no-click-sound className="nb-palette">
      <p className="nb-palette-title">Pen Tray</p>
      {TOOLS.map(({ id, label }) => (
        <button
          key={id}
          className={`nb-tool ${tool === id ? 'nb-tool-on' : ''}`}
          onClick={() => pick(id)}
          disabled={id === 'image' && uploading}
        >
          {id === 'image' && uploading ? 'Sticking…' : label}
        </button>
      ))}

      {tool === 'pen' && (
        <div className="nb-subtray">
          {Object.entries(INK_COLORS).map(([id, hex]) => (
            <button key={id}
              className={`nb-pen-swatch ${penColor === id ? 'nb-pen-swatch-on' : ''}`}
              style={{ background: hex }}
              onClick={() => setPenColor(id)}
              title={id}
            />
          ))}
          {[2, 5].map((s) => (
            <button key={s}
              className={`nb-pen-size ${penSize === s ? 'nb-pen-size-on' : ''}`}
              onClick={() => setPenSize(s)}
              title={s === 2 ? 'fine' : 'marker'}
            >
              <span style={{ width: s * 3, height: s * 3 }} />
            </button>
          ))}
        </div>
      )}

      {tool === 'sticker' && (
        <div className="nb-sticker-tray">
          {Object.entries(STICKERS).map(([kind, def]) => (
            <button key={kind}
              className={`nb-sticker-cell ${armedSticker === kind ? 'nb-sticker-cell-on' : ''}`}
              onClick={() => setArmedSticker(kind)}
              title={def.label}
            >
              {/* stickers render at their natural 64px and get scaled to the cell */}
              <span className="nb-sticker-fit"><def.Render /></span>
            </button>
          ))}
        </div>
      )}

      <div className="nb-palette-foot">
        <button className="nb-tool" onClick={onUndo} disabled={!canUndo}>Undo</button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onImagePick(file);
        }}
      />
    </div>
  );
}
