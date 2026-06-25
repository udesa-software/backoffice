jest.mock('../../src/config/env', () => ({
  env: { USERS_SERVICE_URL: 'http://users:3000', INTERNAL_SECRET: 'test-internal-secret' },
}));

const { usersClient } = require('../../src/clients/usersClient');

global.fetch = jest.fn();

describe('usersClient internal requests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ message: 'ok' }),
    });
  });

  // H9: las rutas nuevas en users (flag-review, resolve-review) exigen authenticateInternal
  it('envía el header x-internal-secret en resolveUserReview', async () => {
    await usersClient.resolveUserReview('user-1');
    expect(global.fetch).toHaveBeenCalledWith(
      'http://users:3000/internal/users/user-1/resolve-review',
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-internal-secret': 'test-internal-secret' }),
      })
    );
  });

  it('envía el header x-internal-secret también en llamadas existentes (suspendUser)', async () => {
    await usersClient.suspendUser('user-1');
    expect(global.fetch).toHaveBeenCalledWith(
      'http://users:3000/internal/users/user-1/suspend',
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-internal-secret': 'test-internal-secret' }),
      })
    );
  });
});
