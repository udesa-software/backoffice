module.exports = {
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  collectCoverageFrom: [
    'src/modules/auth/auth.service.js',
    'src/modules/admins/admin.service.js',
  ],
};
