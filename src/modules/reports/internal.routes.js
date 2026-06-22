const { Router } = require('express');
const { internalReportsController } = require('./internal.controller');
const { authenticateInternal } = require('../../middlewares/authenticateInternal');

const router = Router();

// POST /internal/reports — H9: recibe copia de una denuncia creada en friends
router.post('/reports', authenticateInternal, internalReportsController.receiveReport);

module.exports = router;
