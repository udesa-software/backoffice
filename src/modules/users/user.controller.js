const { usersClient } = require('../../clients/usersClient');
const { AppError } = require('../../middlewares/errorHandler');
const { query } = require('../../config/database');

const userController = {
  // H8 CA.1: genera y descarga CSV con columnas requeridas (CA.2: superadmin verificado en la ruta)
  async exportCsv(req, res, next) {
    try {
      const { search = '' } = req.query;
      const { users } = await usersClient.exportUsers({ search });

      const toStatus = (u) => {
        if (u.deleted_at)   return 'Eliminado';
        if (u.is_suspended) return 'Suspendido';
        if (u.under_review) return 'En revision';
        if (!u.is_verified) return 'Sin verificar';
        return 'Activo';
      };

      const rows = users.map(u =>
        [u.id, u.username, u.email, toStatus(u), u.created_at].join(',')
      );
      const csv = ['ID,Username,Email,Estado,Fecha de Registro', ...rows].join('\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="usuarios.csv"');
      res.send(csv);
    } catch (err) {
      next(err);
    }
  },

  // H4: listado con búsqueda y paginación
  async list(req, res, next) {
    try {
      const { search = '', page = '1', limit = '20' } = req.query;
      const result = await usersClient.listUsers({ search, page, limit });
      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  // H4 CA.1: detalle de usuario
  async detail(req, res, next) {
    try {
      const user = await usersClient.getUser(req.params.id);
      res.json(user);
    } catch (err) {
      next(err);
    }
  },

  // H5: suspender usuario (CA.1: requiere motivo en texto)
  async suspend(req, res, next) {
    try {
      const { reason } = req.body;
      if (!reason || reason.trim().length === 0) {
        throw new AppError(400, 'Debés ingresar un motivo para suspender al usuario');
      }

      // Registrar la acción de moderación en el backoffice para auditoría
      await query(
        `INSERT INTO moderation_actions (admin_id, target_user_id, action, reason)
         VALUES ($1, $2, 'suspend', $3)`,
        [req.admin.sub, req.params.id, reason.trim()]
      );

      const result = await usersClient.suspendUser(req.params.id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  // H5: levantar suspensión
  async unsuspend(req, res, next) {
    try {
      const { reason } = req.body;

      await query(
        `INSERT INTO moderation_actions (admin_id, target_user_id, action, reason)
         VALUES ($1, $2, 'unsuspend', $3)`,
        [req.admin.sub, req.params.id, reason?.trim() ?? null]
      );

      const result = await usersClient.unsuspendUser(req.params.id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  // H9: resolver revisión automática (admin decide si la cuenta puede operar normalmente)
  async resolveReview(req, res, next) {
    try {
      const { reason } = req.body;

      await query(
        `INSERT INTO moderation_actions (admin_id, target_user_id, action, reason)
         VALUES ($1, $2, 'resolve_review', $3)`,
        [req.admin.sub, req.params.id, reason?.trim() ?? null]
      );

      const result = await usersClient.resolveUserReview(req.params.id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
};

module.exports = { userController };
