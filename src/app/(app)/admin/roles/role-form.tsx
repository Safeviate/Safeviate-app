'use client';

import { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ChevronsUpDown, PlusCircle, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { permissionsConfig } from '@/lib/permissions-config';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { usePermissions } from '@/hooks/use-permissions';
import { useIsMobile } from '@/hooks/use-mobile';
import { menuConfig } from '@/lib/menu-config';
import { PAGE_FORMAT_MOBILE_DARK_BUTTON_CLASS } from '@/lib/page-format-buttons';
import type { Role } from './page';

interface RoleFormProps {
  tenantId: string;
  existingRole?: {
    id: string;
    name: string;
    permissions: string[];
    accessOverrides?: {
      hiddenMenus?: string[];
    };
    requiredDocuments?: string[];
  };
  trigger?: React.ReactNode;
}

export function RoleForm({ tenantId, existingRole, trigger }: RoleFormProps) {
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const isMobile = useIsMobile();
  const [roleName, setRoleName] = useState(existingRole?.name || '');
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>(existingRole?.permissions || []);
  const [hiddenMenus, setHiddenMenus] = useState<string[]>(existingRole?.accessOverrides?.hiddenMenus || []);
  const [isOpen, setIsOpen] = useState(false);
  const [isPermissionsOpen, setIsPermissionsOpen] = useState(false);
  const [isModulesOpen, setIsModulesOpen] = useState(false);

  // Required Documents state
  const [requiredDocuments, setRequiredDocuments] = useState<string[]>(existingRole?.requiredDocuments || []);
  const [currentDocument, setCurrentDocument] = useState('');

  const canManagePermissions = hasPermission('admin-permissions-manage');

  useEffect(() => {
    if (isOpen) {
      setRoleName(existingRole?.name || '');
      setSelectedPermissions(existingRole?.permissions || []);
      setHiddenMenus(existingRole?.accessOverrides?.hiddenMenus || []);
      setRequiredDocuments(existingRole?.requiredDocuments || []);
    }
  }, [isOpen, existingRole]);

  const allPermissionIds = useMemo(() => 
    permissionsConfig.flatMap(resource => 
      resource.actions.map(action => `${resource.id}-${action}`)
    ),
  []);

  const areAllSelected = useMemo(() => 
    allPermissionIds.length > 0 && selectedPermissions.length === allPermissionIds.length,
    [selectedPermissions, allPermissionIds]
  );
  
  const resetForm = () => {
    if (!existingRole) {
      setRoleName('');
      setSelectedPermissions([]);
      setRequiredDocuments([]);
    }
    setCurrentDocument('');
  }

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      resetForm();
    }
  }

  const handleSaveRole = async () => {
    if (!roleName.trim()) {
      toast({
        variant: 'destructive',
        title: 'Missing Field',
        description: 'Please enter a role name.',
      });
      return;
    }

    const roleData: Role = {
        id: existingRole?.id || crypto.randomUUID(),
        name: roleName,
        permissions: selectedPermissions,
        accessOverrides: { hiddenMenus },
        requiredDocuments,
    };

    try {
        const response = await fetch('/api/roles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(roleData),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(result.error || 'Failed to save role.');
        }

        window.dispatchEvent(new Event('safeviate-roles-updated'));

        toast({
          title: existingRole ? 'Role Updated' : 'Role Added',
          description: `The "${roleName}" role has been saved.`,
        });
        setIsOpen(false);
    } catch (e) {
        toast({
          variant: 'destructive',
          title: 'Save Failed',
          description: 'The role could not be saved. Please try again.',
        });
    }
  };

  const handlePermissionToggle = (permissionId: string, checked: boolean) => {
    setSelectedPermissions((prev) =>
      checked ? [...prev, permissionId] : prev.filter((id) => id !== permissionId)
    );
  };
  
  const handleSelectAllToggle = () => {
    if (areAllSelected) {
      setSelectedPermissions([]);
    } else {
      setSelectedPermissions(allPermissionIds);
    }
  };

  const handleAddDocument = () => {
    if (currentDocument.trim() && !requiredDocuments.includes(currentDocument.trim())) {
      setRequiredDocuments([...requiredDocuments, currentDocument.trim()]);
      setCurrentDocument('');
    }
  };

  const handleRemoveDocument = (docToRemove: string) => {
    setRequiredDocuments(requiredDocuments.filter(doc => doc !== docToRemove));
  };

  const handleModuleToggle = (href: string, hidden: boolean, subHrefs?: string[]) => {
    setHiddenMenus((prev) => {
      if (hidden) {
        return Array.from(new Set([...prev, href, ...(subHrefs || [])]));
      }
      const toShow = [href, ...(subHrefs || [])];
      return prev.filter((menuHref) => !toShow.includes(menuHref));
    });
  };


  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      {trigger ? (
        <DialogTrigger asChild>
          {trigger}
        </DialogTrigger>
      ) : (
        <DialogTrigger asChild>
          <Button
            variant={isMobile ? 'outline' : 'default'}
            size={isMobile ? 'sm' : 'default'}
            className={isMobile ? PAGE_FORMAT_MOBILE_DARK_BUTTON_CLASS : undefined}
          >
            <span className="flex items-center gap-2">
              <PlusCircle className={isMobile ? 'h-3.5 w-3.5' : 'mr-2 h-4 w-4'} />
              Add Role
            </span>
            {isMobile ? <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" /> : null}
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{existingRole ? 'Edit Role' : 'Add New Role'}</DialogTitle>
          <DialogDescription>
            {existingRole ? 'Update the details and permissions for this role.' : 'Define a new role, assign permissions, and specify required documents.'}
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className='max-h-[70vh] pr-6'>
            <div className="flex flex-col gap-6 py-4">
                <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="name">Role Name</Label>
                        <Input
                            id="name"
                            value={roleName}
                            onChange={(e) => setRoleName(e.target.value)}
                            placeholder="e.g., Chief Pilot"
                        />
                    </div>
                </div>

                <Separator />

                <div className='space-y-2'>
                    <h4 className="text-md font-medium">Required Documents</h4>
                    <div className="flex items-center gap-2">
                        <Input 
                            value={currentDocument}
                            onChange={(e) => setCurrentDocument(e.target.value)}
                            placeholder="e.g., Pilot's License"
                            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddDocument())}
                        />
                        <Button onClick={handleAddDocument} type='button'>Add</Button>
                    </div>
                     <div className="space-y-2 pt-2">
                        {requiredDocuments.map(doc => (
                            <div key={doc} className='flex items-center justify-between gap-2'>
                                <Badge variant='secondary'>{doc}</Badge>
                                <Button size='icon' variant='ghost' className='h-6 w-6' onClick={() => handleRemoveDocument(doc)}>
                                    <Trash2 className='h-4 w-4 text-destructive' />
                                </Button>
                            </div>
                        ))}
                    </div>
                </div>

                <Separator />

                <Collapsible open={isPermissionsOpen} onOpenChange={setIsPermissionsOpen} className='space-y-2'>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <h4 className="text-md font-medium">Permissions</h4>
                            <CollapsibleTrigger asChild>
                                <Button variant="ghost" size="sm" className="w-9 p-0">
                                    <ChevronsUpDown className="h-4 w-4" />
                                    <span className="sr-only">Toggle</span>
                                </Button>
                            </CollapsibleTrigger>
                        </div>
                        {canManagePermissions && (
                            <Button variant="link" onClick={handleSelectAllToggle} className="p-0 h-auto">
                                {areAllSelected ? 'Deselect All' : 'Select All'}
                            </Button>
                        )}
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
                                            return (
                                                <div
                                                    key={permissionId}
                                                    className="flex items-center space-x-2"
                                                >
                                                    <Checkbox
                                                        id={`role-${existingRole?.id || 'new'}-${permissionId}`}
                                                        checked={selectedPermissions.includes(permissionId)}
                                                        onCheckedChange={(checked) => handlePermissionToggle(permissionId, !!checked)}
                                                        disabled={!canManagePermissions}
                                                    />
                                                    <label
                                                        htmlFor={`role-${existingRole?.id || 'new'}-${permissionId}`}
                                                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer capitalize"
                                                    >
                                                        {action}
                                                    </label>
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

                <Separator />

                <Collapsible open={isModulesOpen} onOpenChange={setIsModulesOpen} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h4 className="text-md font-medium">Module Access</h4>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="w-9 p-0">
                          <ChevronsUpDown className="h-4 w-4" />
                          <span className="sr-only">Toggle</span>
                        </Button>
                      </CollapsibleTrigger>
                    </div>
                  </div>
                  <CollapsibleContent>
                    <ScrollArea className="h-72 w-full rounded-md border mt-2">
                      <div className="p-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                          {menuConfig.map((menu) => {
                            const subHrefs = menu.subItems?.map((s) => s.href) || [];
                            return (
                              <div key={menu.href} className="space-y-3 rounded-xl border bg-muted/10 p-4">
                                <div className="flex items-center gap-2">
                                  <Checkbox
                                    id={`role-mod-${existingRole?.id || 'new'}-${menu.href}`}
                                    checked={!hiddenMenus.includes(menu.href)}
                                    onCheckedChange={(val) => handleModuleToggle(menu.href, !val, subHrefs)}
                                  />
                                  <Label htmlFor={`role-mod-${existingRole?.id || 'new'}-${menu.href}`} className="cursor-pointer text-[11px] font-black uppercase">
                                    {menu.label}
                                  </Label>
                                </div>
                                {menu.subItems && (
                                  <div className="pl-6 space-y-2 border-l">
                                    {menu.subItems.map((sub) => (
                                      <div key={sub.href} className="flex items-center gap-2">
                                        <Checkbox
                                          id={`role-submod-${existingRole?.id || 'new'}-${sub.href}`}
                                          checked={!hiddenMenus.includes(sub.href)}
                                          onCheckedChange={(val) => handleModuleToggle(sub.href, !val)}
                                        />
                                        <Label htmlFor={`role-submod-${existingRole?.id || 'new'}-${sub.href}`} className="cursor-pointer text-[10px] font-bold uppercase text-muted-foreground">
                                          {sub.label}
                                        </Label>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </ScrollArea>
                  </CollapsibleContent>
                </Collapsible>
            </div>
        </ScrollArea>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={handleSaveRole}>{existingRole ? 'Save Changes' : 'Save Role'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
