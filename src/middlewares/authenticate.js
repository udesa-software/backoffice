const jwt = require('jsonwebtoken');
const { env } = require('../config/env');
const { AppError } = require('./errorHandler');
const { adminRepository } = require('../modules/admins/admin.repository');

async function authenticate(req, _res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return next(new AppError(401, 'Token de autenticación requerido'));
  }

  try {
    const payload = jwt.verify(token, env.ADMIN_JWT_SECRET);

    if (!payload.role) {
      return next(new AppError(403, 'Acceso denegado'));
    }

    // Verifica que la sesión no haya sido revocada (logout o cambio de contraseña)
    const admin = await adminRepository.findById(payload.sub);
    if (!admin || admin.token_version !== payload.token_version) {
      return next(new AppError(401, 'Sesión expirada o revocada. Iniciá sesión de nuevo.'));
    }

    req.admin = payload; // { sub, email, role, token_version, must_change_password }
    next();
  } catch {
    next(new AppError(401, 'Token inválido o expirado'));
  }
}

module.exports = { authenticate };
