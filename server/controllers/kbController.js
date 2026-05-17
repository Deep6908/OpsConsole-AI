'use strict';

const { searchKB: searchKBService } = require('../services/knowledgeBase');

/**
 * POST /api/v1/kb/search
 * Body: { keyword: string }
 * Returns: top 3 knowledge base articles ranked by keyword match count
 */
async function searchKB(req, res) {
  try {
    const { keyword } = req.body;

    if (!keyword || typeof keyword !== 'string' || keyword.trim().length < 2) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'keyword is required and must be at least 2 characters',
      });
    }

    const results = await searchKBService(keyword.trim());

    return res.json({
      data: results,
      count: results.length,
      query: keyword.trim(),
    });
  } catch (err) {
    console.error('[KBController] searchKB error:', err.message);
    return res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
}

module.exports = { searchKB };
