import { useCallback, useEffect, useState } from 'react';
import {
  GoogleAuthProvider,
  onIdTokenChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
} from 'firebase/auth';

import { auth } from '../config/firebase.js';
import { getAuthorizedRole } from './roles.js';

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

const INITIAL_STATE = Object.freeze({
  status: 'loading',
  user: null,
  role: null,
  message: null,
});

function publicAuthMessage(error) {
  if (error?.code === 'auth/popup-closed-by-user') {
    return 'ยกเลิกการเข้าสู่ระบบแล้ว';
  }
  return 'ไม่สามารถตรวจสอบสิทธิ์ได้ กรุณาลองใหม่หรือติดต่อผู้ดูแลระบบ';
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
          console.error('Authorization check failed', error);
          setState({
            status: 'error',
            user,
            role: null,
            message: publicAuthMessage(error),
          });
        }
      },
      error => {
        if (!active) return;
        console.error('Authentication observer failed', error);
        setState({
          status: 'error',
          user: null,
          role: null,
          message: publicAuthMessage(error),
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
      console.error('Sign-in failed', error);
      setState({
        status: 'signed-out',
        user: null,
        role: null,
        message: publicAuthMessage(error),
      });
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await firebaseSignOut(auth);
    } catch (error) {
      console.error('Sign-out failed', error);
      setState(current => ({
        ...current,
        status: 'error',
        message: publicAuthMessage(error),
      }));
    }
  }, []);

  return { ...state, signIn, signOut };
}
