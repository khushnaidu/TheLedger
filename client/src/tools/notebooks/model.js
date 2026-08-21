// Fixed logical page space — everything is stored in these units and the
// whole page scales uniformly to fit the viewport.
export const PAGE_W = 700;
export const PAGE_H = 920;

// client-side guardrail; the server rejects at 400KB
export const MAX_PAGE_BYTES = 300_000;

export const FONTS = {
  cute: "'Cute Notebook', 'Gochi Hand', cursive",
  gochi: "'Gochi Hand', cursive",
  magnetic: "'Magnetic Drawing', 'Gochi Hand', cursive",
  cedarville: "'Cedarville Cursive', 'Gochi Hand', cursive",
  mono: "'IBM Plex Mono', monospace",
};

// ruled-paper geometry: rules every RULE_GAP px, first writing band tops at RULE_TOP
export const RULE_TOP = 64;
export const RULE_GAP = 28;

// snap a y coordinate to the top of the writing band the user clicked in
export function snapLineY(paperStyle, y) {
  if (paperStyle === 'ruled') {
    return Math.max(8, RULE_TOP + RULE_GAP * Math.floor((y - RULE_TOP) / RULE_GAP));
  }
  if (paperStyle === 'grid' || paperStyle === 'dot') {
    return Math.max(8, RULE_GAP * Math.floor(y / RULE_GAP));
  }
  return y;
}

// line-height locked to the rule rhythm so every line of text lands on a rule
export function lineHeightFor(paperStyle, size) {
  if (paperStyle === 'plain') return 1.35;
  return `${Math.max(RULE_GAP, Math.ceil((size * 1.25) / RULE_GAP) * RULE_GAP)}px`;
}

export const INK_COLORS = { ink: '#221c13', stamp: '#c41e1e' };

export const uid = () => Math.random().toString(36).slice(2, 10);

const tilt = () => Math.round((Math.random() * 4 - 2) * 10) / 10;

export const newText = (x, y) => ({
  id: uid(), type: 'text', x, y, w: 240, rot: tilt(),
  font: 'cute', size: 20, color: 'ink', text: '',
});

// doc-mode text: created by clicking the paper, runs to the right edge,
// no tilt — it should read like lines written on the rules
export const newLineText = (x, y, w) => ({
  id: uid(), type: 'text', x, y, w, rot: 0,
  font: 'cute', size: 20, color: 'ink', text: '',
});

export const newImage = (x, y, url, w, h) => ({
  id: uid(), type: 'image', x, y, w, h, rot: tilt(), url, frame: 'tape',
});

export const newSticker = (x, y, kind) => ({
  id: uid(), type: 'sticker', x, y, scale: 1, rot: tilt(), kind,
});

export const newInk = (color, size, points) => ({
  id: uid(), type: 'ink', color, size, points,
});

export const pageBytes = (content) => JSON.stringify(content).length;
