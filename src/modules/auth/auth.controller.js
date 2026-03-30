const { authService } = require('./auth.service');

const authController = {
  async login(req, res, next) {
    try {
      const result = await authService.login(req.body);
      res.status(200).json({ message: 'Inicio de sesión exitoso.', ...result });
    } catch (err) {
      next(err);
    }
  },

  async logout(req, res, next) {
    try {
      const result = await authService.logout(req.admin.sub);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  async changePassword(req, res, next) {
    try {
      const result = await authService.changePassword(req.admin.sub, req.body);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
};

module.exports = { authController };
