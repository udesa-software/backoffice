const { Router } = require('express');
const { adminController } = require('./admin.controller');
const { validate } = require('../../middlewares/validate');
const { authenticate } = require('../../middlewares/authenticate');
const { authorize, requirePasswordChanged } = require('../../middlewares/authorize');
const { createAdminSchema } = require('./admin.schemas');

const router = Router();

// Todas las rutas de admins requieren: estar logueado + haber cambiado la contraseña
router.use(authenticate, requirePasswordChanged);

// GET /api/admins — H1: listar administradores (cualquier admin puede ver)
router.get('/', adminController.list);

// POST /api/admins — H1: crear nuevo administrador (solo superadmin, CA.2)
router.post('/', authorize('superadmin'), validate(createAdminSchema), adminController.create);

// POST /api/admins/:id/reset-password — H1 CA.3: regenerar contraseña temporal expirada (solo superadmin)
router.post('/:id/reset-password', authorize('superadmin'), adminController.resetPassword);

module.exports = router;
