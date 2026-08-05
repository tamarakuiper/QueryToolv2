/*
 * Tiny SQL "LLM" — a rule/logic-based natural-language-to-SQL generator.
 *
 * It is NOT a neural network. It reads data/schema.json to learn the tables and
 * columns, then applies layered heuristics to a plain-English request:
 *   1. pick the best-matching table (synonym scoring)
 *   2. detect aggregate intent (count / sum / average / min / max)
 *   3. detect group-by ("by <column>")
 *   4. detect enum filters (status, type, tier, asset class, txn type)
 *   5. detect numeric thresholds ("over 100k", "at least $1m")
 *   6. detect date filters ("since 2021", "after 2026-01-01")
 *   7. detect ordering + limit ("top 5", "largest", "lowest")
 * It always scopes to the current firm (FirmId = @firmId).
 *
 * Output: { ok, sql, params, dataset, explanation, steps[], confidence, error }
 */
(function (global) {
  'use strict';

  function numericColumns(cols) {
    return Object.keys(cols).filter(name =>
      ['currency', 'number', 'integer'].includes(cols[name].type) &&
      name !== 'FirmId' && !/Id$/.test(name));
  }
  function primaryNumeric(cols) {
    const nums = numericColumns(cols);
    return nums.find(n => cols[n].type === 'currency') || nums[0] || null;
  }
  function dateColumn(cols) {
    return Object.keys(cols).find(n => cols[n].type === 'date') || null;
  }
  function enumColumns(cols) {
    return Object.keys(cols).filter(n => Array.isArray(cols[n].values));
  }

  function parseAmount(text) {
    // Returns { op, value } for the first threshold phrase found, else null.
    const re = /(>=|<=|>|<|at least|no less than|greater than|more than|over|above|at most|no more than|less than|under|below)\s+\$?\s*([\d][\d,\.]*)\s*(k|m|thousand|million|mm|bn|billion)?/i;
    const m = re.exec(text);
    if (!m) return null;
    let value = parseFloat(m[2].replace(/,/g, ''));
    const suffix = (m[3] || '').toLowerCase();
    if (suffix === 'k' || suffix === 'thousand') value *= 1e3;
    else if (suffix === 'm' || suffix === 'mm' || suffix === 'million') value *= 1e6;
    else if (suffix === 'bn' || suffix === 'billion') value *= 1e9;
    const word = m[1].toLowerCase();
    const isUpper = ['>=', 'at least', 'no less than'].includes(word);
    const isLower = ['<=', 'at most', 'no more than'].includes(word);
    let op;
    if (isUpper) op = '>=';
    else if (isLower) op = '<=';
    else if (['>', 'greater than', 'more than', 'over', 'above'].includes(word)) op = '>';
    else op = '<';
    return { op, value };
  }

  function parseDate(text) {
    // Returns { op, value: 'YYYY-MM-DD' } or null.
    const re = /(after|since|from|on or after|>=|before|until|prior to|<=|<)\s+(\d{4}-\d{2}-\d{2}|\d{4})/i;
    const m = re.exec(text);
    if (!m) return null;
    let value = m[2].length === 4 ? m[2] + '-01-01' : m[2];
    const word = m[1].toLowerCase();
    const op = ['before', 'until', 'prior to', '<=', '<'].includes(word) ? '<=' : '>=';
    return { op, value };
  }

  function quote(v) {
    return typeof v === 'string' ? "'" + v.replace(/'/g, "''") + "'" : String(v);
  }

  function generate(question, schema) {
    const q = (question || '').trim();
    if (!q) return { ok: false, error: 'Ask a question in plain English, e.g. "top 5 accounts by balance".' };
    const text = ' ' + q.toLowerCase().replace(/[?!.]/g, ' ').replace(/\s+/g, ' ') + ' ';
    const tables = schema.tables;
    const steps = [];

    // 1. Pick table by scoring synonyms + column mentions.
    let best = null, bestScore = 0;
    for (const key of Object.keys(tables)) {
      const t = tables[key];
      let score = 0;
      (t.synonyms || []).forEach(s => { if (text.includes(' ' + s + ' ') || text.includes(' ' + s)) score += 3; });
      Object.keys(t.columns).forEach(cn => {
        (t.columns[cn].synonyms || []).forEach(s => { if (text.includes(s)) score += 1; });
        (t.columns[cn].values || []).forEach(v => { if (text.includes(v.toLowerCase())) score += 2; });
      });
      if (score > bestScore) { bestScore = score; best = key; }
    }
    if (!best) { best = 'accounts'; steps.push('No clear table match — defaulting to accounts.'); }
    const table = tables[best];
    const cols = table.columns;
    steps.push('Table → ' + best + ' (' + table.label + ')');

    // 1b. Detect join intent — additional tables referenced beyond the primary.
    const referenced = new Set([best]);
    for (const key of Object.keys(tables)) {
      if (key === best) continue;
      const t = tables[key];
      const hit = (t.synonyms || []).some(s => text.includes(' ' + s + ' ') || text.includes(' ' + s + ','));
      if (hit) referenced.add(key);
    }
    const joinWords = /\b(join|joined|joining|combined with|along with|together with|with their|and their|including their|plus their|enrich|cross[- ]?reference|linked to)\b/;
    const isJoin = referenced.size > 1 || joinWords.test(text);
    if (isJoin) steps.push('Join detected → ' + [...referenced].join(' × '));

    const numCol = primaryNumeric(cols);
    const dCol = dateColumn(cols);
    const nameCol = Object.keys(cols).find(n => cols[n].type === 'string' && !/email/i.test(n)) || null;

    const where = ['FirmId = @firmId'];
    let orderBy = null, limit = null, groupBy = null;
    const selectAgg = [];

    // 2. Aggregate intent
    let aggFn = null, aggCol = null;
    if (/\b(how many|number of|count of|count)\b/.test(text)) { aggFn = 'COUNT'; aggCol = '*'; }
    else if (/\b(total|sum of|sum)\b/.test(text) && numCol) { aggFn = 'SUM'; aggCol = numCol; }
    else if (/\b(average|avg|mean)\b/.test(text) && numCol) { aggFn = 'AVG'; aggCol = numCol; }

    // 3. Group by ("by <col>" / "per <col>" / "grouped by <col>")
    const wantsTop = /\b(top|largest|highest|biggest|most|richest)\b/.test(text);
    const groupM = /\b(?:grouped by|group by|by|per|for each)\s+([a-z ]+?)(?:\s+(?:over|above|under|below|since|after|before|with|where|and|$))/.exec(text);
    if ((aggFn || /\b(per|for each|grouped by|breakdown)\b/.test(text)) && groupM) {
      const phrase = groupM[1].trim();
      const found = Object.keys(cols).find(cn =>
        (cols[cn].synonyms || []).some(s => phrase === s || phrase.startsWith(s) || s.startsWith(phrase)));
      if (found && !wantsTop) { groupBy = found; steps.push('Group by → ' + found); }
    }

    // 4. Enum filters
    enumColumns(cols).forEach(cn => {
      const matched = cols[cn].values.filter(v => text.includes(' ' + v.toLowerCase()) || text.includes(v.toLowerCase() + ' '));
      if (matched.length) {
        where.push(cn + ' IN (' + matched.map(quote).join(', ') + ')');
        steps.push('Filter → ' + cn + ' in ' + matched.join(', '));
      }
    });

    // 5. Numeric threshold
    const amt = numCol ? parseAmount(text) : null;
    if (amt) { where.push(numCol + ' ' + amt.op + ' ' + amt.value); steps.push('Filter → ' + numCol + ' ' + amt.op + ' ' + amt.value); }

    // 6. Date filter
    const dt = dCol ? parseDate(text) : null;
    if (dt) { where.push(dCol + ' ' + dt.op + " '" + dt.value + "'"); steps.push('Filter → ' + dCol + ' ' + dt.op + ' ' + dt.value); }

    // Symbol / ticker exact match
    if (cols.Symbol) {
      const symM = /\b(?:symbol|ticker)\s+([a-z.]{1,6})\b/.exec(text) || /\b([a-z]{2,5})\s+(?:holdings|positions|shares|stock)\b/.exec(text);
      if (symM) { where.push("Symbol = '" + symM[1].toUpperCase() + "'"); steps.push('Filter → Symbol = ' + symM[1].toUpperCase()); }
    }

    // 7. Ordering + limit
    const topM = /\b(?:top|first|bottom)\s+(\d+)\b/.exec(text) || /\b(\d+)\s+(?:largest|biggest|highest|top|smallest|lowest)\b/.exec(text);
    if (topM) limit = parseInt(topM[1], 10);
    const wantsBottom = /\b(bottom|lowest|smallest|least)\b/.test(text);
    if (!aggFn && numCol && (wantsTop || wantsBottom || limit)) {
      // Order by the column named after "by", else the primary numeric.
      let orderCol = numCol;
      const byM = /\bby\s+([a-z ]+?)(?:\s|$)/.exec(text);
      if (byM) {
        const found = Object.keys(cols).find(cn =>
          (cols[cn].synonyms || []).some(s => byM[1].trim() === s || byM[1].trim().startsWith(s)));
        if (found) orderCol = found;
      }
      orderBy = { col: orderCol, dir: wantsBottom ? 'ASC' : 'DESC' };
      if (!limit && (wantsTop || wantsBottom)) limit = 10;
      steps.push('Order by → ' + orderCol + ' ' + orderBy.dir + (limit ? ', limit ' + limit : ''));
    }

    // Build SELECT
    let selectClause;
    if (aggFn) {
      if (groupBy) selectAgg.push(groupBy);
      const alias = aggFn === 'COUNT' ? 'Count' : aggFn === 'SUM' ? 'Total' : aggFn === 'AVG' ? 'Average' : aggFn;
      selectAgg.push(aggFn + '(' + aggCol + ') AS ' + alias);
      selectClause = selectAgg.join(', ');
    } else {
      // Sensible default columns: id, name, enums, primary numeric, date.
      const chosen = [];
      const idCol = Object.keys(cols).find(n => /Id$/.test(n) && n !== 'FirmId');
      if (idCol) chosen.push(idCol);
      if (nameCol) chosen.push(nameCol);
      enumColumns(cols).forEach(c => chosen.push(c));
      if (cols.Symbol && !chosen.includes('Symbol')) chosen.unshift('Symbol');
      if (numCol && !chosen.includes(numCol)) chosen.push(numCol);
      if (dCol && !chosen.includes(dCol)) chosen.push(dCol);
      selectClause = (chosen.length ? chosen : ['*']).join(', ');
    }

    let sql = 'SELECT ' + selectClause + ' FROM ' + best + ' WHERE ' + where.join(' AND ');
    if (groupBy) sql += ' GROUP BY ' + groupBy;
    if (orderBy) sql += ' ORDER BY ' + orderBy.col + ' ' + orderBy.dir;
    if (limit) sql += ' LIMIT ' + limit;

    const confidence = Math.min(0.95, 0.35 + bestScore * 0.08 + (where.length - 1) * 0.1 + (aggFn ? 0.1 : 0) + (orderBy ? 0.05 : 0));

    // Cost estimate against notional production table sizes.
    const tableList = [...referenced];
    const sizes = tableList.map(k => (tables[k].estimatedRows || 100000));
    const cost = sizes.reduce((a, b) => a * b, 1);           // naive join fan-out
    const scanRows = sizes.reduce((a, b) => a + b, 0);
    const estimate = {
      isJoin,
      tables: tableList,
      tableSizes: sizes,
      cost,
      scanRows,
      note: isJoin
        ? 'Join of ' + tableList.map(k => tables[k].label + ' (~' + fmtRows(tables[k].estimatedRows) + ')').join(' × ')
        : 'Scan of ' + table.label + ' (~' + fmtRows(table.estimatedRows) + ' rows)'
    };
    if (isJoin) steps.push('Estimated cost → ' + fmtRows(cost) + ' row-comparisons across ' + tableList.length + ' tables');

    return {
      ok: true,
      sql,
      params: { firmId: null }, // firmId filled in by caller
      dataset: table.dataset,
      table: best,
      explanation: buildExplanation(best, table, { aggFn, aggCol, groupBy, orderBy, limit, where }),
      steps,
      confidence,
      estimate
    };
  }

  function fmtRows(n) {
    if (n >= 1e12) return (n / 1e12).toFixed(1).replace(/\.0$/, '') + 'T';
    if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(n);
  }

  function buildExplanation(key, table, info) {
    const parts = [];
    if (info.aggFn) parts.push('Computes ' + info.aggFn + (info.aggCol && info.aggCol !== '*' ? ' of ' + info.aggCol : '') + ' from ' + table.label.toLowerCase());
    else parts.push('Lists ' + table.label.toLowerCase());
    if (info.groupBy) parts.push('grouped by ' + info.groupBy);
    const filters = info.where.filter(w => !/FirmId/.test(w));
    if (filters.length) parts.push('where ' + filters.join(' and '));
    if (info.orderBy) parts.push('sorted by ' + info.orderBy.col + ' ' + (info.orderBy.dir === 'DESC' ? 'high→low' : 'low→high'));
    if (info.limit) parts.push('limited to ' + info.limit + ' rows');
    return parts.join(', ') + '.';
  }

  global.SQLLLM = { generate };
})(window);
