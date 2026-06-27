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

  // H8: exportar usuarios para CSV
  it('exportUsers llama a /internal/users/export con el search como query param', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue({ users: [] }),
    });
    await usersClient.exportUsers({ search: 'juan' });
    expect(global.fetch).toHaveBeenCalledWith(
      'http://users:3000/internal/users/export?search=juan',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('exportUsers usa search vacío si no se pasa', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue({ users: [] }),
    });
    await usersClient.exportUsers({ search: undefined });
    expect(global.fetch).toHaveBeenCalledWith(
      'http://users:3000/internal/users/export?search=',
      expect.anything()
    );
  });

  it('exportUsers devuelve los datos del json de respuesta', async () => {
    const mockData = { users: [{ id: 'u1', username: 'alice' }] };
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue(mockData),
    });
    const result = await usersClient.exportUsers({ search: '' });
    expect(result).toEqual(mockData);
  });
});
