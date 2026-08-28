import { deletePreference, getPreference } from '../../database/db';
import { saveAuthCookies } from '../../api/sessionManager';
import { migrateAuthCookiesToSecureStore, AUTH_COOKIES_PREF_KEY } from '../authCookieMigration';

jest.mock('../../database/db', () => ({
  getPreference: jest.fn(),
  deletePreference: jest.fn(),
}));

jest.mock('../../api/sessionManager', () => ({
  saveAuthCookies: jest.fn(),
}));

const originalConsoleError = console.error;

describe('migrateAuthCookiesToSecureStore', () => {
  const cookiesJson = JSON.stringify({ PHPSESSID: 'abc123' });

  beforeEach(() => {
    jest.clearAllMocks();
    console.error = jest.fn();
  });

  afterEach(() => {
    console.error = originalConsoleError;
  });

  it('copies legacy plaintext cookies to SecureStore and removes the preference row', async () => {
    (getPreference as jest.Mock).mockResolvedValueOnce(cookiesJson);

    await expect(migrateAuthCookiesToSecureStore()).resolves.toBe(true);

    expect(saveAuthCookies).toHaveBeenCalledWith(cookiesJson);
    expect(deletePreference).toHaveBeenCalledWith(AUTH_COOKIES_PREF_KEY);
  });

  it('does nothing when no legacy preference exists', async () => {
    (getPreference as jest.Mock).mockResolvedValueOnce(null);

    await expect(migrateAuthCookiesToSecureStore()).resolves.toBe(false);

    expect(saveAuthCookies).not.toHaveBeenCalled();
    expect(deletePreference).not.toHaveBeenCalled();
  });

  it('never deletes the preference when the SecureStore write fails', async () => {
    (getPreference as jest.Mock).mockResolvedValueOnce(cookiesJson);
    (saveAuthCookies as jest.Mock).mockRejectedValueOnce(new Error('storage locked'));

    await expect(migrateAuthCookiesToSecureStore()).resolves.toBe(false);

    // The plaintext row must survive a failed migration so the data is not lost.
    expect(deletePreference).not.toHaveBeenCalled();
  });

  it('reports failure when reading the preference throws', async () => {
    (getPreference as jest.Mock).mockRejectedValueOnce(new Error('db unavailable'));

    await expect(migrateAuthCookiesToSecureStore()).resolves.toBe(false);

    expect(saveAuthCookies).not.toHaveBeenCalled();
    expect(deletePreference).not.toHaveBeenCalled();
  });
});
