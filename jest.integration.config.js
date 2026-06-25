const path = require('path');

module.exports = {
  rootDir: __dirname,
  testMatch: [path.join(__dirname, 'tests/integration/**/*.integration.test.js')],
  testTimeout: 20000,
  maxWorkers: 1,    // evita condiciones de carrera sobre la misma DB de test
  forceExit: true,  // pg mantiene handles abiertos — forzar salida al terminar
  coverageDirectory: 'coverage-integration',
  collectCoverageFrom: [
    'src/modules/auth/auth.routes.js',
    'src/modules/auth/auth.controller.js',
    'src/modules/auth/auth.service.js',
    'src/modules/admins/admin.routes.js',
    'src/modules/admins/admin.controller.js',
    'src/modules/admins/admin.service.js',
    'src/modules/admins/admin.repository.js',
    'src/modules/users/user.routes.js',
    'src/modules/users/user.controller.js',
    'src/modules/metrics/metrics.routes.js',
    'src/modules/metrics/metrics.controller.js',
    'src/modules/health/health.routes.js',
    'src/modules/health/health.controller.js',
    'src/middlewares/authenticate.js',
    'src/middlewares/authorize.js',
  ],
  coverageThreshold: {
    global: {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85,
    },
  },
};
