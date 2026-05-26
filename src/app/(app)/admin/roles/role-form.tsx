'use client';

import { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { getPermissionDisplayLabel } from '@/lib/permission-display';
import { normalizePermissionIds } from '@/lib/permission-model';
import { getPermissionSections } from '@/lib/permission-sections';
import type { Role } from './page';

type MenuSection = {
  title: string;
  items: typeof menuConfig;
};

const MENU_SECTION_DEFINITIONS: Array<{ title: string; menuLabels: string[] }> = [
  { title: 'Core', menuLabels: ['Company Dashboard', 'My Dashboard'] },
  { title: 'Bookings', menuLabels: ['Bookings'] },
  { title: 'Operations', menuLabels: ['Operations', 'Quick Reports'] },
  { title: 'Safety', menuLabels: ['Safety'] },
  { title: 'Quality', menuLabels: ['Quality'] },
  { title: 'Training', menuLabels: ['Training'] },
  { title: 'Assets', menuLabels: ['Assets'] },
  { title: 'Maintenance', menuLabels: ['Maintenance'] },
  { title: 'Users', menuLabels: ['Users'] },
  { title: 'Admin', menuLabels: ['Admin'] },
  { title: 'Development', menuLabels: ['Development'] },
];

const getMenuSections = (): MenuSection[] => {
  const seen = new Set<string>();
  const sections: MenuSection[] = [];

  MENU_SECTION_DEFINITIONS.forEach((section) => {
    const items = menuConfig.filter((menu) => section.menuLabels.includes(menu.label));
    if (items.length > 0) {
      items.forEach((menu) => seen.add(menu.href));
      sections.push({ title: section.title, items });
    }
  });

  const leftovers = menuConfig.filter((menu) => !seen.has(menu.href));
  if (leftovers.length > 0) {
    sections.push({ title: 'Other', items: leftovers });
  }

  return sections;
};

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
  const permissionSections = useMemo(() => getPermissionSections(permissionsConfig), []);
  const menuSections = useMemo(() => getMenuSections(), []);
  const visiblePermissionIds = useMemo(() => {
    return permissionSections.flatMap((section) =>
      section.resources.flatMap((resource) =>
        resource.actions.map((action) => `${resource.id}-${action}`)
      )
    );
  }, [permissionSections]);

  const canManagePermissions = hasPermission('admin-permissions-manage');

  useEffect(() => {
    if (isOpen) {
      setRoleName(existingRole?.name || '');
      setSelectedPermissions(normalizePermissionIds(existingRole?.permissions || []));
      setHiddenMenus(existingRole?.accessOverrides?.hiddenMenus || []);
      setRequiredDocuments(existingRole?.requiredDocuments || []);
    }
  }, [isOpen, existingRole]);

  const allPermissionIds = useMemo(() => visiblePermissionIds, [visiblePermissionIds]);

  const areAllSelected = useMemo(() => 
    allPermissionIds.length > 0 && allPermissionIds.every((permissionId) => selectedPermissions.includes(permissionId)),
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
      setSelectedPermissions((prev) => prev.filter((permissionId) => !visiblePermissionIds.includes(permissionId)));
    } else {
      setSelectedPermissions((prev) => Array.from(new Set([...prev, ...allPermissionIds])));
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
                                <div className="space-y-6">
                                {permissionSections.map((section) => (
                                    <section key={section.title} className="space-y-3">
                                        <div className="flex items-center justify-between gap-3 px-1">
                                          <h4 className="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground">{section.title}</h4>
                                          <Badge variant="outline" className="h-5 rounded-full px-2 text-[8px] font-black uppercase">
                                            {section.resources.length} modules
                                          </Badge>
                                        </div>
                                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                                        {section.resources.map((resource) => (
                                            <Card key={resource.id} className="overflow-hidden border shadow-none">
                                              <CardHeader className="border-b bg-muted/20 px-4 py-3">
                                                <div className="flex items-start justify-between gap-3">
                                                  <div className="min-w-0 space-y-1">
                                                    <CardTitle className="truncate text-sm font-black uppercase tracking-[-0.01em] text-foreground">
                                                      {resource.name}
                                                    </CardTitle>
                                                    <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                                                      Permission group
                                                    </p>
                                                  </div>
                                                  <Badge variant="secondary" className="h-6 rounded-full px-2 text-[9px] font-black uppercase">
                                                    {resource.actions.length} actions
                                                  </Badge>
                                                </div>
                                              </CardHeader>
                                              <CardContent className="space-y-3 px-4 py-4">
                                                <div className="flex flex-wrap gap-2">
                                                  {resource.actions.map((action) => {
                                                    const permissionId = `${resource.id}-${action}`;
                                                    return (
                                                      <Badge
                                                        key={permissionId}
                                                        variant="outline"
                                                        className="rounded-full border-slate-300 px-3 py-1 text-[10px] font-black uppercase"
                                                      >
                                                        {getPermissionDisplayLabel(action)}
                                                      </Badge>
                                                    );
                                                  })}
                                                </div>
                                                <div className="space-y-1 rounded-2xl border bg-muted/10 px-3 py-3">
                                                  {resource.actions.map((action) => {
                                                    const permissionId = `${resource.id}-${action}`;
                                                    return (
                                                      <div key={permissionId} className="flex items-center justify-between gap-3 text-[11px]">
                                                        <div className="flex items-center gap-2">
                                                          <Checkbox
                                                            id={`role-${existingRole?.id || 'new'}-${permissionId}`}
                                                            checked={selectedPermissions.includes(permissionId)}
                                                            onCheckedChange={(checked) => handlePermissionToggle(permissionId, !!checked)}
                                                            disabled={!canManagePermissions}
                                                          />
                                                          <label
                                                            htmlFor={`role-${existingRole?.id || 'new'}-${permissionId}`}
                                                            className="cursor-pointer font-semibold leading-none text-foreground"
                                                          >
                                                            {getPermissionDisplayLabel(action)}
                                                          </label>
                                                        </div>
                                                        <span className="truncate font-mono text-[10px] text-muted-foreground">
                                                          {permissionId}
                                                        </span>
                                                      </div>
                                                    );
                                                  })}
                                                </div>
                                              </CardContent>
                                            </Card>
                                        ))}
                                </div>
                                    </section>
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
                        <div className="space-y-6">
                          {menuSections.map((section) => (
                            <section key={section.title} className="space-y-3">
                              <div className="flex items-center justify-between gap-3 px-1">
                                <h4 className="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground">{section.title}</h4>
                                <Badge variant="outline" className="h-5 rounded-full px-2 text-[8px] font-black uppercase">
                                  {section.items.length} menus
                                </Badge>
                              </div>
                              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                                {section.items.map((menu) => {
                                  const subHrefs = menu.subItems?.map((s) => s.href) || [];
                                  return (
                                    <Card key={menu.href} className="overflow-hidden border shadow-none">
                                      <CardHeader className="border-b bg-muted/20 px-4 py-3">
                                        <div className="flex items-start justify-between gap-3">
                                          <div className="min-w-0 space-y-1">
                                            <CardTitle className="truncate text-sm font-black uppercase tracking-[-0.01em] text-foreground">
                                              {menu.label}
                                            </CardTitle>
                                            <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                                              {menu.subItems?.length || 0} linked pages
                                            </p>
                                          </div>
                                          <Checkbox
                                            id={`role-mod-${existingRole?.id || 'new'}-${menu.href}`}
                                            checked={!hiddenMenus.includes(menu.href)}
                                            onCheckedChange={(val) => handleModuleToggle(menu.href, !val, subHrefs)}
                                          />
                                        </div>
                                      </CardHeader>
                                      <CardContent className="space-y-3 px-4 py-4">
                                        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                                          <menu.icon className="h-4 w-4 text-primary opacity-70" />
                                          <span>Module enabled in the sidebar</span>
                                        </div>
                                        {menu.subItems && (
                                          <div className="space-y-2 rounded-lg border bg-muted/10 p-3">
                                            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-muted-foreground">Sub Pages</p>
                                            <div className="space-y-2 pt-2">
                                              {menu.subItems.map((sub) => (
                                                <div key={sub.href} className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2">
                                                  <div className="min-w-0">
                                                    <Label htmlFor={`role-submod-${existingRole?.id || 'new'}-${sub.href}`} className="cursor-pointer text-[11px] font-bold uppercase text-foreground">
                                                      {sub.label}
                                                    </Label>
                                                  </div>
                                                  <Checkbox
                                                    id={`role-submod-${existingRole?.id || 'new'}-${sub.href}`}
                                                    checked={!hiddenMenus.includes(sub.href)}
                                                    onCheckedChange={(val) => handleModuleToggle(sub.href, !val)}
                                                  />
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                      </CardContent>
                                    </Card>
                                  );
                                })}
                              </div>
                            </section>
                          ))}
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
