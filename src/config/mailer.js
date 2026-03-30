const nodemailer = require('nodemailer');
const { env } = require('./env');

function createTransport() {
  if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) {
    return nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: parseInt(env.SMTP_PORT, 10),
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });
  }
  // Sin SMTP configurado: loguea en consola (útil para desarrollo)
  return null;
}

const transport = createTransport();
const FROM = env.SMTP_FROM ?? 'backoffice@udesa.edu.ar';

async function sendMail({ to, subject, html }) {
  if (!transport) {
    console.log(`[MAILER] To: ${to} | Subject: ${subject}`);
    return;
  }
  await transport.sendMail({ from: FROM, to, subject, html });
}

async function sendTempPasswordEmail(email, tempPassword) {
  await sendMail({
    to: email,
    subject: 'Tu acceso al Backoffice de UdeSA-migos',
    html: `
      <h2>Bienvenido/a al panel de administración</h2>
      <p>Se creó una cuenta de administrador para vos.</p>
      <p>Tu contraseña temporal es: <strong>${tempPassword}</strong></p>
      <p>Esta contraseña expira en <strong>24 horas</strong>. Al iniciar sesión serás redirigido/a para cambiarla.</p>
      <p>Ingresá desde: <a href="${env.APP_URL}">${env.APP_URL}</a></p>
    `,
  });
}

async function sendPasswordChangedEmail(email) {
  await sendMail({
    to: email,
    subject: 'Tu contraseña del Backoffice fue modificada',
    html: `
      <h2>Contraseña actualizada</h2>
      <p>La contraseña de tu cuenta de administrador fue modificada exitosamente.</p>
      <p>Si no realizaste este cambio, contactá al SuperAdmin inmediatamente.</p>
    `,
  });
}

module.exports = { sendTempPasswordEmail, sendPasswordChangedEmail };
