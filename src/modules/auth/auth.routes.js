const { Router } = require('express');
const { authController } = require('./auth.controller');
const { validate } = require('../../middlewares/validate');
const { authenticate } = require('../../middlewares/authenticate');
const { loginSchema, changePasswordSchema } = require('./auth.schemas');

const router = Router();

// POST /api/auth/login — H2
router.post('/login', validate(loginSchema), authController.login);

// POST /api/auth/refresh — get new access token using refresh token cookie
router.post('/refresh', authController.refresh);

// POST /api/auth/logout
router.post('/logout', authenticate, authController.logout);

// POST /api/auth/change-password — H1 CA.1
// Solo requiere authenticate, NO requirePasswordChanged (es justamente para cumplirlo)
router.post('/change-password', authenticate, validate(changePasswordSchema), authController.changePassword);

module.exports = router;
