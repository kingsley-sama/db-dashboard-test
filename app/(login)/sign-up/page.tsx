import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Login } from '../login';

export const metadata: Metadata = {
  title: 'Sign up',
};

export default function SignUpPage() {
  return (
    <Suspense>
      <Login mode="signup" />
    </Suspense>
  );
}
