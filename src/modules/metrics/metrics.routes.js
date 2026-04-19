const { Router } = require('express');
const { authenticate } = require('../../middlewares/authenticate');
const { requirePasswordChanged } = require('../../middlewares/authorize');
const { metricsController } = require('./metrics.controller');

const router = Router();

router.use(authenticate, requirePasswordChanged);
router.get('/', metricsController.get);

module.exports = router;
