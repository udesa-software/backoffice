const { query } = require('../../config/database');
const { AppError } = require('../../middlewares/errorHandler');

const internalReportsController = {
  // H9: recibe la copia de una denuncia creada en friends (fire-and-forget desde el origen).
  // Solo persiste — el listado/gestión de denuncias es H7 (no implementado).
  async receiveReport(req, res, next) {
    try {
      const { reporterId, reporterUsername, reportedId, reportedUsername, reason, reasonDetail, createdAt } = req.body;

      if (!reporterId || !reporterUsername || !reportedId || !reportedUsername || !reason) {
        throw new AppError(400, 'reporterId, reporterUsername, reportedId, reportedUsername y reason son obligatorios');
      }

      await query(
        `INSERT INTO user_reports (reporter_id, reporter_username, reported_id, reported_username, reason, reason_detail, reported_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [reporterId, reporterUsername, reportedId, reportedUsername, reason, reasonDetail ?? null, createdAt ?? new Date()]
      );

      res.status(201).json({ message: 'Denuncia registrada' });
    } catch (err) {
      next(err);
    }
  },
};

module.exports = { internalReportsController };
