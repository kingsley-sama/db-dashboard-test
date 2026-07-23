'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Lock, Trash2, Loader2, Eye, EyeOff } from 'lucide-react';
import { useActionState, useRef, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { updatePassword, deleteAccount } from '@/app/my-app/actions/dashboard_actions';

type PasswordState = {
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
  error?: string;
  success?: string;
};

type DeleteState = {
  password?: string;
  error?: string;
  success?: string;
};

function PasswordInput({
  id,
  name,
  label,
  autoComplete,
  defaultValue,
  value,
  onChange
}: {
  id: string;
  name: string;
  label: string;
  autoComplete?: string;
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
}) {
  const [reveal, setReveal] = useState(false);

  return (
    <div>
      <Label htmlFor={id} className="mb-2">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          name={name}
          type={reveal ? 'text' : 'password'}
          autoComplete={autoComplete}
          required
          minLength={8}
          maxLength={100}
          className="pr-10"
          defaultValue={defaultValue}
          value={value}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        />
        <button
          type="button"
          onClick={() => setReveal((v) => !v)}
          className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
          aria-label={reveal ? 'Hide password' : 'Show password'}
          tabIndex={-1}
        >
          {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

export function SecuritySettings({
  passwordOnly = false
}: {
  passwordOnly?: boolean;
} = {}) {
  const [passwordState, passwordAction, isPasswordPending] = useActionState<
    PasswordState,
    FormData
  >(updatePassword, {});

  const [deleteState, deleteAction, isDeletePending] = useActionState<
    DeleteState,
    FormData
  >(deleteAccount, {});

  const passwordFormRef = useRef<HTMLFormElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Local values so we can validate before showing the confirmation modal.
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [clientError, setClientError] = useState<string | null>(null);

  const handleRequestUpdate = () => {
    // Native validation (required / minLength) first.
    if (!passwordFormRef.current?.reportValidity()) {
      return;
    }
    if (newPassword !== confirmPassword) {
      setClientError('New password and confirmation password do not match.');
      return;
    }
    if (currentPassword === newPassword) {
      setClientError('New password must be different from the current password.');
      return;
    }
    setClientError(null);
    setConfirmOpen(true);
  };

  const handleConfirmUpdate = () => {
    setConfirmOpen(false);
    passwordFormRef.current?.requestSubmit();
  };

  return (
    <>
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Password</CardTitle>
        </CardHeader>
        <CardContent>
          <form ref={passwordFormRef} className="space-y-4" action={passwordAction}>
            <PasswordInput
              id="current-password"
              name="currentPassword"
              label="Current Password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={setCurrentPassword}
            />
            <PasswordInput
              id="new-password"
              name="newPassword"
              label="New Password"
              autoComplete="new-password"
              value={newPassword}
              onChange={setNewPassword}
            />
            <PasswordInput
              id="confirm-password"
              name="confirmPassword"
              label="Confirm New Password"
              value={confirmPassword}
              onChange={setConfirmPassword}
            />
            {clientError && (
              <p className="text-red-500 text-sm">{clientError}</p>
            )}
            {passwordState.error && (
              <p className="text-red-500 text-sm">{passwordState.error}</p>
            )}
            {passwordState.success && (
              <p className="text-green-500 text-sm">{passwordState.success}</p>
            )}
            <Button
              type="button"
              onClick={handleRequestUpdate}
              className="text-white"
              style={{ backgroundColor: '#f05d5e' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#e04d4e')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#f05d5e')}
              disabled={isPasswordPending}
            >
              {isPasswordPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <Lock className="mr-2 h-4 w-4" />
                  Update Password
                </>
              )}
            </Button>
          </form>

          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Update your password?</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to change your password? You&apos;ll use the
                  new password the next time you sign in.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleConfirmUpdate}
                  className="text-white"
                  style={{ backgroundColor: '#f05d5e' }}
                >
                  Yes, update password
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      {!passwordOnly && (
      <Card>
        <CardHeader>
          <CardTitle>Delete Account</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500 mb-4">
            Account deletion is non-reversable. Please proceed with caution.
          </p>
          <form action={deleteAction} className="space-y-4">
            <PasswordInput
              id="delete-password"
              name="password"
              label="Confirm Password"
              defaultValue={deleteState.password}
            />
            {deleteState.error && (
              <p className="text-red-500 text-sm">{deleteState.error}</p>
            )}
            <Button
              type="submit"
              variant="destructive"
              className="bg-red-600 hover:bg-red-700"
              disabled={isDeletePending}
            >
              {isDeletePending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Account
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
      )}
    </>
  );
}
