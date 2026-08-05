/* Formatting + CSV helpers driven by column `type` metadata. */
(function (global) {
  'use strict';

  const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const number = new Intl.NumberFormat('en-US');

  function formatValue(value, type) {
    if (value === null || value === undefined || value === '') return '—';
    switch (type) {
      case 'currency': return currency.format(Number(value));
      case 'number': return number.format(Number(value));
      case 'integer': return String(Number(value)); // IDs/counts — no thousands separators
      case 'date': return formatDate(value);
      default: return String(value);
    }
  }

  function formatDate(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  const TONES = {
    active: 'good', platinum: 'good', gold: 'good', buy: 'good', deposit: 'good', dividend: 'good', equity: 'info', etf: 'info',
    pending: 'warn', silver: 'info', sell: 'warn', withdrawal: 'warn', 'fixed income': 'info',
    frozen: 'bad', closed: 'muted', bronze: 'muted', fee: 'bad', cash: 'muted', alternative: 'accent'
  };
  function badgeTone(value) {
    const key = String(value).toLowerCase();
    if (TONES[key]) return TONES[key];
    let h = 0; for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 5;
    return ['info', 'accent', 'warn', 'good', 'muted'][h];
  }

  function toCSV(columns, rows) {
    const esc = v => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const header = columns.map(c => esc(c.label || c.field)).join(',');
    const body = rows.map(r => columns.map(c => esc(r[c.field])).join(',')).join('\n');
    return header + '\n' + body;
  }

  function downloadCSV(filename, columns, rows) {
    const blob = new Blob([toCSV(columns, rows)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  global.Fmt = { formatValue, formatDate, badgeTone, toCSV, downloadCSV, currency, number };
})(window);
