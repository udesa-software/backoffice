const { Router } = require('express');
const { authenticate } = require('../../middlewares/authenticate');
const { requirePasswordChanged } = require('../../middlewares/authorize');
const { reportsController } = require('./reports.controller');

const router = Router();

router.use(authenticate, requirePasswordChanged);

// H7 CA.1: lista de denuncias agrupadas por usuario, ordenadas por severidad
router.get('/', reportsController.list);

// H7 CA.2: descartar denuncias o suspender cuenta desde la lista
router.post('/:reportedId/discard', reportsController.discard);
router.post('/:reportedId/suspend', reportsController.suspend);

// H7 CA.3: resolver/cerrar caso
router.post('/:reportedId/resolve', reportsController.resolve);

// descartar denuncia individual por id (sin afectar el resto del caso ni el contador)
router.post('/report/:reportId/discard', reportsController.discardReport);

module.exports = router;
