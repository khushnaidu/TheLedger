import ItemFrame from './ItemFrame';

const FRAMES = ['tape', 'polaroid', 'plain'];

export default function ImageItem({ item, scale, selected, onSelect, onChange, onGestureStart, onDelete, onLayer }) {
  const cycleFrame = () => {
    const next = FRAMES[(FRAMES.indexOf(item.frame) + 1) % FRAMES.length];
    onGestureStart();
    onChange({ frame: next });
  };

  return (
    <ItemFrame
      item={item} scale={scale} selected={selected} resizeMode="wh"
      onSelect={onSelect} onChange={onChange} onGestureStart={onGestureStart} onDelete={onDelete} onLayer={onLayer}
      style={{ width: item.w }}
    >
      {selected && (
        <div className="nb-text-controls" onPointerDown={(e) => e.stopPropagation()}>
          <button className="nb-text-ctl" onClick={cycleFrame}>{item.frame}</button>
        </div>
      )}
      <div className={`nb-photo nb-photo-${item.frame}`}>
        <img src={item.url} alt="" draggable={false}
          style={{ width: item.w, height: item.h, objectFit: 'cover' }} />
      </div>
    </ItemFrame>
  );
}
