// Message formatting. Messages are sent with parse_mode 'HTML', so all dynamic
// text (names, rates, notes) is run through escapeHtml — only &, <, > need
// escaping in Telegram HTML, which keeps rates like "× 0.28" / "$30–50k" safe.

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function labelDay(d) {
  if (d === undefined || d === null) return 'end of month';
  if (typeof d === 'string' && d.toLowerCase() === 'last') return 'end of month';
  const n = Number(d);
  return Number.isFinite(n) ? ordinal(n) : String(d);
}

export function describeFrequency(creator) {
  const f = creator.frequency || {};
  switch (f.type) {
    case 'weekly':
      return `Weekly · ${f.day_of_week || 'Monday'}`;
    case 'biweekly':
      if (Array.isArray(f.days_of_month) && f.days_of_month.length) {
        return `Bi-weekly · ${f.days_of_month.map(labelDay).join(' & ')}`;
      }
      if (f.anchor_date) return `Bi-weekly · every 14 days from ${f.anchor_date}`;
      return 'Bi-weekly';
    case 'monthly':
      return `Monthly · ${labelDay(f.day_of_month)}`;
    case 'per_withdrawal':
      return 'Per withdrawal · check payout requests';
    case 'manual_review':
      return 'Manual review · no schedule yet';
    case 'salary':
      return 'Salary · excluded';
    default:
      return f.type || 'Unknown';
  }
}

// A creator entry in the daily message: bold name, rate on the same line,
// notes as a dim sub-line.
function dueItem(c) {
  const rate = c.method ? ` — ${escapeHtml(c.method)}` : '';
  let s = `• <b>${escapeHtml(c.name)}</b>${rate}`;
  if (c.notes) s += `\n   <i>↳ ${escapeHtml(c.notes)}</i>`;
  return s;
}

export function formatDaily({ now, report }) {
  const dateLabel = now.setLocale('en').toFormat('cccc d LLL'); // "Monday 3 Aug"
  const { due, needsSorting, digest, includeDigest } = report;

  const showDigest = includeDigest && digest.length > 0;
  if (!due.length && !needsSorting.length && !showDigest) {
    return `✅ <b>All clear · ${escapeHtml(dateLabel)}</b>\nNothing to invoice today.`;
  }

  const out = [`📋 <b>Invoices due · ${escapeHtml(dateLabel)}</b>`, ''];

  if (due.length) {
    for (const c of due) out.push(dueItem(c));
  } else {
    out.push('<i>Nothing on a fixed schedule today.</i>');
  }

  if (needsSorting.length) {
    out.push('', '<b>⚠️ Needs sorting</b> <i>— recurring until resolved</i>', '');
    for (const c of needsSorting) out.push(dueItem(c));
  }

  if (showDigest) {
    out.push('', '<b>🔁 Check payout requests</b>', '');
    for (const c of digest) out.push(`• <b>${escapeHtml(c.name)}</b>`);
  }

  return out.join('\n');
}

export function formatList(creators) {
  const scheduled = creators.filter(
    (c) => c.status !== 'manual_review' && c.frequency?.type !== 'salary' && c.status !== 'salary'
  );
  const review = creators.filter((c) => c.status === 'manual_review');
  const salary = creators.filter(
    (c) => c.frequency?.type === 'salary' || c.status === 'salary'
  );

  const byName = (a, b) => a.name.localeCompare(b.name);
  scheduled.sort(byName);
  review.sort(byName);
  salary.sort(byName);

  const out = [`📇 <b>Creators</b> <i>(${creators.length})</i>`, ''];

  out.push('<b>Scheduled</b>', '');
  if (scheduled.length) {
    for (const c of scheduled) {
      out.push(`• <b>${escapeHtml(c.name)}</b> — ${escapeHtml(describeFrequency(c))}`);
      if (c.method) out.push(`   <i>↳ ${escapeHtml(c.method)}</i>`);
    }
  } else {
    out.push('<i>(none)</i>');
  }

  if (review.length) {
    out.push('', '<b>⚠️ Needs sorting</b>', '');
    for (const c of review) out.push(`• <b>${escapeHtml(c.name)}</b>`);
  }

  if (salary.length) {
    out.push('', '<b>💤 Salary · excluded</b>', '');
    for (const c of salary) out.push(`• <b>${escapeHtml(c.name)}</b>`);
  }

  return out.join('\n');
}
