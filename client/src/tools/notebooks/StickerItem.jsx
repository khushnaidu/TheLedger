import ItemFrame from './ItemFrame';
import { STICKERS } from './stickers';

export default function StickerItem({ item, scale, selected, onSelect, onChange, onGestureStart, onDelete, onLayer }) {
  const def = STICKERS[item.kind];
  if (!def) return null;
  const size = 64 * (item.scale || 1);
  return (
    <ItemFrame
      item={item} scale={scale} selected={selected} resizeMode="scale"
      onSelect={onSelect} onChange={onChange} onGestureStart={onGestureStart} onDelete={onDelete} onLayer={onLayer}
      style={{ width: size, height: size }}
    >
      <div style={{ width: size, height: size }}>
        <def.Render />
      </div>
    </ItemFrame>
  );
}
