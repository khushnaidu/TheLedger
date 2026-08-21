// The real steel: /art/drawer.mp3 (user-supplied, ~0.9s). One template
// element, cloned per play so rapid open/shut can overlap; 'shut' runs a
// touch faster and quieter so the two directions read differently.
// Every call is best-effort — sound is seasoning, never a blocker.
let template = null;

export function drawerSound(kind) {
  try {
    if (!template) {
      template = new Audio('/art/drawer.mp3');
      template.preload = 'auto';
    }
    const a = template.cloneNode();
    a.playbackRate = kind === 'shut' ? 1.18 : 1;
    a.volume = kind === 'shut' ? 0.45 : 0.6;
    a.play().catch(() => {});
  } catch { /* no audio, no problem */ }
}
