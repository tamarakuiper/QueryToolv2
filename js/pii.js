/*
 * PII detector. Given result columns, flags fields that look like personally
 * identifiable information — names, addresses, email, phone, SSN, date of birth.
 * A result set is marked PII if it contains at least one such column; the UI
 * and saved reports surface a warning and tag the offending columns.
 *
 * Detection is by column name/label pattern, so it works even for ad-hoc SQL
 * from the assistant. A column may also opt in explicitly with `"pii": true`
 * in its metadata (and optionally `"piiCategory"`).
 */
(function (global) {
  'use strict';

  const RULES = [
    { cat: 'Name', re: /(^|_|\b)(name|client\s*name|account\s*name|full\s*name|first\s*name|last\s*name|display\s*name|contact)($|_|\b)/i },
    { cat: 'Address', re: /(address|street|\bcity\b|zip\b|zipcode|postal)/i },
    { cat: 'Email', re: /e-?mail/i },
    { cat: 'Phone', re: /(phone|mobile|\btel\b)/i },
    { cat: 'SSN', re: /(ssn|social\s*security|tax\s*id|\btin\b)/i },
    { cat: 'DOB', re: /(date\s*of\s*birth|\bdob\b|birth\s*date)/i }
  ];

  function patternCategory(col) {
    const hay = (col.field || '') + ' ' + (col.label || '');
    for (const r of RULES) if (r.re.test(hay)) return r.cat;
    return null;
  }
  function classify(col) {
    // Explicit opt-in wins, but still derive a granular category when possible.
    if (col.pii === true) return col.piiCategory || patternCategory(col) || 'PII';
    return patternCategory(col);
  }

  function detect(columns) {
    const fields = [];
    const categories = new Set();
    (columns || []).forEach(c => {
      const cat = classify(c);
      if (cat) { fields.push({ field: c.field, label: c.label || c.field, category: cat }); categories.add(cat); }
    });
    return { isPII: fields.length > 0, fields, categories: [...categories] };
  }

  function maskValue() { return '••••••••'; }

  global.PII = { detect, classify, maskValue };
})(window);
