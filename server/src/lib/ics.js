// Minimal ICS parser for wall-calendar purposes: day-precision dates only.
// DTSTART digits are taken verbatim (the date in the event's own timezone),
// which for "what day is this on" is more faithful than any TZ conversion.

function unfold(text) {
  return text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
}

function unescapeText(s) {
  return s.replace(/\\n/gi, ' — ').replace(/\\([,;\\])/g, '$1').trim();
}

function parseICS(text) {
  const lines = unfold(text).split('\n');
  const events = [];
  let cur = null;
  for (const line of lines) {
    if (line.startsWith('BEGIN:VEVENT')) { cur = {}; continue; }
    if (line.startsWith('END:VEVENT')) {
      if (cur && cur.dtstart && cur.summary) events.push(cur);
      cur = null;
      continue;
    }
    if (!cur) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).split(';')[0].toUpperCase();
    const value = line.slice(idx + 1);
    if (key === 'SUMMARY') cur.summary = unescapeText(value);
    else if (key === 'DTSTART') {
      const m = value.match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})\d{0,2}(Z)?)?/);
      if (m) {
        cur.dtstart = `${m[1]}-${m[2]}-${m[3]}`;
        if (m[4]) {
          // timed event — keep the wall-clock digits; flag UTC stamps so the client can localize
          cur.time = `${m[4]}:${m[5]}`;
          cur.timeIsUtc = !!m[6];
        }
      }
    } else if (key === 'UID') cur.uid = value.trim();
    else if (key === 'RRULE') cur.rrule = value.trim();
  }
  return events;
}

function isRealDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getMonth() === m - 1 && dt.getDate() === d;
}

// Expand into concrete occurrences inside [windowStart, windowEnd].
// Yearly rules (birthdays, anniversaries) are projected across the window;
// other recurrence frequencies just keep their original date for now.
function expandOccurrences(events, windowStart, windowEnd) {
  const out = [];
  const seen = new Set();
  for (const ev of events) {
    const uid = ev.uid || `${ev.summary}@${ev.dtstart}`;
    const freq = ev.rrule ? (ev.rrule.match(/FREQ=([A-Z]+)/) || [])[1] : null;
    const push = (date) => {
      const key = `${uid}:${date}`;
      if (seen.has(key) || !isRealDate(date)) return;
      seen.add(key);
      out.push({ date, title: ev.summary, uid, time: ev.time || null, timeIsUtc: !!ev.timeIsUtc });
    };
    if (freq === 'YEARLY') {
      const until = ev.rrule.match(/UNTIL=(\d{4})(\d{2})(\d{2})/);
      const untilStr = until ? `${until[1]}-${until[2]}-${until[3]}` : null;
      const [, mm, dd] = ev.dtstart.split('-');
      for (let y = Number(windowStart.slice(0, 4)); y <= Number(windowEnd.slice(0, 4)); y++) {
        const date = `${y}-${mm}-${dd}`;
        if (date >= ev.dtstart && date >= windowStart && date <= windowEnd && (!untilStr || date <= untilStr)) {
          push(date);
        }
      }
    } else if (ev.dtstart >= windowStart && ev.dtstart <= windowEnd) {
      push(ev.dtstart);
    }
  }
  return out;
}

module.exports = { parseICS, expandOccurrences };
