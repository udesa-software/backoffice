const { env } = require('../../config/env');
const { query } = require('../../config/database');
const { sendMail } = require('../../config/mailer');

const HEALTH_TIMEOUT_MS = 5000; // H11 CA.3: abortar si tarda más de 5 segundos

// Los servicios a chequear se construyen a partir de las env vars configuradas
function getServices() {
  const services = [
    { name: 'users', url: env.USERS_SERVICE_URL },
  ];
  if (env.FRIENDS_SERVICE_URL) services.push({ name: 'friends', url: env.FRIENDS_SERVICE_URL });
  if (env.LOCATION_SERVICE_URL) services.push({ name: 'location', url: env.LOCATION_SERVICE_URL });
  if (env.API_GATEWAY_URL) services.push({ name: 'api-gateway', url: env.API_GATEWAY_URL });
  services.push({ name: 'backoffice', url: `http://127.0.0.1:${env.PORT}` });
  if (env.NOTIFICATIONS_SERVICE_URL) services.push({ name: 'notifications', url: env.NOTIFICATIONS_SERVICE_URL });
  if (env.AI_SERVICE_URL) services.push({ name: 'ai-service', url: env.AI_SERVICE_URL });
  return services;
}

// Chequea un servicio con timeout de 5 segundos
async function checkService({ name, url }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

  try {
    const response = await fetch(`${url}/health`, {
      signal: controller.signal,
    });
    return { name, isUp: response.ok };
  } catch {
    // Timeout (AbortError) o conexión rechazada → servicio caído
    return { name, isUp: false };
  } finally {
    clearTimeout(timer);
  }
}

// Envía email a todos los admins cuando un servicio cae (H11 CA.4)
async function alertAdmins(serviceName) {
  try {
    const adminsResult = await query('SELECT email FROM admins');
    const emails = adminsResult.rows.map(r => r.email);
    if (emails.length === 0) return;

    await sendMail({
      to: emails.join(','),
      subject: `⚠️ Alerta: el servicio "${serviceName}" está caído`,
      html: `
        <h2>Alerta de microservicio</h2>
        <p>El servicio <strong>${serviceName}</strong> no está respondiendo en el backoffice de UdeSA-migos.</p>
        <p>Revisá el estado de los contenedores.</p>
        <p><em>Este email fue generado automáticamente.</em></p>
      `,
    });
  } catch (err) {
    console.error(`[health] failed to send alert for ${serviceName}:`, err);
  }
}

const healthController = {
  // H11: chequea todos los microservicios y devuelve su estado
  async check(req, res, next) {
    try {
      const services = getServices();

      // Chequear todos en paralelo (con timeout individual de 5s)
      const results = await Promise.all(services.map(checkService));

      // Comparar con estado anterior en DB para detectar caídas (CA.4)
      for (const { name, isUp } of results) {
        const prev = await query(
          `SELECT is_up FROM service_health_status WHERE service_name = $1`,
          [name]
        );

        if (prev.rows.length === 0) {
          // Primera vez que vemos este servicio: insertar estado inicial
          await query(
            `INSERT INTO service_health_status (service_name, is_up, last_checked, last_down_at)
             VALUES ($1, $2, NOW(), $3)`,
            [name, isUp, isUp ? null : new Date()]
          );
        } else {
          const wasUp = prev.rows[0].is_up;

          // Si estaba UP y ahora está DOWN → enviar alerta (CA.4)
          if (wasUp && !isUp) {
            alertAdmins(name); // fire-and-forget
          }

          await query(
            `UPDATE service_health_status
             SET is_up = $1,
                 last_checked = NOW(),
                 last_down_at = CASE WHEN $1 = FALSE THEN NOW() ELSE last_down_at END
             WHERE service_name = $2`,
            [isUp, name]
          );
        }
      }

      res.json({ services: results });
    } catch (err) {
      next(err);
    }
  },
};

module.exports = { healthController };
