'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Eye, Trash2, Mail, Loader2, KeyRound, UserCheck, UserX } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Personnel, PilotProfile } from './personnel-directory-page';
import Link from 'next/link';
import { usePermissions } from '@/hooks/use-permissions';
import { parseJsonResponse } from '@/lib/safe-json';

type UserProfile = Personnel | PilotProfile;

interface PersonnelActionsProps {
  tenantId: string;
  user: UserProfile;
}

const determineCollection = (userType: UserProfile['userType']): string => {
    switch(userType) {
        case 'Personnel': return 'personnel';
        case 'Instructor': return 'instructors';
        case 'Student': return 'students';
        case 'Private Pilot': return 'private-pilots';
        case 'External': return 'personnel';
        default: return 'personnel';
    }
}

export function PersonnelActions({ tenantId, user }: PersonnelActionsProps) {
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const showResetLinkFallback = process.env.NODE_ENV === 'development';
  const showSetupLinkAction = user.hasPassword !== true;
  const showResetPasswordAction = user.hasPassword !== false;
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [isUpdatingSuspension, setIsUpdatingSuspension] = useState(false);
  const [resetLink, setResetLink] = useState('');

  const canDelete = hasPermission('users-delete');
  const canEdit = hasPermission('users-edit');

  const handleDeleteUser = async () => {
    try {
      const response = await fetch(`/api/personnel/${user.id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to delete user');
      }
      toast({
        title: 'User Removed',
        description: `The user profile for ${user.firstName} ${user.lastName} was deleted.`,
      });
      window.dispatchEvent(new Event('safeviate-personnel-updated'));
      window.dispatchEvent(new Event('safeviate-users-updated'));
      window.location.reload();
    } catch (error: unknown) {
      toast({
        variant: 'destructive',
        title: 'Delete Failed',
        description: error instanceof Error ? error.message : 'The user profile could not be deleted.',
      });
    } finally {
      setIsDeleteDialogOpen(false);
    }
  }

  const handleSendWelcomeEmail = async () => {
    setIsSendingEmail(true);
    try {
      const response = await fetch('/api/admin/send-welcome-email', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: user.id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          tenantId,
        })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = payload ?? {};
        throw new Error(error.error || 'Failed to send email');
      }

      const inviteLink = String(payload?.diagnostics?.inviteLink || '');
      if (inviteLink) {
        setResetLink(inviteLink);
      }

      toast({
        title: 'Initial Password Sent',
        description: inviteLink
          ? `An initial password link was generated for ${user.email}.`
          : `An initial password link has been dispatched to ${user.email}.`
      });
    } catch (error: unknown) {
      toast({
        variant: 'destructive',
        title: 'Email Failed',
        description: error instanceof Error ? error.message : 'Failed to send email.'
      });
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleResetPassword = async () => {
    setIsResettingPassword(true);
    setResetLink('');
    try {
      const response = await fetch('/api/admin/send-password-reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: user.id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          tenantId,
        })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = payload ?? {};
        const fallbackMessage = response.status === 409
          ? 'This email already belongs to a different tenant. Password reset can only be sent within the user tenant.'
          : 'Failed to send password reset email';
        throw new Error(error.error || fallbackMessage);
      }

      const inviteLink = String(payload?.diagnostics?.inviteLink || '');
      setResetLink(inviteLink);

      toast({
        title: 'Password Reset Sent',
        description: inviteLink
          ? `A reset link was generated for ${user.email}.`
          : `A reset link has been dispatched to ${user.email}. Their current password remains active until they save a new one.`
      });
    } catch (error: unknown) {
      toast({
        variant: 'destructive',
        title: 'Reset Failed',
        description: error instanceof Error ? error.message : 'Failed to send password reset email.'
      });
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleToggleSuspension = async () => {
    setIsUpdatingSuspension(true);
    try {
      const response = await fetch('/api/admin/toggle-account-suspension', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          email: user.email,
          tenantId,
          suspended: !user.suspendedAt,
        }),
      });

      if (!response.ok) {
        const error = (await parseJsonResponse<{ error?: string }>(response)) ?? {};
        throw new Error(error.error || 'Failed to update account status');
      }

      toast({
        title: user.suspendedAt ? 'Account Unsuspended' : 'Account Suspended',
        description: user.suspendedAt
          ? `${user.firstName} ${user.lastName} can sign in again.`
          : `${user.firstName} ${user.lastName} can no longer sign in.`,
      });

      window.dispatchEvent(new Event('safeviate-personnel-updated'));
      window.dispatchEvent(new Event('safeviate-users-updated'));
    } catch (error: unknown) {
      toast({
        variant: 'destructive',
        title: 'Update Failed',
        description: error instanceof Error ? error.message : 'Could not update account status.',
      });
    } finally {
      setIsUpdatingSuspension(false);
    }
  };

  return (
    <>
      <div className="flex items-center justify-end gap-2">
        {canEdit && (
          <>
            {showSetupLinkAction ? (
              <Button 
                variant="outline" 
                size="icon" 
                className="h-8 w-8 border-slate-300"
                onClick={handleSendWelcomeEmail}
                disabled={isSendingEmail || isResettingPassword || isUpdatingSuspension}
                title="Set Initial Password"
              >
                {isSendingEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4 text-primary" />}
              </Button>
            ) : null}
            {showResetPasswordAction ? (
              <Button 
                variant="outline" 
                size="icon" 
                className="h-8 w-8 border-slate-300"
                onClick={handleResetPassword}
                disabled={isSendingEmail || isResettingPassword || isUpdatingSuspension}
                title="Reset Password"
              >
                {isResettingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4 text-primary" />}
              </Button>
            ) : null}
            <Button
              variant={user.suspendedAt ? 'outline' : 'destructive'}
              size="icon"
              className="h-8 w-8"
              onClick={handleToggleSuspension}
              disabled={isSendingEmail || isResettingPassword || isUpdatingSuspension}
              title={user.suspendedAt ? 'Unsuspend Account' : 'Suspend Account'}
            >
              {isUpdatingSuspension ? <Loader2 className="h-4 w-4 animate-spin" /> : (user.suspendedAt ? <UserCheck className="h-4 w-4 text-primary" /> : <UserX className="h-4 w-4" />)}
            </Button>
          </>
        )}

        <Button asChild variant="outline" size="sm" className="h-8 gap-2 border-slate-300">
          <Link href={`/users/personnel/${user.id}?type=${user.userType}`}>
            <Eye className="h-4 w-4" />
            View
          </Link>
        </Button>
        
        {canDelete && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setIsDeleteDialogOpen(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        )}
      </div>

      {resetLink && showResetLinkFallback ? (
        <div className="mt-3 rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-50">
          <span className="font-semibold">Reset link generated locally:</span>{' '}
          <a href={resetLink} className="break-all underline decoration-cyan-300/60 underline-offset-4">
            {resetLink}
          </a>
        </div>
      ) : null}

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                    This will permanently delete the user account and profile for {user.firstName} {user.lastName}.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteUser} className='bg-destructive text-destructive-foreground hover:bg-destructive/90'>
                    Delete
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
  </>
  );
}
