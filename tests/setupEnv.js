// Carga las variables de entorno ANTES de que cualquier módulo las requiera.
// Jest ejecuta setupFiles antes de importar el archivo de tests.
process.env.PORT = '3003';

process.env.DB_HOST     = process.env.DB_HOST     || 'localhost';
process.env.DB_PORT     = process.env.DB_PORT     || '5432';
process.env.DB_NAME     = process.env.DB_NAME     || 'backoffice_test';
process.env.DB_USER     = process.env.DB_USER     || 'postgres';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'postgres';

process.env.ADMIN_JWT_SECRET          = 'test-admin-jwt-secret-muy-largo';
process.env.JWT_SECRET                = 'test-jwt-secret-muy-largo';
process.env.ACCESS_TOKEN_EXPIRES_IN   = '15m';
process.env.REFRESH_TOKEN_EXPIRES_IN  = '7d';
process.env.APP_URL                   = 'http://localhost:4000';
process.env.USERS_SERVICE_URL         = 'http://localhost:3000';
process.env.FRIENDS_SERVICE_URL       = 'http://localhost:3001';
process.env.LOCATION_SERVICE_URL      = 'http://localhost:3002';
process.env.API_GATEWAY_URL           = 'http://localhost:4000';
process.env.BACKOFFICE_SERVICE_URL    = 'http://localhost:3003';
process.env.NOTIFICATIONS_SERVICE_URL = 'http://localhost:8080';
process.env.AI_SERVICE_URL            = 'http://localhost:8001';
process.env.ALLOWED_EMAIL_DOMAIN      = '';  // sin restricción de dominio por defecto
