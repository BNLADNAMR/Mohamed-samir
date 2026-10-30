import { describe, expect, it } from 'vitest';
import { isBenignAbortError } from '../utils/abortErrorGuard';
import { FirestoreErrorBoundary } from '../components/FirestoreErrorBoundary';

describe('abortErrorGuard — isBenignAbortError', () => {
  it('detects standard browser DOMException AbortError ("The user aborted a request.")', () => {
    const domAbort = new DOMException(
      'The user aborted a request.',
      'AbortError'
    );
    expect(isBenignAbortError(domAbort)).toBe(true);
  });

  it('detects Error instances with AbortError name or standard browser abort messages', () => {
    const namedAbort = new Error('Network stream closed');
    namedAbort.name = 'AbortError';
    expect(isBenignAbortError(namedAbort)).toBe(true);

    expect(
      isBenignAbortError(new Error('The user aborted a request.'))
    ).toBe(true);
    expect(
      isBenignAbortError(new Error('signal is aborted without reason'))
    ).toBe(true);
    expect(
      isBenignAbortError(new Error('The operation was aborted.'))
    ).toBe(true);
    expect(isBenignAbortError('The user aborted a request.')).toBe(true);
  });

  it('detects Firebase cancelled stream and duplicate popup cancellation codes', () => {
    expect(
      isBenignAbortError({
        code: 'cancelled',
        message: 'Firestore listen stream cancelled on reload',
      })
    ).toBe(true);
    expect(
      isBenignAbortError({
        code: 'auth/cancelled-popup-request',
        message: 'Popup cancelled due to newer popup',
      })
    ).toBe(true);
  });

  it('NEVER suppresses Firestore permission-denied, quota, offline, or JS runtime errors', () => {
    expect(
      isBenignAbortError(
        new Error('Missing or insufficient permissions.')
      )
    ).toBe(false);
    expect(
      isBenignAbortError({
        code: 'permission-denied',
        message: 'Missing or insufficient permissions.',
      })
    ).toBe(false);
    expect(
      isBenignAbortError({
        code: 'resource-exhausted',
        message: 'Quota exceeded.',
      })
    ).toBe(false);
    expect(
      isBenignAbortError(
        new Error('Failed to get document because the client is offline.')
      )
    ).toBe(false);
    expect(
      isBenignAbortError(new TypeError('Cannot read properties of undefined'))
    ).toBe(false);
    expect(isBenignAbortError(null)).toBe(false);
    expect(isBenignAbortError(undefined)).toBe(false);
  });

  it('FirestoreErrorBoundary ignores benign AbortError while capturing real permission errors', () => {
    const abortErr = new Error('The user aborted a request.');
    abortErr.name = 'AbortError';
    const ignoredState =
      FirestoreErrorBoundary.getDerivedStateFromError(abortErr);
    expect(ignoredState.hasError).toBe(false);

    const permErr = new Error(
      JSON.stringify({
        error: 'Missing or insufficient permissions.',
        operationType: 'update',
        path: 'users/u1',
      })
    );
    const caughtState =
      FirestoreErrorBoundary.getDerivedStateFromError(permErr);
    expect(caughtState.hasError).toBe(true);
    expect(caughtState.errorMessage).toContain('users/u1');
  });
});
