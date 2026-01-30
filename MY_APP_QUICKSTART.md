# Quick Start: My-App Integration

## What Changed?

Your `my-app` annotation tool is now fully integrated with the main Next.js SaaS application.

### ✅ Authentication
- **Before**: Separate Supabase Auth login at `/my-app/login`
- **After**: Uses main app's JWT auth at `/sign-in`
- **Impact**: Users must log in to main app to access my-app

### ✅ Theme & Branding
- **Before**: Custom theme with hardcoded "Revision" name
- **After**: Inherits main app theme and displays "Next.js SaaS Starter"
- **Impact**: Consistent look and feel across entire application

### ✅ Route Protection
- **Before**: No middleware protection
- **After**: All `/my-app/*` routes protected by middleware
- **Impact**: Automatic redirect to login for unauthenticated users

## How to Use

### 1. Start the App
```bash
cd /home/kingsley-sama/Downloads/saas-starter-main\ \(1\)/saas-starter-main
npm install  # If needed
npm run dev
```

### 2. Access My-App
1. Visit: http://localhost:3000/my-app
2. You'll be redirected to login if not authenticated
3. Log in with your main app credentials
4. Access the annotation tool

### 3. Customize Branding (Optional)

Edit `/lib/config.ts`:
```typescript
export const appConfig = {
  name: 'Your Company Name',  // Appears in my-app sidebar
  // ...
}
```

### 4. Customize Theme (Optional)

Edit `/app/globals.css`:
```css
:root {
  --primary: hsl(your-color);
  --foreground: hsl(your-color);
  /* Changes apply to both main app and my-app */
}
```

## Key Files Modified

| File | What Changed |
|------|--------------|
| `/middleware.ts` | Added `/my-app` to protected routes |
| `/lib/config.ts` | NEW: App-wide configuration |
| `/my-app/lib/auth.ts` | NEW: Auth helpers for my-app |
| `/my-app/app/layout.tsx` | Uses main app theme |
| `/my-app/components/sidebar.tsx` | Shows main app name, working logout |
| `/my-app/app/actions/*.ts` | All actions require authentication |
| `/my-app/app/login/` | REMOVED: Use main app login instead |

## Accessing My-App

### From Main App
Add a link in your main app navigation:
```tsx
<Link href="/my-app">Annotation Tool</Link>
```

### Direct URL
```
http://your-domain.com/my-app
```

## Environment Variables

Ensure these are set in `.env`:
```env
# Main app auth (required)
AUTH_SECRET=your_jwt_secret

# Supabase for my-app database (required)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_key

# Optional
NEXT_PUBLIC_APP_NAME=Your App Name
```

## Common Tasks

### Change App Name
1. Edit `/lib/config.ts`
2. Restart dev server
3. Name appears in my-app sidebar

### Add My-App Link to Main Navigation
1. Edit your main app's nav component
2. Add: `<Link href="/my-app">Annotations</Link>`

### Protect Additional Routes
1. Edit `/middleware.ts`
2. Add route to `protectedRoutes` array:
   ```typescript
   const protectedRoutes = ['/dashboard', '/my-app', '/your-route'];
   ```

## Need Help?

See detailed documentation: [MY_APP_INTEGRATION.md](./MY_APP_INTEGRATION.md)

## Summary

✅ No more separate login for my-app  
✅ Consistent branding across all apps  
✅ Centralized theme management  
✅ All routes secured with middleware  
✅ Zero code duplication  

Your my-app is now a seamlessly integrated part of your main application! 🎉
