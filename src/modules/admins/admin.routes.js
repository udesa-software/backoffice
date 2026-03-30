const { Router } = require('express');
const { adminController } = require('./admin.controller');
const { validate } = require('../../middlewares/validate');
const { authenticate } = require('../../middlewares/authenticate');
const { authorize, requirePasswordChanged } = require('../../middlewares/authorize');
const { createAdminSchema } = require('./admin.schemas');

const router = Router();

// Todas las rutas de admins requieren: estar logueado + haber cambiado la contraseña
// + ser SuperAdmin (CA.2: los Moderadores no pueden crear admins)
router.use(authenticate, requirePasswordChanged, authorize('superadmin'));

// POST /api/admins — H1: crear nuevo administrador
router.post('/', validate(createAdminSchema), adminController.create);

// POST /api/admins/:id/reset-password — H1 CA.3: regenerar contraseña temporal expirada
router.post('/:id/reset-password', adminController.resetPassword);

module.exports = router;
