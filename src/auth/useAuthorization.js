import { useCallback, useEffect, useState } from 'react';
import {
  GoogleAuthProvider,
  onIdTokenChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
} from 'firebase/auth';

import { auth } from '../config/firebase.js';
import { getPublicAuthErrorCode, getPublicAuthMessage } from './authErrors.js';
import { getAuthorizedRole } from './roles.js';

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

const INITIAL_STATE = Object.freeze({
  status: 'loading',
  user: null,
  role: null,
  message: null,
});

function reportAuthFailure(context, error) {
  console.error(`${context}: ${getPublicAuthErrorCode(error)}`);
}

export function useAuthorization() {
  const [state, setState] = useState(INITIAL_STATE);

  useEffect(() => {
    let active = true;
    let tokenSequence = 0;

    const unsubscribe = onIdTokenChanged(
      auth,
      async user => {
        const sequence = ++tokenSequence;

        if (!user) {
          if (active) setState({ status: 'signed-out', user: null, role: null, message: null });
          return;
        }

        try {
          const token = await user.getIdTokenResult();
          if (!active || sequence !== tokenSequence) return;

          const role = getAuthorizedRole(token.claims);
          setState(role
            ? { status: 'authorized', user, role, message: null }
            : {
                status: 'unauthorized',
                user,
                role: null,
                message: 'บัญชีนี้ยังไม่ได้รับสิทธิ์ clinician หรือ admin',
              });
        } catch (error) {
          if (!active || sequence !== tokenSequence) return;
          reportAuthFailure('Authorization check failed', error);
          setState({
            status: 'error',
            user,
            role: null,
            message: getPublicAuthMessage(error),
          });
        }
      },
      error => {
        if (!active) return;
        reportAuthFailure('Authentication observer failed', error);
        setState({
          status: 'error',
          user: null,
          role: null,
          message: getPublicAuthMessage(error),
        });
      },
    );

    return () => {
      active = false;
      tokenSequence += 1;
      unsubscribe();
    };
  }, []);

  const signIn = useCallback(async () => {
    setState(current => ({ ...current, status: 'authenticating', message: null }));
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      reportAuthFailure('Sign-in failed', error);
      setState({
        status: 'signed-out',
        user: null,
        role: null,
        message: getPublicAuthMessage(error),
      });
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await firebaseSignOut(auth);
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
