const { Router } = require('express');
const { authenticate } = require('../../middlewares/authenticate');
const { requirePasswordChanged } = require('../../middlewares/authorize');
const { healthController } = require('./health.controller');

const router = Router();

router.use(authenticate, requirePasswordChanged);
router.get('/', healthController.check);

module.exports = router;
