import { useState } from 'react';
import { JANE_FACE } from '../../lib/theme';

// Jane's portrait, plain and simple. `crop` frames just the head (chat
// header); without it the full figure shows (edge peek). Falls back to a
// monogram card if the image is missing.
export default function JaneHead({ size = 96, crop = false }) {
  const [ok, setOk] = useState(true);
  if (!ok) {
    return <div className="jn-avatar jn-avatar-fallback" style={{ width: size, height: size }}>J</div>;
  }
  return (
    <div className={`jn-avatar ${crop ? 'jn-avatar-crop' : ''}`} style={{ width: size, height: size }}>
      <img src={JANE_FACE} alt="" draggable={false} onError={() => setOk(false)} />
    </div>
  );
}
