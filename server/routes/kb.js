'use strict';

const { Router } = require('express');
const { searchKB } = require('../controllers/kbController');

const router = Router();

// POST /api/v1/kb/search  — intentionally public, no JWT required
router.post('/search', searchKB);

module.exports = router;
