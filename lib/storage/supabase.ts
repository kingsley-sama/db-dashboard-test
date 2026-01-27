'use server';

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseKey);

export async function uploadAvatar(file: File, userId: number): Promise<string | null> {
  try {
    // Create a unique filename with timestamp
    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}-${Date.now()}.${fileExt}`;
    const filePath = `avatars/${fileName}`;

    // Convert File to ArrayBuffer then to Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from('annot8')
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (error) {
      console.error('Error uploading avatar:', error);
      return null;
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('annot8')
      .getPublicUrl(filePath);

    return publicUrl;
  } catch (error) {
    console.error('Error in uploadAvatar:', error);
    return null;
  }
}

export async function deleteAvatar(avatarUrl: string): Promise<boolean> {
  try {
    // Extract file path from URL
    const url = new URL(avatarUrl);
    const pathParts = url.pathname.split('/annot8/');
    if (pathParts.length < 2) return false;
    
    const filePath = pathParts[1];

    const { error } = await supabase.storage
      .from('annot8')
      .remove([filePath]);

    if (error) {
      console.error('Error deleting avatar:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in deleteAvatar:', error);
    return false;
  }
}
