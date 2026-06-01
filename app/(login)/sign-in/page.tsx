import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Login } from '../login';

export const metadata: Metadata = {
  title: 'Sign in',
};

export default function SignInPage() {
  return (
    <Suspense>
      <Login mode="signin" />
    </Suspense>
  );
}
