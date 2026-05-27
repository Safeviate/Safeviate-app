'use client';

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Personnel, PilotProfile } from '../personnel-directory-page';

import type { Role } from '../../../admin/roles/page';
import type { Department } from '../../../admin/department/page';
import { Button } from '@/components/ui/button';
import { CalendarIcon, Trash2, Upload, Eye, PlusCircle, Contact, PhoneCall, ShieldCheck, ShieldAlert, LayoutGrid, ListFilter, UserCircle, ClipboardCheck, Mail, Loader2, Pencil, KeyRound, UserCheck, UserX } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import Image from 'next/image';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CustomCalendar } from '@/components/ui/custom-calendar';
import { format } from 'date-fns';
import { DocumentUploader } from '@/components/document-uploader';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { DocumentExpirySettings } from '../../../admin/document-dates/page';
import { TrainingRecords } from './training-records';
import { PilotLogbook } from './pilot-logbook';
import { permissionsConfig } from '@/lib/permissions-config';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { usePermissions } from '@/hooks/use-permissions';
import { useIsMobile } from '@/hooks/use-mobile';
import { menuConfig } from '@/lib/menu-config';
import { Label } from '@/components/ui/label';
import { useUserProfile } from '@/hooks/use-user-profile';
import { getDocumentExpiryColor } from '@/lib/document-expiry';
import { DeleteActionButton, ViewActionButton } from '@/components/record-action-buttons';
import { MainPageHeader } from '@/components/page-header';
import { ResponsiveTabRow } from '@/components/responsive-tab-row';
import { parseJsonResponse } from '@/lib/safe-json';
import { getPermissionDisplayLabel } from '@/lib/permission-display';
import { hasHierarchicalPermission, normalizePermissionIds } from '@/lib/permission-model';
import { getPermissionSections } from '@/lib/permission-sections';

const parseLocalDate = (value?: string | null) => {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day, 12);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

type UserProfile = Personnel | PilotProfile;

interface ViewPersonnelDetailsProps {
  user: UserProfile;
  role: Role | null;
  department: Department | null;
  actions?: React.ReactNode;
}

type Document = NonNullable<UserProfile['documents']>[0];

const DetailItem = ({ label, value, children }: { label: string; value?: string | null, children?: React.ReactNode }) => (
    <div>
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
      {children ? children : <p className="text-sm font-bold text-foreground">{value || 'N/A'}</p>}
    </div>
);

const SectionHeader = ({ title, icon: Icon }: { title: string, icon: React.ElementType }) => (
    <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
        </div>
        <h3 className="text-lg font-black uppercase tracking-tight">{title}</h3>
    </div>
);

const isPilotProfile = (user: UserProfile): user is PilotProfile => {
    return user.userType === 'Student' || user.userType === 'Private Pilot' || user.userType === 'Instructor';
}

const roleGrantsPermission = (role: Role | null | undefined, permissionId: string) => {
  const permissions = normalizePermissionIds(Array.isArray(role?.permissions) ? role?.permissions : []);
  return permissions.includes('*') || hasHierarchicalPermission(permissions, permissionId);
};

