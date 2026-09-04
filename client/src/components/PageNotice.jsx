import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

// NOTICE TO PATRONS — the house tutorial system. Every tool page gets a
// small printed instruction card: what the page is for, then the moves,
// each named by its real on-screen label. The card opens itself the
// first time a patron reaches a page and never again once they press
// Noted; the chip at the bottom-left reprints it on demand. One mount
// in App.jsx covers every route, hidden reader pages included.

const KEY = 'ledger_notices_seen';
const seen = () => {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
};
const markSeen = (id) => {
  try { localStorage.setItem(KEY, JSON.stringify([...new Set([...seen(), id])])); } catch { /* private mode */ }
};

// order matters: the deeper page must match before its parent
const NOTICES = [
  {
    id: 'notebook-reader',
    match: (p) => /^\/notebooks\/.+/.test(p),
    section: 'The Study',
    title: 'Inside a notebook',
    lead: 'A notebook that behaves like one: real leaves, turned by hand.',
    steps: [
      'Drag a page corner to turn it — right corners go forward, left corners go back. The arrow keys turn pages too.',
      'The palette on the left holds the pen, text, stickers, and pictures. Draw or write anywhere on the leaf.',
      'Flip past the last page to bind a fresh one. "Tear out page" removes the open one, after asking.',
      'It saves itself as you work — the stamp in the top bar says when.',
    ],
  },
  {
    id: 'notebooks',
    match: (p) => p.startsWith('/notebooks'),
    section: 'The Study',
    title: 'The stacks',
    lead: 'Notebooks with real pages — for whatever does not belong in a ledger.',
    steps: [
      '"+ bind new" makes a volume: name it, pick its cover and paper.',
      'Click a spine to open it and start writing or drawing.',
      'The × on a spine burns the volume. It asks twice.',
    ],
  },
  {
    id: 'paper-reader',
    match: (p) => /^\/research\/.+/.test(p),
    section: 'The Study',
    title: 'The reading desk',
    lead: 'Close reading for research: highlight the passages that matter, keep margin notes you can come back to when writing, and put questions to the consultant.',
    steps: [
      'Select any passage to mark it — pick a color and add a margin note if you like.',
      'MARGINS, in the right rail, collects every mark. Click one to jump back to its passage.',
      'ASK JANE hands him the selected passage. He answers from the paper and cites his pages.',
      'Drag the rail’s edge to resize it; double-click the edge to reset.',
    ],
  },
  {
    id: 'research',
    match: (p) => p.startsWith('/research'),
    section: 'The Study',
    title: 'The reading room',
    lead: 'For serious reading: keep your research papers and their notes in one place, work through the literature for a thesis or a survey, study a textbook chapter by chapter — with a consultant who has read every page you file.',
    steps: [
      'Drop a PDF on the intake tray to catalogue it. Title, authors, and year are read off page one; correct them with ✎.',
      'Label a drawer to make a collection, and file papers into it. Click a drawer to see what it holds.',
      'Click a paper to sit down and read it.',
      'Jane waits at the right edge. Ask him anything across the whole shelf — he answers with page citations.',
    ],
  },
  {
    id: 'applog',
    match: (p) => p.startsWith('/jobs/log'),
    section: 'The Classifieds',
    title: 'The application log',
    lead: 'The job hunt’s other half: a logbook of every posting you answered, and what came of it.',
    steps: [
      'Paste the whole posting into the intake slip and "File it as applied" — a clerk reads the company, role, location, and pay out of the paste.',
      'Tick the columns as word arrives: HEARD, INTV., OFFER — and NO when the door shuts. A NO strikes the line through.',
      'Click a line to unfold the posting as you pasted it; double-click the position to correct the clerk’s reading.',
      'The × strikes a line from the record. It asks twice.',
    ],
  },
  {
    id: 'jobs',
    match: (p) => p.startsWith('/jobs'),
    section: 'The Classifieds',
    title: 'The rewrite desk',
    lead: 'For job applications: keep resume masters on file and tailor a copy to each posting in minutes — a clerk does the rewording, and your .docx keeps every byte of its formatting.',
    steps: [
      'File a master with the pen — any .docx will do.',
      'The typewriter holds the latest master; click it to sit down. Drag sheets between the machine and the pile to swap.',
      'At the desk, tell the clerk what to change — or paste a whole job posting to tailor against it.',
      'Every change arrives as a proof. Set the good ones, spike the rest, and take the copy as Word or PDF.',
      'Nothing is kept: leave the desk and the tailored copy is gone. The master stays on the shelf.',
    ],
  },
  {
    id: 'finance-lines',
    match: (p) => p.startsWith('/finance/lines'),
    section: 'The Accounts',
    title: 'The sheet',
    lead: 'Every line in the book, one month at a time.',
    steps: [
      'Double-click a line to amend it. † means it came off a statement, ‡ means a clerk filed it.',
      'The search reaches the whole book, not just the open month. The chips narrow what shows.',
      'Tick lines to strike them together — bad imports go quickly this way.',
      '"Sort all" hands the uncategorized lines to the clerks.',
    ],
  },
  {
    id: 'finance',
    match: (p) => p.startsWith('/finance'),
    section: 'The Accounts',
    title: 'The household book',
    lead: 'For knowing where the money goes: import bank statements, track household spending by category and month, and get two clerks’ readings of the same book — they rarely agree.',
    steps: [
      '"Import statement" takes your bank’s CSV. Lines can also be written by hand in the sheet.',
      'The plate carves the period’s spending. Click a wedge for the lines behind it — and a remark from each desk.',
      'Month, Year, and All time set the period; ‹ › walk it. The strip below re-scopes on a click.',
      'Marx and Friedman wait at the right edge. Ask either one about the book — expect different answers.',
    ],
  },
  {
    id: 'wall',
    match: (p) => p.startsWith('/wall'),
    section: 'The Parlor',
    title: 'My wall',
    lead: 'A wall calendar for occasions, not obligations. Nothing here nags.',
    steps: [
      'Click a day to pin something to it — a line, a time, a gif.',
      'Flip months with the arrows at the top.',
      'Wire a Google or iCloud calendar under "wired calendars" and birthdays land by themselves, every year.',
    ],
  },
  {
    id: 'faceoff',
    match: (p) => p.startsWith('/faceoff'),
    section: 'The Parlor',
    title: 'The face-off',
    lead: 'A sanctioned rivalry: your ledger against a friend’s.',
    steps: [
      'Issue the challenge by email. The bout begins when they accept.',
      'The tape compares your week, stat by stat — ↓ marks the ones where fewer is finer.',
      'Pass notes across the ring; they are read on the other side.',
      'Dissolve the bout whenever. Nobody’s record is harmed.',
    ],
  },
  {
    id: 'sparring',
    match: (p) => p.startsWith('/sparring'),
    section: 'The Parlor',
    title: 'The sparring ring',
    lead: 'For the interview grind: leetcode and neetcode rounds counted daily, head to head — a separate bout from the Face-Off, with its own rival.',
    steps: [
      'Call out your sparring partner by email; the ring opens when they accept.',
      'Log each round: paste the problem link (it names itself), mark it solved or studied, and attach a receipt — a submission link or a screenshot.',
      'Both corners read the whole log. A round without proof is filed "on honor" for everyone to see.',
      'The tape counts rounds today, this week, all-time, hards felled, and your grind streak. The scoreline turns with each day.',
    ],
  },
  {
    id: 'board',
    match: (p) => p.startsWith('/board'),
    section: 'The Desk',
    title: 'The board',
    lead: 'Every entry as a card, filed by where it stands.',
    steps: [
      'Drag a card to reclassify it. Dropping one in DONE banks the XP.',
      'While you drag, a chute opens under the columns — drop a card there to burn it. There is an undo.',
      'Click a card to open and amend it.',
      'Done cards older than three days tidy themselves away; the archive keeps the record.',
    ],
  },
  {
    id: 'archive',
    match: (p) => p.startsWith('/list'),
    section: 'The Desk',
    title: 'The archive',
    lead: 'Every entry ever filed, in one table of record.',
    steps: [
      'The search and the filter rails narrow the record; the time rail cuts by when.',
      'Click a column head to sort. Click it again to reverse.',
      'Tick rows to strike several at once — every strike has an undo.',
      'Click a row to open the entry.',
    ],
  },
  {
    id: 'dashboard',
    match: (p) => p === '/',
    section: 'The Desk',
    title: 'The command center',
    lead: 'The front page: where your entries stand today.',
    steps: [
      '"Next on the docket" is what wants doing first — click a row to open it.',
      'File new work with + NEW ENTRY in the sidebar; it lands on the board.',
      'The sections at left are the rest of the paper: notebooks and papers in THE STUDY, the resume desk in THE CLASSIFIEDS, the household book in THE ACCOUNTS, the parlor for play.',
      'Gus waits at the right edge. Tell him what’s on and he files the entries for you.',
    ],
  },
];

export default function PageNotice() {
  const { pathname } = useLocation();
  const notice = NOTICES.find((n) => n.match(pathname));
  const [open, setOpen] = useState(false);

  // first arrival on a page opens its notice unprompted, once ever
  useEffect(() => {
    setOpen(!!notice && !seen().includes(notice.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notice && notice.id]);

  if (!notice) return null;
  const dismiss = () => { markSeen(notice.id); setOpen(false); };

  return (
    <div className="ntc-anchor">
      {open && (
        <aside className="ntc-card" role="note" aria-label="How this page works">
          <p className="ntc-kicker">Notice to patrons · {notice.section}</p>
          <p className="ntc-title">{notice.title}</p>
          <p className="ntc-lead">{notice.lead}</p>
          <ol className="ntc-steps">
            {notice.steps.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
          <button data-clicky className="ntc-noted" onClick={dismiss}>Noted.</button>
        </aside>
      )}
      <button data-clicky className={`ntc-chip ${open ? 'ntc-chip-on' : ''}`}
        title={open ? 'Fold the notice away' : 'How this page works'}
        onClick={() => (open ? dismiss() : setOpen(true))}>
        ¶ How this page works
      </button>
    </div>
  );
}
