const { env } = require('../config/env');
const { AppError } = require('../middlewares/errorHandler');

const TIMEOUT_MS = 8000;

async function internalRequest(method, path, body = null) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${env.FRIENDS_SERVICE_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': env.INTERNAL_SECRET,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new AppError(response.status, data.error ?? 'Error en friends service');
    }

    return data;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new AppError(504, 'El microservicio de friends no respondió a tiempo');
    }
    if (err instanceof AppError) throw err;
    throw new AppError(502, 'Error al comunicarse con el microservicio de friends');
  } finally {
    clearTimeout(timer);
  }
}

const friendsClient = {
  // H7: obtiene el listado paginado de denuncias agrupadas por usuario denunciado
  getReports({ page, limit }) {
    const params = new URLSearchParams({ page: page ?? 1, limit: limit ?? 20 });
    return internalRequest('GET', `/internal/reports?${params}`);
  },

  // H7: marca como 'discarded' todas las denuncias pendientes del usuario
  markReportsDiscarded(reportedId) {
    return internalRequest('POST', `/internal/reports/${reportedId}/discard`);
  },

  // H7: marca como 'resolved' todas las denuncias pendientes del usuario
  markReportsResolved(reportedId) {
    return internalRequest('POST', `/internal/reports/${reportedId}/resolve`);
  },

  // descarta una denuncia individual por su id (sin afectar el resto del caso)
  discardReport(reportId) {
    return internalRequest('POST', `/internal/reports/report/${reportId}/discard`);
  },
};

module.exports = { friendsClient };
