'use client';

import { useState, useEffect, useMemo } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ChevronsUpDown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { permissionsConfig } from '@/lib/permissions-config';
import type { Personnel, PilotProfile } from '../personnel-directory-page';
import type { Role } from '../../../admin/roles/page';
import type { Department } from '../../../admin/department/page';
import type { ExternalOrganization } from '@/types/quality';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import type { LogbookTemplate } from '@/app/(app)/development/logbook-parser/page';
import { Switch } from '@/components/ui/switch';
import { parseJsonResponse } from '@/lib/safe-json';

type UserProfile = Personnel | PilotProfile;

type PersonnelFormState = {
  id: string;
  userType: UserProfile['userType'];
  userNumber?: string;
  firstName: string;
  lastName: string;
  email: string;
  contactNumber?: string;
  organizationId?: string | null;
  role?: string;
  permissions?: string[];
  accessOverrides?: {
    hiddenMenus?: string[];
  };
  dateOfBirth?: string;
  canBeInstructor?: boolean;
  canBeStudent?: boolean;
  canBePIC?: boolean;
  isErpIncerfaContact?: boolean;
  isErpAlerfaContact?: boolean;
  emergencyContact?: {
    name?: string;
    relationship?: string;
    phone?: string;
  };
  documents?: {
    name: string;
    url: string;
    uploadDate: string;
    expirationDate?: string | null;
  }[];
  department?: string;
  pilotLicense?: {
    licenseNumber?: string;
    issueDate?: string;
    expirationDate?: string;
    ratings?: string[];
    endorsements?: string[];
  };
  logbookTemplateId?: string;
};

interface EditPersonnelFormProps {
  tenantId: string;
  user: UserProfile;
  roles: Role[];
  departments: Department[];
  logbookTemplates: LogbookTemplate[];
  onCancel: () => void;
}

const userTypes: UserProfile['userType'][] = ["Student", "Private Pilot", "Personnel", "Instructor"];

const isPilotProfile = (user: Partial<UserProfile>): user is PilotProfile => {
    return user.userType === 'Student' || user.userType === 'Private Pilot' || user.userType === 'Instructor';
}

const determineCollection = (userType: UserProfile['userType']): string => {
    switch(userType) {
        case 'Personnel': return 'personnel';
        case 'Instructor': return 'instructors';
        case 'Student': return 'students';
        case 'Private Pilot': return 'private-pilots';
        default: return 'personnel'; 
    }
}

