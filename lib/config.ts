/**
 * Application configuration
 * Central place for app-wide settings that can be dynamically configured
 */

export const appConfig = {
  // App name from main application
  name: process.env.NEXT_PUBLIC_APP_NAME || 'Next.js SaaS Starter',
  
  // Description
  description: 'Get started quickly with Next.js, Postgres, and Stripe.',
  
  // URLs
  baseUrl: process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000',
  
  // My-app specific settings
  myApp: {
    name: 'Your App',
    description: 'Build your application with authentication and dashboard',
    routePrefix: '/my-app',
  },
} as const;

export type AppConfig = typeof appConfig;
