# Enhanced Signup Setup Guide

## Overview
The signup form has been enhanced to collect:
- Full Name
- Email
- Password
- Profile Picture (avatar) - uploaded to Supabase Storage

## Setup Instructions

### 1. Install Required Package

```bash
pnpm add @supabase/supabase-js
```

Or if you prefer npm/yarn:
```bash
npm install @supabase/supabase-js
# or
yarn add @supabase/supabase-js
```

### 2. Configure Supabase Storage

#### Step 1: Create a Storage Bucket
1. Go to your Supabase project dashboard: https://app.supabase.com
2. Navigate to **Storage** in the left sidebar
3. Click **Create a new bucket**
4. Name it `annot8` (or change the bucket name in the code)
5. Make it **Public** (so avatars are accessible)
6. Click **Create bucket**

#### Step 2: Create the Avatars Folder
1. Click on your `annot8` bucket
2. Click **Create folder**
3. Name it `avatars`
4. Upload a default avatar image named `sample_avatar.png` (this will be the default for users who don't upload)

#### Step 3: Set Up Storage Policies
1. In your bucket, go to **Policies**
2. Add the following policies:

**Policy 1: Allow Public Read Access**
- Policy name: `Public read access`
- Allowed operation: `SELECT`
- Target roles: `public`
- USING expression: `true`

**Policy 2: Allow Authenticated Uploads**
- Policy name: `Allow authenticated uploads`
- Allowed operation: `INSERT`
- Target roles: `authenticated`
- WITH CHECK expression: `true`

**Policy 3: Allow Users to Update Their Own Avatars**
- Policy name: `Allow users to update own avatar`
- Allowed operation: `UPDATE`
- Target roles: `authenticated`
- USING expression: `true`

### 3. Environment Variables

Add these to your `.env` file:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

To find these values:
1. Go to **Project Settings** > **API**
2. Copy the **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
3. Copy the **service_role** key (under Project API keys) → `SUPABASE_SERVICE_ROLE_KEY`
   - ⚠️ **Important**: Never expose the service role key in client-side code!

### 4. Database Migration

Update your database schema to include the avatar_url field. Run:

```bash
pnpm db:generate
pnpm db:migrate
```

Or if you're using raw SQL, run this migration:

```sql
ALTER TABLE users ADD COLUMN avatar_url TEXT DEFAULT 'https://grukocsepesmslwfjnpk.supabase.co/storage/v1/object/public/annot8/avatars/sample_avatar.png';
```

**Note**: Update the default avatar URL to match your Supabase project URL.

### 5. Test the Setup

1. Start your development server:
```bash
pnpm dev
```

2. Navigate to `/sign-up`
3. Fill in the form with:
   - Full name
   - Email
   - Password
   - Upload a profile picture (optional)
4. Submit the form

The avatar should upload to Supabase and the URL should be saved in the database.

## Features

### Signup Form Features:
- ✅ Full name input (required)
- ✅ Email input (required)
- ✅ Password input (required, min 8 chars)
- ✅ Avatar upload with preview
- ✅ File validation (image types only, max 5MB)
- ✅ Default avatar if none uploaded
- ✅ Remove uploaded image before submission

### Backend Features:
- ✅ Avatar upload to Supabase Storage
- ✅ Unique filename generation (userId-timestamp.ext)
- ✅ Automatic URL generation and storage
- ✅ Proper error handling
- ✅ File size and type validation

## File Structure

```
lib/
  storage/
    supabase.ts          # Supabase storage utilities
  db/
    schema.ts            # Updated with avatarUrl field
app/
  (login)/
    login.tsx            # Enhanced UI with avatar upload
    actions.ts           # Updated signup action
```

## Troubleshooting

### Issue: "Missing Supabase environment variables"
**Solution**: Make sure you've added both `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to your `.env` file.

### Issue: Upload fails with "Access Denied"
**Solution**: Check your bucket policies. Make sure the bucket is public and has proper upload policies.

### Issue: Avatar doesn't display
**Solution**: Verify the bucket is public and the avatar_url in the database is correct.

### Issue: File too large error
**Solution**: The current limit is 5MB. You can adjust this in `login.tsx` where file validation occurs.

## Security Notes

1. **Service Role Key**: Only use this server-side. It's used in `/lib/storage/supabase.ts` which runs only on the server.
2. **File Validation**: Files are validated for type and size before upload.
3. **Unique Filenames**: Each file gets a unique name to prevent conflicts.
4. **Storage Policies**: Proper RLS policies ensure users can only access public content.

## Customization

### Change Default Avatar
Update the default avatar URL in `lib/db/schema.ts`:

```typescript
avatarUrl: text('avatar_url').default('https://your-custom-default-avatar-url'),
```

### Change Bucket Name
If you named your bucket something other than `annot8`, update it in:
- `lib/storage/supabase.ts` (lines with `.from('annot8')`)

### Change File Size Limit
In `app/(login)/login.tsx`, update this line:

```typescript
if (file.size > 5 * 1024 * 1024) { // Change 5 to your desired MB
```

### Change Accepted File Types
In `app/(login)/login.tsx`, update the accept attribute:

```typescript
<Input
  accept="image/*" // Change to specific types like "image/png,image/jpeg"
/>
```

## Next Steps

- Add avatar editing in user settings
- Implement avatar deletion when user is deleted
- Add image cropping functionality
- Implement image compression before upload
