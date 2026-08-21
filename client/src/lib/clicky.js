// A soft mechanical click, but only where it means something: sidebar
// tabs and buttons, and the big page-navigation moves (back to shelf,
// back to catalog, New Entry…). Everything else — ticket drags, pen-tray
// picks, canvas work — stays silent. Opt an element in with data-clicky.
// One template element, cloned per play so rapid clicks overlap.
const ALLOW = '[data-clicky], [data-clicky-zone] button, [data-clicky-zone] a';

let template = null;

function isClicky(target) {
  return target instanceof Element && !!target.closest(ALLOW);
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
