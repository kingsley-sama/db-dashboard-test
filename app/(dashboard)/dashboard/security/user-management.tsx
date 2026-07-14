'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Trash2 } from 'lucide-react';

// Must match the public.user_role enum in the database
const USER_ROLES = ['owner', 'admin', 'pm', 'apm'] as const;

type ManagedUser = {
  id: number;
  name: string | null;
  email: string;
  role: (typeof USER_ROLES)[number];
  avatar_url: string | null;
  created_at: string;
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function UserManagement({ currentUserId }: { currentUserId: number }) {
  const { data, error, isLoading, mutate } = useSWR<{
    data?: ManagedUser[];
    error?: string;
  }>('/api/users', fetcher);

  const [pendingId, setPendingId] = useState<number | null>(null);
  const [status, setStatus] = useState<{ error?: string; success?: string }>({});
  const [deleteTarget, setDeleteTarget] = useState<ManagedUser | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const users = data?.data ?? [];

  async function handleRoleChange(target: ManagedUser, role: string) {
    setPendingId(target.id);
    setStatus({});
    try {
      const res = await fetch(`/api/users/${target.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role })
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || 'Failed to update role');
      }
      setStatus({
        success: `${target.name || target.email} is now ${role}.`
      });
      await mutate();
    } catch (err: any) {
      setStatus({ error: err.message });
    } finally {
      setPendingId(null);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setStatus({});
    try {
      const res = await fetch(`/api/users/${deleteTarget.id}`, {
        method: 'DELETE'
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || 'Failed to delete account');
      }
      setStatus({
        success: `${deleteTarget.name || deleteTarget.email}'s account was deleted.`
      });
      setDeleteTarget(null);
      await mutate();
    } catch (err: any) {
      setStatus({ error: err.message });
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle>User Management</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-gray-500 mb-4">
          All active accounts in the database. Change a user's role or delete
          their account.
        </p>

        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading users...
          </div>
        )}

        {(error || data?.error) && !isLoading && (
          <p className="text-red-500 text-sm py-4">
            {data?.error || 'Failed to load users.'}
          </p>
        )}

        {!isLoading && !error && !data?.error && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => {
                  const isSelf = u.id === currentUserId;
                  return (
                    <TableRow key={u.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarImage
                              src={u.avatar_url ?? undefined}
                              alt={u.name ?? u.email}
                            />
                            <AvatarFallback>
                              {(u.name || u.email).slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium text-gray-900 whitespace-nowrap">
                            {u.name || '—'}
                            {isSelf && (
                              <Badge variant="secondary" className="ml-2">
                                You
                              </Badge>
                            )}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-gray-500">{u.email}</TableCell>
                      <TableCell className="text-gray-500 whitespace-nowrap">
                        {new Date(u.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Select
                            value={u.role}
                            onValueChange={(role) => handleRoleChange(u, role)}
                            disabled={isSelf || pendingId === u.id}
                          >
                            <SelectTrigger className="w-28">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {USER_ROLES.map((role) => (
                                <SelectItem key={role} value={role}>
                                  {role}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {pendingId === u.id && (
                            <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          disabled={isSelf}
                          onClick={() => setDeleteTarget(u)}
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">
                            Delete {u.name || u.email}
                          </span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {status.error && (
          <p className="text-red-500 text-sm mt-4">{status.error}</p>
        )}
        {status.success && (
          <p className="text-green-500 text-sm mt-4">{status.success}</p>
        )}
      </CardContent>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this account?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete the account for{' '}
              <span className="font-medium">
                {deleteTarget?.name || deleteTarget?.email}
              </span>{' '}
              ({deleteTarget?.email}). They will lose access immediately. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={isDeleting}
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete Account'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
