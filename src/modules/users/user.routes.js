const { Router } = require('express');
const { authenticate } = require('../../middlewares/authenticate');
const { requirePasswordChanged } = require('../../middlewares/authorize');
const { userController } = require('./user.controller');

const router = Router();

// Todas las rutas de usuarios requieren estar logueado con contraseña ya cambiada
router.use(authenticate, requirePasswordChanged);

// H4: búsqueda y detalle de usuarios
router.get('/', userController.list);
router.get('/:id', userController.detail);

// H5: suspensión (solo moderadores y superadmin pueden bloquear)
router.post('/:id/suspend', userController.suspend);
router.post('/:id/unsuspend', userController.unsuspend);

module.exports = router;
