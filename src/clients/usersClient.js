const { env } = require('../config/env');
const { AppError } = require('../middlewares/errorHandler');

const TIMEOUT_MS = 8000;

// Función auxiliar: hace una petición HTTP a la API interna del microservicio de users.
// Usa fetch nativo de Node.js 18+ con un AbortController para timeout.
async function internalRequest(method, path, body = null) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${env.USERS_SERVICE_URL}${path}`, {
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
      throw new AppError(response.status, data.error ?? 'Error en users service');
    }

    return data;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new AppError(504, 'El microservicio de users no respondió a tiempo');
    }
    if (err instanceof AppError) throw err;
    throw new AppError(502, 'Error al comunicarse con el microservicio de users');
  } finally {
    clearTimeout(timer);
  }
}

const usersClient = {
  // H4
  listUsers({ search, page, limit }) {
    const params = new URLSearchParams({ search: search ?? '', page: page ?? 1, limit: limit ?? 20 });
    return internalRequest('GET', `/internal/users?${params}`);
  },

  getUser(userId) {
    return internalRequest('GET', `/internal/users/${userId}`);
  },

  // H5
  suspendUser(userId) {
    return internalRequest('POST', `/internal/users/${userId}/suspend`);
  },

  unsuspendUser(userId) {
    return internalRequest('POST', `/internal/users/${userId}/unsuspend`);
  },

  // H9: resolver revisión automática iniciada por reportes de usuarios
  resolveUserReview(userId) {
    return internalRequest('POST', `/internal/users/${userId}/resolve-review`);
  },

  // H3
  getMetrics() {
    return internalRequest('GET', '/internal/metrics');
  },
};

module.exports = { usersClient };