export function EditPersonnelForm({ tenantId, user, roles, departments, logbookTemplates, onCancel }: EditPersonnelFormProps) {
  const { toast } = useToast();
  
  const [organizations, setOrganizations] = useState<ExternalOrganization[]>([]);

  useEffect(() => {
      try {
          void fetch('/api/external-organizations', { cache: 'no-store' })
            .then((response) => parseJsonResponse<{ organizations?: ExternalOrganization[] }>(response))
            .then((payload) => setOrganizations(Array.isArray(payload?.organizations) ? payload.organizations : []))
            .catch(() => setOrganizations([]));
      } catch {
          // ignore
      }
  }, []);

  const [isContactOpen, setIsContactOpen] = useState(true);
  const [isPermissionsOpen, setIsPermissionsOpen] = useState(false);

  const [formData, setFormData] = useState<PersonnelFormState | null>(null);
  
  useEffect(() => {
    setFormData(JSON.parse(JSON.stringify(user)) as PersonnelFormState);
  }, [user]);
  
  const handleInputChange = <K extends keyof PersonnelFormState>(field: K, value: PersonnelFormState[K]) => {
    setFormData(prev => (prev ? { ...prev, [field]: value } : prev));
  };

  const handleNestedInputChange = <K extends keyof NonNullable<PersonnelFormState['pilotLicense']>>(
    field: 'pilotLicense',
    subField: K,
    value: NonNullable<PersonnelFormState['pilotLicense']>[K]
  ) => {
    setFormData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        [field]: {
          ...(prev[field] || {}),
          [subField]: value,
        },
      };
    });
  };

  const handleUpdateUser = async () => {
    if (!formData || !formData.userType || !formData.firstName?.trim() || !formData.lastName?.trim() || !formData.email?.trim()) {
        toast({ variant: 'destructive', title: 'Missing Fields' });
        return;
    }

    let dataToUpdate: Partial<PersonnelFormState> = { ...formData };
    if (!isPilotProfile(formData)) {
        delete dataToUpdate.pilotLicense;
        delete dataToUpdate.logbookTemplateId;
    } else {
        delete dataToUpdate.department;
    }

    try {
      const response = await fetch(`/api/personnel/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personnel: dataToUpdate }),
        });
      const payload = await parseJsonResponse<{ error?: string }>(response);
      if (!response.ok) throw new Error(payload?.error || 'Update failed');

      window.dispatchEvent(new Event('safeviate-profile-updated'));
      window.dispatchEvent(new Event('safeviate-personnel-updated'));
      window.dispatchEvent(new Event('safeviate-users-updated'));
      toast({ title: 'User Updated' });
      onCancel();
    } catch {
      toast({
        variant: 'destructive',
        title: 'Update Failed',
        description: 'The profile could not be saved. Please try again.',
      });
    }
  };
  
  const allPermissionIds = useMemo(() => 
    permissionsConfig.flatMap(resource => 
      resource.actions.map(action => `${resource.id}-${action}`)
    ),
  []);

  const areAllSelected = useMemo(() => {
    return allPermissionIds.length > 0 && (formData?.permissions || []).length === allPermissionIds.length
  }, [formData?.permissions, allPermissionIds]);

  const handlePermissionToggle = (permissionId: string, checked: boolean) => {
    if (!formData) return;
      const currentPermissions = formData.permissions || [];
      const role = roles.find((r) => r.id === formData.role);
    const rolePermissions = role?.permissions || [];
    const isRoleGranted = rolePermissions.includes(permissionId);

    if (!isRoleGranted) {
      toast({
        variant: 'destructive',
        title: 'Role Required',
        description: 'This permission must be included in the selected role before it can be overridden for the user.',
      });
      return;
    }

    const newPermissions = checked
      ? Array.from(new Set([...currentPermissions.filter((id) => id !== `!${permissionId}`), permissionId]))
      : currentPermissions.filter((id) => id !== permissionId).concat(`!${permissionId}`);
    handleInputChange('permissions', newPermissions);
  };

  const handleSelectAllToggle = () => {
    const role = formData ? roles.find((r) => r.id === formData.role) : null;
    const rolePermissions = role?.permissions || [];
    handleInputChange('permissions', areAllSelected ? [] : rolePermissions);
  };
  
  const handleRoleChange = (roleId: string) => {
    const role = roles.find(r => r.id === roleId);
    if (role) {
      const currentOverrides = (formData?.permissions || []).filter((permissionId) =>
        permissionId.startsWith('!') || (role.permissions || []).includes(permissionId)
      );
      setFormData(prev => prev ? ({
        ...prev,
        role: role.id,
        permissions: Array.from(new Set([...(role.permissions || []), ...currentOverrides]))
      }) : prev);
    }
  }

  return (
    <Card className="flex flex-col h-full overflow-hidden shadow-none border">
      <CardHeader className="shrink-0 border-b bg-muted/5">
        <CardTitle>Edit Profile</CardTitle>
        <CardDescription>Update details and granular permissions for {user.firstName} {user.lastName}.</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 p-0 overflow-hidden">
        <ScrollArea className="h-full">
            <div className="p-6 flex flex-col gap-6">
              <Collapsible open={isContactOpen} onOpenChange={setIsContactOpen}>
                <CollapsibleTrigger asChild>
                  <div className='flex items-center gap-2 mb-4 cursor-pointer'>
                    <h3 className="text-lg font-semibold font-headline">Contact & Role</h3>
                    <Button variant="ghost" size="sm" className="w-9 p-0"><ChevronsUpDown className="h-4 w-4" /></Button>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="space-y-2"><Label>User Type</Label><Select onValueChange={(value) => handleInputChange('userType', value as PersonnelFormState['userType'])} value={formData?.userType}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{userTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-2"><Label>User Number (Billing)</Label><Input value={formData?.userNumber || ''} onChange={(e) => handleInputChange('userNumber', e.target.value)} placeholder="e.g., ACC-001" /></div>
                  <div className="space-y-2"><Label>First Name</Label><Input value={formData?.firstName || ''} onChange={(e) => handleInputChange('firstName', e.target.value)} /></div>
                  <div className="space-y-2"><Label>Last Name</Label><Input value={formData?.lastName || ''} onChange={(e) => handleInputChange('lastName', e.target.value)} /></div>
                  <div className="space-y-2"><Label>Email</Label><Input type="email" value={formData?.email || ''} onChange={(e) => handleInputChange('email', e.target.value)} /></div>
                  <div className="space-y-2"><Label>Contact Number</Label><Input value={formData?.contactNumber || ''} onChange={(e) => handleInputChange('contactNumber', e.target.value)} /></div>
                  <div className="space-y-2"><Label>Role</Label><Select onValueChange={handleRoleChange} value={formData?.role}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{roles.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent></Select></div>
                  
                  <div className="space-y-2">
                      <Label>Organization</Label>
                      <Select onValueChange={(v) => handleInputChange('organizationId', v === 'internal' ? null : v)} value={formData?.organizationId || 'internal'}>
                          <SelectTrigger><SelectValue/></SelectTrigger>
                          <SelectContent>
                              <SelectItem value="internal">Safeviate (Internal)</SelectItem>
                              {(organizations || []).map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                          </SelectContent>
                      </Select>
                  </div>

                  <div className="flex items-center space-x-2 p-3 border rounded-lg bg-muted/10">
                    <Switch 
                      id="erp-incerfa" 
                      checked={!!formData?.isErpIncerfaContact} 
                      onCheckedChange={(val) => handleInputChange('isErpIncerfaContact', val)} 
                    />
                    <Label htmlFor="erp-incerfa" className="cursor-pointer text-xs">ERP INCERFA Contact</Label>
                  </div>

                  <div className="flex items-center space-x-2 p-3 border rounded-lg bg-muted/10">
                    <Switch 
                      id="erp-alerfa" 
                      checked={!!formData?.isErpAlerfaContact} 
                      onCheckedChange={(val) => handleInputChange('isErpAlerfaContact', val)} 
                    />
                    <Label htmlFor="erp-alerfa" className="cursor-pointer text-xs">ERP ALERFA Contact</Label>
                  </div>

                  <div className="flex items-center space-x-2 p-3 border rounded-lg bg-muted/10">
                    <Switch
                      id="booking-instructor"
                      checked={!!formData?.canBeInstructor}
                      onCheckedChange={(val) => handleInputChange('canBeInstructor', val)}
                    />
                    <Label htmlFor="booking-instructor" className="cursor-pointer text-xs">Assignable as Instructor</Label>
                  </div>

                    <div className="flex items-center space-x-2 p-3 border rounded-lg bg-muted/10">
                      <Switch
                        id="booking-student"
                        checked={!!formData?.canBeStudent}
                        onCheckedChange={(val) => handleInputChange('canBeStudent', val)}
                      />
                      <Label htmlFor="booking-student" className="cursor-pointer text-xs">Assignable as Student</Label>
                    </div>

                    <div className="flex items-center space-x-2 p-3 border rounded-lg bg-muted/10">
                      <Switch
                        id="booking-pic"
                        checked={!!formData?.canBePIC}
                        onCheckedChange={(val) => handleInputChange('canBePIC', val)}
                      />
                      <Label htmlFor="booking-pic" className="cursor-pointer text-xs">Assignable as PIC</Label>
                    </div>

                    {formData && !isPilotProfile(formData) && (
                      <div className="space-y-2">
                          <Label>Department</Label>
                          <Select onValueChange={(value) => handleInputChange('department', value)} value={formData.department}>
                              <SelectTrigger><SelectValue/></SelectTrigger>
                              <SelectContent>{departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                          </Select>
                      </div>
                  )}
                  {formData && isPilotProfile(formData) && (
                    <>
                      <div className="space-y-2"><Label>License Number</Label><Input value={formData.pilotLicense?.licenseNumber || ''} onChange={(e) => handleNestedInputChange('pilotLicense', 'licenseNumber', e.target.value)} /></div>
                      <div className="space-y-2"><Label>Logbook Template</Label><Select onValueChange={(value) => handleInputChange('logbookTemplateId', value)} value={formData.logbookTemplateId}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{logbookTemplates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select></div>
                    </>
                  )}
                </CollapsibleContent>
              </Collapsible>

              <Separator />

              <Collapsible open={isPermissionsOpen} onOpenChange={setIsPermissionsOpen}>
                  <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                          <h3 className="text-lg font-semibold font-headline">Permissions</h3>
                          <CollapsibleTrigger asChild><Button variant="ghost" size="sm" className="w-9 p-0"><ChevronsUpDown className="h-4 w-4" /></Button></CollapsibleTrigger>
                      </div>
                      <Button variant="link" onClick={handleSelectAllToggle} className="p-0 h-auto">{areAllSelected ? 'Deselect All' : 'Select All'}</Button>
                  </div>
                  <CollapsibleContent>
                      <ScrollArea className="h-72 w-full rounded-md border mt-2">
                          <div className="p-4">
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4">
                                  {permissionsConfig.map((resource) => (
                                      <div key={resource.id} className='space-y-2 break-inside-avoid'>
                                          <h4 className='font-medium border-b pb-1'>{resource.name}</h4>
                                          <div className="flex flex-col gap-2 pt-1">
                                          {resource.actions.map((action) => {
                                                  const permissionId = `${resource.id}-${action}`;
                                                  const role = formData ? roles.find((r) => r.id === formData.role) : null;
                                                  const isRoleGranted = !!role?.permissions?.includes(permissionId);
                                                  const isUserGranted = !!(formData?.permissions || []).includes(permissionId);
                                                  const isDenied = !!(formData?.permissions || []).includes(`!${permissionId}`);
                                                  return (
                                                      <div key={permissionId} className="flex items-center space-x-2">
                                                          <Checkbox
                                                            id={`edit-${permissionId}`}
                                                            checked={(isRoleGranted && !isDenied) || isUserGranted}
                                                            disabled={!isRoleGranted}
                                                            onCheckedChange={(checked) => handlePermissionToggle(permissionId, !!checked)}
                                                          />
                                                          <label htmlFor={`edit-${permissionId}`} className="text-sm font-medium leading-none cursor-pointer capitalize">{action}</label>
                                                      </div>
                                                  );
                                              })}
                                          </div>
                                      </div>
                                  ))}
                              </div>
                          </div>
                      </ScrollArea>
                  </CollapsibleContent>
              </Collapsible>
            </div>
        </ScrollArea>
      </CardContent>
      <CardFooter className="shrink-0 border-t pt-6 flex justify-end gap-2 bg-muted/5">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={handleUpdateUser}>Save Changes</Button>
      </CardFooter>
    </Card>
  );
}
