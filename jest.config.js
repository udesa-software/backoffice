module.exports = {
  testMatch: ['<rootDir>/tests/unit/**/*.test.js'],
  collectCoverageFrom: [
    'src/modules/auth/auth.service.js',
    'src/modules/admins/admin.service.js',
    'src/modules/reports/reports.controller.js',
    'src/modules/reports/reports.repository.js',
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
