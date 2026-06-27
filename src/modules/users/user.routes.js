const { Router } = require('express');
const { authenticate } = require('../../middlewares/authenticate');
const { requirePasswordChanged, authorize } = require('../../middlewares/authorize');
const { userController } = require('./user.controller');

const router = Router();

// Todas las rutas de usuarios requieren estar logueado con contraseña ya cambiada
router.use(authenticate, requirePasswordChanged);

// H8: exportar CSV — CA.2: solo superadmin. Antes de /:id para que Express no confunda "export" con un userId.
router.get('/export', authorize('superadmin'), userController.exportCsv);

// H4: búsqueda y detalle de usuarios
router.get('/', userController.list);
router.get('/:id', userController.detail);

// H5: suspensión (solo moderadores y superadmin pueden bloquear)
router.post('/:id/suspend', userController.suspend);
router.post('/:id/unsuspend', userController.unsuspend);

// H9: resolver revisión automática generada por reportes
router.post('/:id/resolve-review', userController.resolveReview);

module.exports = router;
