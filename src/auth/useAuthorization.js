import { useCallback, useEffect, useState } from 'react';

import { getPublicAuthErrorCode, getPublicAuthMessage } from './authErrors.js';
import {
  AUTH_SESSION_INVALID_EVENT,
  destroyAuthSession,
  exchangeGoogleCredential,
  fetchAuthSession,
} from './authSession.js';

const INITIAL_STATE = Object.freeze({
  status: 'loading',
  user: null,
  role: null,
  message: null,
});

function reportAuthFailure(context, error) {
  console.error(`${context}: ${getPublicAuthErrorCode(error)}`);
}

function authorizedState(session) {
  return {
    status: 'authorized',
    user: session.user,
    role: session.role,
    message: null,
  };
}

export function useAuthorization() {
  const [state, setState] = useState(INITIAL_STATE);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    fetchAuthSession({ signal: controller.signal })
      .then(session => {
        if (!active) return;
        setState(session
          ? authorizedState(session)
          : { status: 'signed-out', user: null, role: null, message: null });
      })
      .catch(error => {
        if (!active || error?.name === 'AbortError') return;
        reportAuthFailure('Session check failed', error);
        setState({
          status: 'error',
          user: null,
          role: null,
          message: getPublicAuthMessage(error),
        });
      });

    const handleInvalidSession = () => {
      if (active) setState({ status: 'signed-out', user: null, role: null, message: null });
    };
    window.addEventListener(AUTH_SESSION_INVALID_EVENT, handleInvalidSession);

    return () => {
      active = false;
      controller.abort();
      window.removeEventListener(AUTH_SESSION_INVALID_EVENT, handleInvalidSession);
    };
  }, []);

  const signIn = useCallback(async credential => {
    setState(current => ({ ...current, status: 'authenticating', message: null }));
    try {
      const session = await exchangeGoogleCredential(credential);
      setState(authorizedState(session));
    } catch (error) {
      reportAuthFailure('Sign-in failed', error);
      setState({
        status: error?.status === 403 ? 'unauthorized' : 'signed-out',
        user: null,
        role: null,
        message: getPublicAuthMessage(error),
      });
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await destroyAuthSession();
      setState({ status: 'signed-out', user: null, role: null, message: null });
    } catch (error) {
      reportAuthFailure('Sign-out failed', error);
      setState(current => ({
        ...current,
        status: 'error',
        message: getPublicAuthMessage(error),
      }));
    }
  }, []);

  return { ...state, signIn, signOut };
}
