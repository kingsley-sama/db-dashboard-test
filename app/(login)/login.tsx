'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, ArrowRight, CircleIcon, Eye, EyeOff, Loader2, Upload, X } from 'lucide-react';
import { signIn, signUp } from '@/app/my-app/actions/dashboard_actions';
import { ActionState } from '@/lib/auth/middleware';
import Image from 'next/image';
import { toast } from 'sonner';

export function Login({ mode = 'signin' }: { mode?: 'signin' | 'signup' }) {
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect');
  const priceId = searchParams.get('priceId');
  const inviteId = searchParams.get('inviteId');
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    mode === 'signin' ? signIn : signUp,
    { error: '' }
  );
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast.error('That file type won\'t work', {
          description: 'Please choose an image file (JPG, PNG, GIF or WebP) for your avatar.'
        });
        return;
      }
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Image is too large', {
          description: `Your file is ${(file.size / (1024 * 1024)).toFixed(1)} MB — the maximum avatar size is 5 MB. Try a smaller or compressed image.`
        });
        return;
      }
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeAvatar = () => {
    setAvatarPreview(null);
    setSelectedFile(null);
    const fileInput = document.getElementById('avatar') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  };

  return (
    <div className="min-h-[100dvh] flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 bg-gray-50">
      <div className="sm:mx-auto sm:w-full sm:max-w-md lg:max-w-lg">
        <div className="flex justify-center">
          <CircleIcon className="h-12 w-12" style={{ color: '#f05d5e' }} />
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          {mode === 'signin'
            ? 'Sign in to your account'
            : 'Create your account'}
        </h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md lg:max-w-lg">
        <form className="space-y-6" action={formAction}>
          <input type="hidden" name="redirect" value={redirect || ''} />
          <input type="hidden" name="priceId" value={priceId || ''} />
          <input type="hidden" name="inviteId" value={inviteId || ''} />
          
          {mode === 'signup' && (
            <>
              {/* Avatar Upload */}
              <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                <Label
                  htmlFor="avatar"
                  className="block text-base font-semibold text-gray-900 mb-4"
                >
                  Profile Picture (Optional)
                </Label>
                <div className="flex flex-col sm:flex-row items-center gap-6">
                  <div className="relative flex-shrink-0">
                    {avatarPreview ? (
                      <div className="relative group">
                        <Image
                          src={avatarPreview}
                          alt="Avatar preview"
                          width={120}
                          height={120}
                          className="w-28 h-28 sm:w-32 sm:h-32 rounded-full object-cover shadow-lg"
                          style={{ border: '4px solid #f05d5e' }}
                        />
                        <button
                          type="button"
                          onClick={removeAvatar}
                          className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-2 hover:bg-red-600 shadow-md transition-all hover:scale-110"
                          aria-label="Remove avatar"
                        >
                          <X className="h-5 w-5" />
                        </button>
                      </div>
                    ) : (
                      <label
                        htmlFor="avatar"
                        className="w-28 h-28 sm:w-32 sm:h-32 rounded-full flex flex-col items-center justify-center border-4 border-dashed cursor-pointer transition-all hover:scale-105 group"
                        style={{ 
                          background: 'linear-gradient(to bottom right, rgba(240, 93, 94, 0.1), rgba(240, 93, 94, 0.2))',
                          borderColor: 'rgba(240, 93, 94, 0.5)'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.borderColor = '#f05d5e'}
                        onMouseLeave={(e) => e.currentTarget.style.borderColor = 'rgba(240, 93, 94, 0.5)'}
                      >
                        <Upload className="h-10 w-10 mb-2" style={{ color: '#f05d5e' }} />
                        <span className="text-xs font-medium" style={{ color: '#f05d5e' }}>Click to upload</span>
                      </label>
                    )}
                  </div>
                  <div className="flex-1 w-full">
                    <Input
                      id="avatar"
                      name="avatar"
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="block w-full text-sm text-gray-600
                        file:mr-4 file:py-3 file:px-6
                        file:rounded-full file:border-0
                        file:text-sm file:font-semibold
                        file:text-white
                        file:cursor-pointer
                        file:transition-colors cursor-pointer"
                      style={{ ['--file-bg' as any]: '#f05d5e' }}
                      onMouseEnter={(e) => {
                        const input = e.currentTarget as any;
                        input.style.setProperty('--file-hover-bg', '#e04d4e');
                      }}
                    />
                    <p className="mt-3 text-sm text-gray-600 leading-relaxed">
                      <span className="font-medium">Accepted formats:</span> PNG, JPG, GIF<br />
                      <span className="font-medium">Max size:</span> 5MB
                    </p>
                  </div>
                </div>
              </div>

              {/* Name Field */}
              <div>
                <Label
                  htmlFor="name"
                  className="block text-sm font-medium text-gray-700"
                >
                  Full Name
                </Label>
                <div className="mt-1">
                  <Input
                    id="name"
                    name="name"
                    type="text"
                    autoComplete="name"
                    required
                    maxLength={100}
                    className="appearance-none rounded-full relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:z-10 sm:text-sm"
                    style={{ ['--focus-ring' as any]: '#f05d5e', ['--focus-border' as any]: '#f05d5e' }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#f05d5e';
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(240, 93, 94, 0.1)';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '';
                      e.currentTarget.style.boxShadow = '';
                    }}
                    placeholder="Enter your full name"
                  />
                </div>
              </div>
            </>
          )}
          
          <div>
            <Label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700"
            >
              Email
            </Label>
            <div className="mt-1">
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                defaultValue={state.email}
                required
                maxLength={50}
                className="appearance-none rounded-full relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:z-10 sm:text-sm"
                style={{ ['--focus-ring' as any]: '#f05d5e', ['--focus-border' as any]: '#f05d5e' }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#f05d5e';
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(240, 93, 94, 0.1)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '';
                  e.currentTarget.style.boxShadow = '';
                }}
                placeholder="Enter your email"
              />
            </div>
          </div>

          <div>
            <Label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700"
            >
              Password
            </Label>
            <div className="mt-1 relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={
                  mode === 'signin' ? 'current-password' : 'new-password'
                }
                defaultValue={state.password}
                required
                minLength={8}
                maxLength={100}
                className="appearance-none rounded-full relative block w-full px-3 py-2 pr-10 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:z-10 sm:text-sm"
                style={{ ['--focus-ring' as any]: '#f05d5e', ['--focus-border' as any]: '#f05d5e' }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#f05d5e';
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(240, 93, 94, 0.1)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '';
                  e.currentTarget.style.boxShadow = '';
                }}
                placeholder="Enter your password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((show) => !show)}
                className="absolute right-3 top-1/2 -translate-y-1/2 z-20 text-gray-400 hover:text-gray-600"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {state?.error && (
            <div className="text-red-500 text-sm">{state.error}</div>
          )}

          <div>
            <Button
              type="submit"
              className="w-full flex justify-center items-center py-2 px-4 border border-transparent rounded-full shadow-sm text-sm font-medium text-white"
              style={{ backgroundColor: '#f05d5e' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#e04d4e'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#f05d5e'}
              onFocus={(e) => {
                e.currentTarget.style.outline = 'none';
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(240, 93, 94, 0.3)';
              }}
              onBlur={(e) => e.currentTarget.style.boxShadow = ''}
              disabled={pending}
            >
              {pending ? (
                <>
                  <Loader2 className="animate-spin mr-2 h-4 w-4" />
                  Loading...
                </>
              ) : mode === 'signin' ? (
                'Sign in'
              ) : (
                'Sign up'
              )}
            </Button>
          </div>
        </form>

        <div className="mt-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-gray-50 text-gray-500">
                {mode === 'signin'
                  ? 'are you lost ?'
                  : 'Already have an account?'}
              </span>
            </div>
          </div>

          <div className="mt-6">
            <Link
              href={`${mode === 'signin' ? '/' : '/sign-in'}${
                redirect ? `?redirect=${redirect}` : ''
              }${priceId ? `&priceId=${priceId}` : ''}`}
              className=""
            >
              {mode === 'signin'
                ? <Button
                    variant="outline"
                    className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-full shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none"
                    onFocus={(e) => {
                      e.currentTarget.style.outline = 'none';
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(240, 93, 94, 0.3), 0 0 0 2px rgba(240, 93, 94, 0.1)';
                    }}
                    onBlur={(e) => e.currentTarget.style.boxShadow = ''}
                  >
                    <ArrowLeft className="ml-2 h-5 w-5 mr-2" />
                    Home
                  </Button>
                : 'Sign in to existing account'}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
