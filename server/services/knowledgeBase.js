'use strict';

const { getPool, sql } = require('../db/sql');

/**
 * Searches the knowledge_base table for articles matching the given keyword phrase.
 *
 * Strategy:
 *  1. Split the keyword string into individual words (tokens).
 *  2. Build a SQL query that retrieves all KB rows where the `keywords` column
 *     LIKE-matches ANY of those tokens (case-insensitive via LOWER()).
 *  3. Return the candidate rows to JS, then rank each row by how many tokens
 *     appear in its keywords string.
 *  4. Sort descending by match count and return the top 3.
 *
 * @param {string} keyword - The raw search string from the caller (e.g. "vpn connect")
 * @returns {Promise<Array<{id, issueType, title, solution, keywords, matchCount}>>}
 */
async function searchKB(keyword) {
  // ── Step 1: tokenise ──────────────────────────────────────────────────────
  const tokens = keyword
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // strip punctuation
    .split(/\s+/)
    .filter((t) => t.length >= 2); // ignore single-char tokens

  if (tokens.length === 0) return [];

  // ── Step 2: build parameterised LIKE query ────────────────────────────────
  // Build:  LOWER(keywords) LIKE @t0 OR LOWER(keywords) LIKE @t1 ...
  const pool = await getPool();
  const request = pool.request();

  const conditions = tokens.map((token, i) => {
    request.input(`t${i}`, sql.NVarChar, `%${token}%`);
    return `LOWER(keywords) LIKE @t${i}`;
  });

  const query = `
    SELECT id, issueType, title, solution, keywords
    FROM   dbo.knowledge_base
    WHERE  ${conditions.join(' OR ')}
  `;

  const result = await request.query(query);
  const rows = result.recordset;

  if (rows.length === 0) return [];

  // ── Step 3: rank in JS by match count ─────────────────────────────────────
  const ranked = rows.map((row) => {
    const kw = row.keywords.toLowerCase();
    const matchCount = tokens.reduce((acc, t) => acc + (kw.includes(t) ? 1 : 0), 0);
    return { ...row, matchCount };
  });

  // ── Step 4: sort descending, return top 3 ─────────────────────────────────
  ranked.sort((a, b) => b.matchCount - a.matchCount);
  return ranked.slice(0, 3);
}

module.exports = { searchKB };
