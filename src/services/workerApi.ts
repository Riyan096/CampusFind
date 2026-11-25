import { getToken } from 'firebase/app-check';

import { appCheck, auth } from './firebase';

/** Base URL of the CampusFind Cloudflare Worker (chat media, item resolution, points). */
export const WORKER_URL = (import.meta.env.VITE_MEDIA_WORKER_URL || 'http://localhost:8787').replace(/\/$/, '');

/** Error from the worker; `code` matches the old Cloud Function error codes (e.g. "permission-denied"). */
export class WorkerError extends Error {
  readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

/** POST JSON to a worker route as the signed-in user, with an App Check token when App Check is configured. */
export const callWorker = async <T>(path: string, body: unknown): Promise<T> => {
  const user = auth.currentUser;
  if (!user) throw new WorkerError('Your sign-in session has expired. Please sign in again.', 'unauthenticated');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: 'Bearer ' + await user.getIdToken(),
  };
  if (appCheck) {
    headers['X-Firebase-AppCheck'] = (await getToken(appCheck)).token;
  }

  const response = await fetch(WORKER_URL + path, { method: 'POST', headers, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({})) as T & { error?: string; code?: string };
  if (!response.ok) {
    throw new WorkerError(data.error || 'The request could not be completed. Please try again.', data.code || 'internal');
  }
  return data;
};
