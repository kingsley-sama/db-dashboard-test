/**
 * Authentication utilities for my-app
 * This module provides a bridge to the main app's authentication system
 */

import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';

/**
 * Get the current user session from the main app's auth system
 * Returns null if no session exists
 */
export async function getCurrentUser() {
  return await getSession();
}

/**
 * Require authentication - redirects to login if not authenticated
 * Use this in server components and server actions
 */
export async function requireAuth() {
  const session = await getSession();
  if (!session) {
    redirect('/sign-in');
  }
  return session;
}

/**
 * Get user ID from session
 * Returns null if no session exists
 */
export async function getUserId() {
  const session = await getSession();
  return session?.user?.id || null;
}
