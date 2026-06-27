const { friendsClient } = require('../../clients/friendsClient');
const { usersClient } = require('../../clients/usersClient');
const { AppError } = require('../../middlewares/errorHandler');
const { query } = require('../../config/database');

const reportsController = {
  // H7 CA.1: lista agrupada por usuario denunciado, ordenada por severidad (cantidad de reportes)
  async list(req, res, next) {
    try {
      const page  = Math.max(1, parseInt(req.query.page  ?? '1',  10));
      const limit = Math.max(1, parseInt(req.query.limit ?? '20', 10));

      const data = await friendsClient.getReports({ page, limit });
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  // H7 CA.2 / CA.3: descartar — marca reportes como 'discarded' y libera el under_review si aplica
  async discard(req, res, next) {
    try {
      const { reportedId } = req.params;

      await friendsClient.markReportsDiscarded(reportedId);

      await query(
        `INSERT INTO moderation_actions (admin_id, target_user_id, action, reason)
         VALUES ($1, $2, 'discard_reports', NULL)`,
        [req.admin.sub, reportedId]
      );

      res.json({ message: 'Denuncias descartadas. El usuario puede volver a operar normalmente.' });

      // Fire-and-forget: si users está caído o el usuario no existe en ese servicio,
      // no hay que fallar — la acción principal (marcar como descartado) ya tuvo éxito.
      usersClient.resolveUserReview(reportedId).catch(err => {
        console.error('[discard_reports] resolveUserReview error:', err.message);
      });
    } catch (err) {
      next(err);
    }
  },

  // H7 CA.2: suspender cuenta desde la vista de denuncias
  async suspend(req, res, next) {
    try {
      const { reportedId } = req.params;
      const { reason } = req.body;

      if (!reason || reason.trim().length === 0) {
        throw new AppError(400, 'Debés ingresar un motivo para suspender al usuario');
      }

      await query(
        `INSERT INTO moderation_actions (admin_id, target_user_id, action, reason)
         VALUES ($1, $2, 'suspend_from_reports', $3)`,
        [req.admin.sub, reportedId, reason.trim()]
      );

      await usersClient.suspendUser(reportedId);
      await friendsClient.markReportsResolved(reportedId);

      res.json({ message: 'Usuario suspendido y caso resuelto.' });
    } catch (err) {
      next(err);
    }
  },

  async discardReport(req, res, next) {
    try {
      const { reportId } = req.params;
      await friendsClient.discardReport(reportId);
      res.json({ message: 'Denuncia descartada.' });
    } catch (err) {
      next(err);
    }
  },

  // H7 CA.3: resolver/cerrar caso sin suspender
  async resolve(req, res, next) {
    try {
      const { reportedId } = req.params;

      await friendsClient.markReportsResolved(reportedId);

      await query(
        `INSERT INTO moderation_actions (admin_id, target_user_id, action, reason)
         VALUES ($1, $2, 'resolve_reports', NULL)`,
        [req.admin.sub, reportedId]
      );

      res.json({ message: 'Caso resuelto. El usuario puede volver a operar normalmente.' });

      // Fire-and-forget: si users está caído o el usuario no existe en ese servicio,
      // no hay que fallar — la acción principal (marcar como resuelto) ya tuvo éxito.
      usersClient.resolveUserReview(reportedId).catch(err => {
        console.error('[resolve_reports] resolveUserReview error:', err.message);
      });
    } catch (err) {
      next(err);
    }
  },
};

module.exports = { reportsController };
