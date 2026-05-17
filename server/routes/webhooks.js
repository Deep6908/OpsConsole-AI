'use strict';

const { Router } = require('express');
const auth = require('../middleware/auth');
const { handleEscalation } = require('../controllers/webhookController');

const router = Router();

// POST /webhooks/escalation — requires JWT (called by Power Automate with a service token)
router.post('/escalation', auth, handleEscalation);

module.exports = router;