export function ViewPersonnelDetails({ user, role, department, actions }: ViewPersonnelDetailsProps) {
  const [isImageViewerOpen, setIsImageViewerOpen] = useState(false);
  const [viewingImageUrl, setViewingImageUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [hiddenMenus, setHiddenMenus] = useState<string[]>(user.accessOverrides?.hiddenMenus || []);
  const [localPermissions, setLocalPermissions] = useState<string[]>(user.permissions || []);
  const [documents, setDocuments] = useState<Document[]>(user.documents || []);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [isUpdatingSuspension, setIsUpdatingSuspension] = useState(false);
  const [resetLink, setResetLink] = useState('');
  
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const showResetLinkFallback = process.env.NODE_ENV === 'development';
  const showSetupLinkAction = user.hasPassword !== true;
  const showResetPasswordAction = user.hasPassword !== false;
  const firestore = null; // Mock
  const { hasPermission } = usePermissions();
  const { tenantId, rolePermissions } = useUserProfile();
  const [instructorDirectory, setInstructorDirectory] = useState<PilotProfile[]>([]);
  const permissionSections = useMemo(() => getPermissionSections(permissionsConfig), []);
  const canBypassPermissionRoleGate = useMemo(() => rolePermissions.includes('*'), [rolePermissions]);

  const canEdit = hasPermission('users-edit');

  useEffect(() => {
    setHiddenMenus(user.accessOverrides?.hiddenMenus || []);
  }, [user]);

  useEffect(() => {
    setLocalPermissions(normalizePermissionIds(user.permissions || []));
  }, [user]);

  useEffect(() => {
    setDocuments(user.documents || []);
  }, [user.id]);

  useEffect(() => {
      try {
          void fetch('/api/users', { cache: 'no-store' })
            .then((response) => parseJsonResponse<{ instructors?: PilotProfile[] }>(response))
            .then((payload) => setInstructorDirectory(Array.isArray(payload?.instructors) ? payload.instructors : []))
            .catch(() => setInstructorDirectory([]));
      } catch {
          // ignore
      }
  }, []);

  const [expirySettings, setExpirySettings] = useState<DocumentExpirySettings | null>(null);

  useEffect(() => {
      try {
          void fetch('/api/tenant-config', { cache: 'no-store' })
            .then((response) => parseJsonResponse<{ config?: Record<string, any> | null }>(response))
            .then((payload) => {
              const config = payload?.config || {};
              if (config['document-expiry']) {
                setExpirySettings(config['document-expiry']);
              }
            })
            .catch(() => {});
      } catch {
          // ignore
      }
  }, []);

  const handleViewImage = (url: string) => {
    setViewingImageUrl(url);
    setIsImageViewerOpen(true);
  };
  
  const handleDocumentUpdate = async (updatedDocuments: Document[]) => {
    const previousDocuments = documents;
    setDocuments(updatedDocuments);

    const response = await fetch(`/api/personnel/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personnel: { ...user, documents: updatedDocuments } }),
    });

    const payload = await parseJsonResponse<{ error?: string }>(response);
    if (!response.ok) {
      setDocuments(previousDocuments);
      throw new Error(payload?.error || 'Failed to update personnel documents.');
    }

    window.dispatchEvent(new Event('safeviate-personnel-updated'));
  };

  const onDocumentUploaded = async (docDetails: { name: string; url: string; uploadDate: string; expirationDate: string | null }) => {
    const currentDocs = documents || [];
    const existingDocIndex = currentDocs.findIndex(d => d.name === docDetails.name);

    let updatedDocs;
    if (existingDocIndex > -1) {
        updatedDocs = [...currentDocs];
        const expirationDate = updatedDocs[existingDocIndex].expirationDate; 
        updatedDocs[existingDocIndex] = { ...docDetails, expirationDate };
    } else {
        updatedDocs = [...currentDocs, docDetails];
    }

    try {
      await handleDocumentUpdate(updatedDocs);
      toast({ title: 'Document Saved', description: `"${docDetails.name}" now appears in the document section.` });
    } catch (error: unknown) {
      toast({
        variant: 'destructive',
        title: 'Save Failed',
        description: error instanceof Error ? error.message : 'Could not save the uploaded document.',
      });
    }
  };

  const handleExpirationDateChange = async (docName: string, date: Date | undefined) => {
    const currentDocs = documents || [];
    const docIndex = currentDocs.findIndex(d => d.name === docName);
    
    if (docIndex > -1) {
        const updatedDocs = [...currentDocs];
        updatedDocs[docIndex].expirationDate = date
          ? new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12)).toISOString()
          : null;
        try {
          await handleDocumentUpdate(updatedDocs);
          toast({ title: 'Document Updated' });
        } catch (error: unknown) {
          toast({
            variant: 'destructive',
            title: 'Update Failed',
            description: error instanceof Error ? error.message : 'Could not update the document expiry date.',
          });
        }
    }
  };

  const handleDocumentDelete = async (docNameToDelete: string) => {
    const currentDocs = documents || [];
    const updatedDocs = currentDocs.filter(doc => doc.name !== docNameToDelete);
    try {
      await handleDocumentUpdate(updatedDocs);
      toast({ title: "Document Deleted" });
    } catch (error: unknown) {
      toast({
        variant: 'destructive',
        title: 'Delete Failed',
        description: error instanceof Error ? error.message : 'Could not delete the document.',
      });
    }
  };

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
        const error = payload as { error?: string };
        throw new Error(error?.error || 'Failed to send email');
      }

      const inviteLink = String((payload as { diagnostics?: { inviteLink?: string } })?.diagnostics?.inviteLink || '');
      if (inviteLink) {
        setResetLink(inviteLink);
      }

      toast({
        title: 'Setup Link Sent',
        description: inviteLink
          ? `A setup link was generated for ${user.email}.`
          : `A setup link has been dispatched to ${user.email}.`
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
        const error = payload as { error?: string };
        const fallbackMessage = response.status === 409
          ? 'This email already belongs to a different tenant. Password reset can only be sent within the user tenant.'
          : 'Failed to send password reset email';
        throw new Error(error?.error || fallbackMessage);
      }

      const inviteLink = String((payload as { diagnostics?: { inviteLink?: string } })?.diagnostics?.inviteLink || '');
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
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: user.id,
          email: user.email,
          tenantId,
          suspended: !user.suspendedAt,
        })
      });

      if (!response.ok) {
        const error = await parseJsonResponse<{ error?: string }>(response);
        throw new Error(error?.error || 'Failed to update account status');
      }

      window.dispatchEvent(new Event('safeviate-users-updated'));
      window.dispatchEvent(new Event('safeviate-personnel-updated'));
      toast({
        title: user.suspendedAt ? 'Account Unsuspended' : 'Account Suspended',
        description: user.suspendedAt
          ? `${user.firstName} ${user.lastName} can sign in again.`
          : `${user.firstName} ${user.lastName} can no longer sign in.`,
      });
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

  const combinedDocuments = useMemo(() => {
    const required = role?.requiredDocuments || [];
    const uploaded = documents || [];
    const allDocNames = new Set([...required, ...uploaded.map(d => d.name)]);

    return Array.from(allDocNames).map(docName => {
        const uploadedDoc = uploaded.find(upDoc => upDoc.name === docName);
        const isRequired = required.includes(docName);
        return {
            name: docName,
            isUploaded: !!uploadedDoc?.url,
            url: uploadedDoc?.url,
            expirationDate: uploadedDoc?.expirationDate,
            isRequired: isRequired,
        };
    });
  }, [role, documents]);

  const handleToggleMenuOverride = async (href: string, hidden: boolean, subHrefs?: string[]) => {
    if (!canEdit) return;
    
    const currentHidden = hiddenMenus;
    let newHidden: string[];

    if (hidden) {
      const toHide = [href, ...(subHrefs || [])];
      newHidden = Array.from(new Set([...currentHidden, ...toHide]));
    } else {
      const toShow = [href, ...(subHrefs || [])];
      newHidden = currentHidden.filter(h => !toShow.includes(h));
    }
    
    try {
      await fetch(`/api/personnel/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personnel: { ...user, accessOverrides: { ...user.accessOverrides, hiddenMenus: newHidden } } }),
      });
      setHiddenMenus(newHidden);
      toast({ title: hidden ? "Access Restricted" : "Access Restored" });
    } catch {
      toast({
        variant: 'destructive',
        title: 'Update Failed',
        description: 'Module access could not be updated. Please try again.',
      });
    }
  };

  const handlePermissionToggle = async (permissionId: string, checked: boolean) => {
      if (!canEdit) return;
      const currentPermissions = localPermissions || [];
    const isInherited = roleGrantsPermission(role, permissionId);

    if (!isInherited && !canBypassPermissionRoleGate) {
        toast({
            variant: 'destructive',
            title: 'Role Required',
            description: 'This permission must be granted by the role before an individual override can be applied.',
        });
        return;
    }

    let newPermissions: string[];

    newPermissions = checked
        ? [...currentPermissions.filter(p => p !== `!${permissionId}`), permissionId]
        : [...currentPermissions.filter(p => p !== permissionId), `!${permissionId}`];

    try {
      await fetch(`/api/personnel/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personnel: { ...user, permissions: newPermissions } }),
      });
      setLocalPermissions(newPermissions);
      toast({ title: "Access Level Updated" });
    } catch {
      toast({
        variant: 'destructive',
        title: 'Update Failed',
        description: 'Granular permissions could not be updated. Please try again.',
      });
    }
  };

  const isStudent = isPilotProfile(user) && user.userType === 'Student';
  const isAnyPilot = isPilotProfile(user);
  const currentAssignedInstructor = useMemo(() => {
    if (!isStudent || !('primaryInstructorId' in user) || !user.primaryInstructorId) return null;
    return instructorDirectory.find((person) => person.id === user.primaryInstructorId) || null;
  }, [instructorDirectory, isStudent, user]);

  const availableTabs = useMemo(() => {
    const tabs = [
        { value: 'overview', label: 'Overview', icon: UserCircle },
        { value: 'documents', label: 'Documents', icon: LayoutGrid },
        { value: 'access', label: 'Module Access', icon: ShieldCheck },
        { value: 'permissions', label: 'Granular Permissions', icon: ShieldAlert },
    ];
    if (isStudent) tabs.push({ value: 'training', label: 'Training Records', icon: ClipboardCheck });
    if (isAnyPilot) tabs.push({ value: 'logbook', label: 'Logbook', icon: ClipboardCheck });
    return tabs;
  }, [isStudent, isAnyPilot]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
        <Card className="flex-1 flex flex-col overflow-hidden shadow-none border">
            <MainPageHeader 
                title={`${user.firstName} ${user.lastName}`}
                actions={
                  <>
                    <div className="flex items-center gap-2">
                      {canEdit && (
                        <>
                          {showSetupLinkAction ? (
                            <Button 
                              variant="outline" 
                              size={isMobile ? "sm" : "default"}
                              onClick={handleSendWelcomeEmail}
                              disabled={isSendingEmail || isResettingPassword}
                              className="gap-2 border-slate-300 text-[10px] font-black uppercase"
                            >
                              {isSendingEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4 text-primary" />}
                              {isMobile ? "Invite" : "Send Setup Link"}
                            </Button>
                          ) : null}
                          {showResetPasswordAction ? (
                            <Button 
                              variant="outline" 
                              size={isMobile ? "sm" : "default"}
                              onClick={handleResetPassword}
                              disabled={isSendingEmail || isResettingPassword}
                              className="gap-2 border-slate-300 text-[10px] font-black uppercase"
                            >
                              {isResettingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4 text-primary" />}
                              {isMobile ? "Reset" : "Reset Password"}
                            </Button>
                          ) : null}
                          <Button 
                            variant={user.suspendedAt ? "outline" : "destructive"} 
                            size={isMobile ? "sm" : "default"}
                            onClick={handleToggleSuspension}
                            disabled={isSendingEmail || isResettingPassword || isUpdatingSuspension}
                            className="gap-2 text-[10px] font-black uppercase"
                          >
                            {isUpdatingSuspension ? <Loader2 className="h-4 w-4 animate-spin" /> : (user.suspendedAt ? <UserCheck className="h-4 w-4" /> : <UserX className="h-4 w-4" />)}
                            {user.suspendedAt ? (isMobile ? "Unsuspend" : "Unsuspend Account") : (isMobile ? "Suspend" : "Suspend Account")}
                          </Button>
                        </>
                      )}
                      {actions}
                    </div>
                    {resetLink && showResetLinkFallback ? (
                      <div className="mt-2 rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-[11px] text-cyan-50">
                        <span className="font-semibold">Reset link generated locally:</span>{' '}
                        <a href={resetLink} className="break-all underline decoration-cyan-300/60 underline-offset-4">
                          {resetLink}
                        </a>
                      </div>
                    ) : null}
                  </>
                }
            />

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex-1 flex flex-col min-h-0 overflow-hidden">
                <ResponsiveTabRow
                    value={activeTab}
                    onValueChange={setActiveTab}
                    placeholder="Select Section"
                    className="border-b bg-muted/5 px-3 py-2 shrink-0"
                    options={availableTabs}
                />

                <CardContent className="flex-1 p-0 overflow-hidden bg-background">
                    <ScrollArea className="h-full">
                        <div className="p-0">
                            <TabsContent value="overview" className="m-0">
                                <div className="p-6 space-y-10">
                                    <div className="flex justify-between items-start">
                                        <div className="flex flex-col gap-2">
                                            {user.isErpIncerfaContact && (
                                                <Badge className="bg-red-600 text-white gap-1.5 h-7 px-3 text-[10px] font-black uppercase">
                                                    <ShieldAlert className="h-3.5 w-3.5" />
                                                    Designated INCERFA Contact
                                                </Badge>
                                            )}
                                            {user.isErpAlerfaContact && (
                                                <Badge className="bg-amber-600 text-white gap-1.5 h-7 px-3 text-[10px] font-black uppercase">
                                                    <ShieldAlert className="h-3.5 w-3.5" />
                                                    Designated ALERFA Contact
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                    <section>
                                        <SectionHeader title="Contact & Role" icon={Contact} />
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                            <DetailItem label="User Number" value={user.userNumber} />
                                            <DetailItem label="First Name" value={user.firstName} />
                                            <DetailItem label="Last Name" value={user.lastName} />
                                            <DetailItem label="Email" value={user.email} />
                                            <DetailItem label="Contact Number" value={user.contactNumber} />
                                            <DetailItem label="Role" value={role?.name} />
                                            {!isPilotProfile(user) && <DetailItem label="Department" value={department?.name} />}
                                            {isPilotProfile(user) && (
                                                <>
                                                    {isStudent && (
                                                      <DetailItem
                                                        label="Assigned Instructor"
                                                        value={currentAssignedInstructor ? `${currentAssignedInstructor.firstName} ${currentAssignedInstructor.lastName}` : 'Unassigned'}
                                                      />
                                                    )}
                                                    <DetailItem label="License Number" value={user.pilotLicense?.licenseNumber} />
                                                    <DetailItem label="Ratings">
                                                        <div className="flex flex-wrap gap-2 mt-1">
                                                            {(user.pilotLicense?.ratings || []).map(r => <Badge key={r} variant="secondary" className="text-[9px] font-black uppercase">{r}</Badge>)}
                                                            {(user.pilotLicense?.ratings || []).length === 0 && <p className="text-sm font-bold text-muted-foreground italic">N/A</p>}
                                                        </div>
                                                    </DetailItem>
                                                    <DetailItem label="Endorsements" >
                                                        <div className="flex flex-wrap gap-2 mt-1">
                                                            {(user.pilotLicense?.endorsements || []).map(e => <Badge key={e} variant="secondary" className="text-[9px] font-black uppercase">{e}</Badge>)}
                                                            {(user.pilotLicense?.endorsements || []).length === 0 && <p className="text-sm font-bold text-muted-foreground italic">N/A</p>}
                                                        </div>
                                                    </DetailItem>
                                                </>
                                            )}
                                        </div>
                                    </section>
                                    <Separator />
                                    <section>
                                        <SectionHeader title="Emergency Contact" icon={PhoneCall} />
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                            <DetailItem label="Full Name" value={user.emergencyContact?.name} />
                                            <DetailItem label="Relationship" value={user.emergencyContact?.relationship} />
                                            <DetailItem label="Phone Number" value={user.emergencyContact?.phone} />
                                        </div>
                                    </section>
                                </div>
                            </TabsContent>

                            <TabsContent value="documents" className="m-0">
                                <div className="p-6 space-y-6">
                                    <div className="flex justify-between items-center bg-muted/5 p-4 border rounded-xl">
                                        <div className="space-y-0.5">
                                            <h4 className="text-sm font-black uppercase tracking-tight">Support Documents</h4>
                                            <p className="text-xs text-muted-foreground">Required and uploaded compliance documentation.</p>
                                        </div>
                                        {canEdit ? (
                                          <DocumentUploader
                                              onDocumentUploaded={onDocumentUploaded}
                                              trigger={(openDialog) => (
                                                  <Button size="compact" variant="outline" onClick={() => openDialog()}>
                                                      <PlusCircle className="mr-2 h-4 w-4" /> Add Document
                                                  </Button>
                                              )}
                                          />
                                        ) : (
                                          <Badge variant="outline" className="text-[10px] font-black uppercase">Read Only</Badge>
                                        )}
                                    </div>
                                    <div className="rounded-xl border border-slate-200 overflow-hidden">
                                        {combinedDocuments.length > 0 ? (
                                            <Table>
                                                <TableHeader className="bg-muted/30">
                                                    <TableRow>
                                                        <TableHead className="text-[10px] uppercase font-bold tracking-wider">Document Name</TableHead>
                                                        <TableHead className="text-[10px] uppercase font-bold tracking-wider">Expiry</TableHead>
                                                        <TableHead className='text-center text-[10px] uppercase font-bold tracking-wider'>Set Expiry</TableHead>
                                                        <TableHead className="text-right text-[10px] uppercase font-bold tracking-wider">Actions</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {combinedDocuments.map((doc) => {
                                                        const statusColor = getDocumentExpiryColor(doc.expirationDate, expirySettings);
                                                        return (
                                                            <TableRow key={doc.name}>
                                                                <TableCell className="font-bold text-sm">{doc.name}</TableCell>
                                                                <TableCell className="min-w-[150px] whitespace-nowrap">
                                                                    <div className="flex items-center gap-2 text-sm font-medium">
                                                                        {statusColor && (
                                                                            <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: statusColor }} />
                                                                        )}
                                                                        {doc.expirationDate ? format(parseLocalDate(doc.expirationDate) || new Date(doc.expirationDate), 'PPP') : 'N/A'}
                                                                    </div>
                                                                </TableCell>
                                                                <TableCell className='text-center'>
                                                                    <Popover>
                                                                        <PopoverTrigger asChild><Button variant="outline" size="icon" className='h-8 w-8' disabled={!canEdit}><CalendarIcon className="h-4 w-4" /></Button></PopoverTrigger>
                                                                        <PopoverContent className="w-auto p-0"><CustomCalendar selectedDate={parseLocalDate(doc.expirationDate || undefined) || undefined} onDateSelect={(date) => date && handleExpirationDateChange(doc.name, date)} /></PopoverContent>
                                                                    </Popover>
                                                                </TableCell>
                                                                <TableCell className="text-right">
                                                                    {doc.isUploaded ? (
                                                                        <div className="flex gap-2 justify-end">
                                                                            <ViewActionButton onClick={() => handleViewImage(doc.url!)} />
                                                                            {canEdit ? (
                                                                              <DeleteActionButton
                                                                                  description={`This will permanently delete "${doc.name}".`}
                                                                                  onDelete={() => handleDocumentDelete(doc.name)}
                                                                                  srLabel="Delete document"
                                                                              />
                                                                            ) : null}
                                                                        </div>
                                                                    ) : (
                                                                        canEdit ? (
                                                                          <DocumentUploader defaultFileName={doc.name} onDocumentUploaded={onDocumentUploaded} trigger={(openDialog) => (<Button size="compact" onClick={() => openDialog()} variant="secondary"><Upload className="mr-2 h-4 w-4" /> Upload</Button>)} />
                                                                        ) : (
                                                                          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Missing</span>
                                                                        )
                                                                    )}
                                                                </TableCell>
                                                            </TableRow>
                                                        )
                                                    })}
                                                </TableBody>
                                            </Table>
                                            ) : <p className="text-sm text-muted-foreground text-center py-8 bg-muted/10 italic">No documents required.</p>}
                                    </div>
                                </div>
                            </TabsContent>

                            <TabsContent value="access" className="m-0">
                                <div className="p-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {menuConfig.map((menu) => {
                                            const subHrefs = menu.subItems?.map(s => s.href) || [];
                                            
                                            return (
                                                  <div key={menu.href} className="p-4 border rounded-xl bg-muted/10 space-y-3">
                                                    <div className="flex items-center space-x-2">
                                                        <Checkbox 
                                                            id={`user-mod-${menu.href}`} 
                                                            checked={!hiddenMenus.includes(menu.href)}
                                                            onCheckedChange={(val) => handleToggleMenuOverride(menu.href, !val, subHrefs)}
                                                            disabled={!canEdit}
                                                        />
                                                        <Label htmlFor={`user-mod-${menu.href}`} className="font-black uppercase text-[11px] flex items-center gap-2 cursor-pointer">
                                                            <menu.icon className="h-4 w-4 text-primary" />
                                                            {menu.label}
                                                        </Label>
                                                    </div>
                                                    {menu.subItems && (
                                                        <div className="pl-6 space-y-2 border-l ml-2">
                                                            {menu.subItems.map((sub) => {
                                                                return (
                                                                    <div key={sub.href} className="flex items-center space-x-2">
                                                                        <Checkbox 
                                                                            id={`user-submod-${sub.href}`} 
                                                                            checked={!hiddenMenus.includes(sub.href)}
                                                                            onCheckedChange={(val) => handleToggleMenuOverride(sub.href, !val)}
                                                                            disabled={!canEdit}
                                                                        />
                                                                        <Label htmlFor={`user-submod-${sub.href}`} className="text-10 font-bold uppercase text-muted-foreground cursor-pointer">
                                                                            {sub.label}
                                                                        </Label>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </TabsContent>

                            <TabsContent value="permissions" className="m-0">
                                <div className="p-6">
                                    <div className="space-y-6">
                                      {permissionSections.map((section) => (
                                        <section key={section.title} className="space-y-3">
                                          <div className="flex items-center justify-between">
                                            <h4 className="text-[10px] font-black uppercase text-muted-foreground tracking-[0.25em]">{section.title}</h4>
                                          </div>
                                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                            {section.resources.map((resource) => (
                                              <div key={resource.id} className='space-y-3 bg-background p-4 rounded-xl border border-slate-200 shadow-sm'>
                                                  <h5 className='text-[10px] font-black uppercase text-primary border-b border-primary/20 pb-2 mb-3 tracking-widest'>{resource.name}</h5>
                                                  <div className="flex flex-col gap-2.5">
                                                      {resource.actions.map(action => {
                                                          const permissionId = `${resource.id}-${action}`;
                                                          const isInherited = roleGrantsPermission(role, permissionId);
                                                          const isOverridden = localPermissions?.includes(permissionId);
                                                          const isDenied = localPermissions?.includes(`!${permissionId}`);
                                                          const isEffective = (isInherited && !isDenied) || isOverridden;
                                                          return (
                                                              <div key={action} className="flex items-center space-x-3">
                                                                    <Checkbox
                                                                      id={`perm-${permissionId}`}
                                                                      checked={!!isEffective}
                                                                    disabled={!canEdit || (!isInherited && !canBypassPermissionRoleGate)}
                                                                    onCheckedChange={(checked) => handlePermissionToggle(permissionId, !!checked)}
                                                                    />
                                                                  <label htmlFor={`perm-${permissionId}`} className={cn("text-[11px] font-bold uppercase cursor-pointer", isInherited && !isDenied && !isOverridden && "text-muted-foreground italic")}>
                                                                      {getPermissionDisplayLabel(action)}
                                                                      {isInherited && !isDenied && !isOverridden && <span className="ml-2 text-[9px] opacity-70">(Role)</span>}
                                                                      {isOverridden && <span className="ml-2 text-[9px] text-primary opacity-70">(Override)</span>}
                                                                      {isDenied && <span className="ml-2 text-[9px] text-destructive opacity-70">(Denied)</span>}
                                                                  </label>
                                                              </div>
                                                          );
                                                      })}
                                                  </div>
                                              </div>
                                            ))}
                                          </div>
                                        </section>
                                      ))}
                                    </div>
                                </div>
                            </TabsContent>
                            
                            {isStudent && <TabsContent value="training" className="m-0"><TrainingRecords studentId={user.id} tenantId={tenantId!} /></TabsContent>}
                            {isAnyPilot && <TabsContent value="logbook" className="m-0"><PilotLogbook userId={user.id} tenantId={tenantId!} role={user.userType === 'Instructor' ? 'instructor' : user.userType === 'Student' ? 'student' : 'private'} /></TabsContent>}
                        </div>
                    </ScrollArea>
                </CardContent>
            </Tabs>
        </Card>

        <Dialog open={isImageViewerOpen} onOpenChange={setIsImageViewerOpen}>
            <DialogContent className="max-w-4xl max-h-[90vh]">
                <DialogHeader><DialogTitle className="font-black uppercase tracking-tight">Document Viewer</DialogTitle></DialogHeader>
                {viewingImageUrl && <div className="relative h-[80vh] w-full mt-4"><Image src={viewingImageUrl} alt="Document" fill className="object-contain" /></div>}
            </DialogContent>
        </Dialog>
    </div>
  );
}
