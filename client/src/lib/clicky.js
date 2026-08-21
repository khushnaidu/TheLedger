// A soft mechanical click under most interactions — buttons, links,
// pointer-cursor surfaces — EXCEPT inside [data-no-click-sound] zones:
// drag boards, notebook canvas + pen tray, PDF text selection, and the
// cabinet (which brings its own drawer sound). [data-clicky] forces a
// click even inside a silent zone. Cloned per play so rapid clicks
// overlap; volume low enough to be felt more than heard.
const CLICKABLE = 'button, a, [role="button"], input, select, textarea, label, summary';

let template = null;

function isClicky(target) {
  if (!(target instanceof Element)) return false;
  if (target.closest('[data-clicky]')) return true;
  if (target.closest('[data-no-click-sound]')) return false;
  if (target.closest(CLICKABLE)) return true;
  // custom interactive surfaces (spines, files, chips…) invite by cursor
  return getComputedStyle(target).cursor === 'pointer';
}

export function initClicky() {
  const onPointerDown = (e) => {
    if (e.pointerType !== 'mouse' && e.pointerType !== undefined) return;
    if (e.button !== 0) return;
    if (!isClicky(e.target)) return;
    try {
      if (!template) {
        template = new Audio('/art/mouseclick.mp3');
        template.preload = 'auto';
      }
      const a = template.cloneNode();
      a.volume = 0.07; // felt more than heard
      a.play().catch(() => {});
    } catch { /* silence is acceptable */ }
  };
  document.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true });
  return () => document.removeEventListener('pointerdown', onPointerDown, { capture: true });
}
