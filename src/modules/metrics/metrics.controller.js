const { usersClient } = require('../../clients/usersClient');

const metricsController = {
  // H3: métricas del dashboard — usuarios totales, altas del mes, gráfico semanal
  async get(req, res, next) {
    try {
      const metrics = await usersClient.getMetrics();
      res.json(metrics);
    } catch (err) {
      next(err);
    }
  },
};

module.exports = { metricsController };
