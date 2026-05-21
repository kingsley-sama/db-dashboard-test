/**
 * Authentication utilities for my-app
 * This module provides a bridge to the main app's authentication system
 */

import { getUser } from '@/lib/db/queries';
import { redirect } from 'next/navigation';

/**
 * Get the current authenticated user. Verifies the JWT cookie AND that the
 * user row still exists (not soft-deleted) — so a stale cookie can't pass.
 * Returns null if not authenticated.
 */
export async function getCurrentUser() {
  return await getUser();
}

/**
 * Require authentication - redirects to login if not authenticated
 * Use this in server components and server actions
 */
export async function requireAuth() {
  const user = await getUser();
  if (!user) {
    redirect('/sign-in');
  }
  return user;
}

/**
 * Get user ID for the current authenticated user
 * Returns null if not authenticated.
 */
export async function getUserId() {
  const user = await getUser();
  return user?.id ?? null;
}
