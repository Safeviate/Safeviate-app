'use client';

import { useState, useEffect } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PlusCircle, Phone, Mail, Trash2, Pencil } from 'lucide-react';
import type { ERPContact, ERPContactCategory } from '@/types/erp';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/use-permissions';
import { DeleteActionButton } from '@/components/record-action-buttons';
import { HEADER_ACTION_BUTTON_CLASS, HEADER_SECONDARY_BUTTON_CLASS } from '@/components/page-header';

interface ContactsTabProps {
  tenantId: string;
}

const CATEGORIES: ERPContactCategory[] = ['Internal', 'Aviation Authorities', 'Emergency Services', 'External Partners'];

export function ContactsTab({ tenantId }: ContactsTabProps) {
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<ERPContact | null>(null);
  const [contacts, setContacts] = useState<ERPContact[]>([]);

  useEffect(() => {
    const loadContacts = async () => {
      try {
        const response = await fetch('/api/erp-state?category=contacts', { cache: 'no-store' });
        if (!response.ok) return;
        const payload = await response.json();
        const parsed = (payload.data || []) as ERPContact[];
        setContacts(parsed.sort((a, b) => a.priority - b.priority));
      } catch {
        // ignore load errors
      }
    };
    loadContacts();
  }, []);

  const persistContacts = async (nextContacts: ERPContact[]) => {
    setContacts(nextContacts);
    await fetch('/api/erp-state', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        category: 'contacts',
        data: nextContacts,
      }),
    }).catch(() => null);
  };

  const canAdmin = hasPermission('operations-erp-admin');

  const handleOpenDialog = (contact: ERPContact | null = null) => {
    setEditingContact(contact);
    setIsDialogOpen(true);
  };

  const handleSaveContact = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canAdmin) return;

    const formData = new FormData(e.currentTarget);
    const formPriority = parseInt(formData.get('priority') as string) || 1;
    
    if (editingContact) {
      const contactData: ERPContact = {
        ...editingContact,
        name: formData.get('name') as string,
        role: formData.get('role') as string,
        organization: formData.get('organization') as string,
        phone: formData.get('phone') as string,
        email: formData.get('email') as string,
        priority: formPriority,
        category: formData.get('category') as ERPContactCategory,
      };
      
      const nextContacts = contacts.map(c => c.id === editingContact.id ? contactData : c);
      void persistContacts(nextContacts.sort((a, b) => a.priority - b.priority));
      toast({ title: 'Contact Updated' });
    } else {
      const contactData: ERPContact = {
        id: crypto.randomUUID(),
        name: formData.get('name') as string,
        role: formData.get('role') as string,
        organization: formData.get('organization') as string,
        phone: formData.get('phone') as string,
        email: formData.get('email') as string,
        priority: formPriority,
        category: formData.get('category') as ERPContactCategory,
      };

      const nextContacts = [...contacts, contactData];
      void persistContacts(nextContacts.sort((a, b) => a.priority - b.priority));
      toast({ title: 'Contact Added' });
    }

    setIsDialogOpen(false);
    setEditingContact(null);
  };

  const handleDelete = async (id: string) => {
    if (!canAdmin) return;
    const nextContacts = contacts.filter(c => c.id !== id);
    void persistContacts(nextContacts);
    toast({ title: 'Contact Deleted' });
  };

  return (
    <div className="space-y-6">
      <div className="border-b px-6 py-6">
        <h2 className="font-headline text-2xl font-semibold">Emergency Contacts</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Priority contact details for internal responders, authorities, and external support.
        </p>
      </div>

      <div className="flex justify-end px-6">
        {canAdmin && (
          <Dialog open={isDialogOpen} onOpenChange={(open) => { if (!open) setEditingContact(null); setIsDialogOpen(open); }}>
              <DialogTrigger asChild>
                <Button onClick={() => handleOpenDialog()} className={HEADER_ACTION_BUTTON_CLASS}><PlusCircle className="mr-2 h-4 w-4" /> Add Emergency Contact</Button>
              </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingContact ? 'Edit' : 'New'} Emergency Contact</DialogTitle>
                <DialogDescription>
                  Add or update a priority emergency contact for ERP response use.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSaveContact} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input name="name" defaultValue={editingContact?.name} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Role</Label>
                    <Input name="role" defaultValue={editingContact?.role} required />
                  </div>
                  <div className="space-y-2 col-span-2">
                    <Label>Organization</Label>
                    <Input name="organization" defaultValue={editingContact?.organization} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Phone</Label>
                    <Input name="phone" defaultValue={editingContact?.phone} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input name="email" type="email" defaultValue={editingContact?.email} />
                  </div>
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select name="category" defaultValue={editingContact?.category || 'Internal'}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Priority (1-10)</Label>
                    <Input name="priority" type="number" defaultValue={editingContact?.priority || 1} />
                  </div>
                </div>
                <DialogFooter>
                  <DialogClose asChild><Button variant="outline" className={HEADER_SECONDARY_BUTTON_CLASS}>Cancel</Button></DialogClose>
                  <Button type="submit" className={HEADER_ACTION_BUTTON_CLASS}>Save Contact</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <section className="overflow-hidden border-y border-card-border">
        <div className="border-b px-6 py-5">
          <h4 className="font-headline text-lg font-semibold">Emergency Call List</h4>
        </div>
        <div className="p-0">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Organization</TableHead>
                <TableHead>Numbers</TableHead>
                {canAdmin && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(contacts || []).map(contact => (
                <TableRow key={contact.id}>
                  <TableCell className="font-bold text-muted-foreground">{contact.priority}</TableCell>
                  <TableCell><Badge variant="outline">{contact.category}</Badge></TableCell>
                  <TableCell className="min-w-0">
                    <div className="min-w-0">
                      <p className="truncate font-bold text-sm" title={contact.name}>{contact.name}</p>
                      <p className="truncate text-[10px] text-muted-foreground uppercase font-medium" title={contact.role}>{contact.role}</p>
                    </div>
                  </TableCell>
                  <TableCell className="min-w-0 text-sm">
                    <p className="truncate" title={contact.organization}>{contact.organization}</p>
                  </TableCell>
                  <TableCell className="min-w-0">
                    <div className="flex min-w-0 flex-col gap-1">
                      <a href={`tel:${contact.phone}`} className="flex min-w-0 items-center gap-1 text-[11px] font-medium hover:text-primary">
                        <Phone className="h-2.5 w-2.5 shrink-0" />
                        <span className="min-w-0 truncate" title={contact.phone}>{contact.phone}</span>
                      </a>
                      {contact.email && (
                        <a href={`mailto:${contact.email}`} className="flex min-w-0 items-center gap-1 text-[11px] font-medium hover:text-primary">
                          <Mail className="h-2.5 w-2.5 shrink-0" />
                          <span className="min-w-0 truncate" title={contact.email}>{contact.email}</span>
                        </a>
                      )}
                    </div>
                  </TableCell>
                  {canAdmin && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleOpenDialog(contact)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <DeleteActionButton
                          description={`This will permanently delete the ERP contact "${contact.name}".`}
                          onDelete={() => handleDelete(contact.id)}
                          srLabel="Delete contact"
                        />
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {(!contacts || contacts.length === 0) && (
                <TableRow><TableCell colSpan={canAdmin ? 6 : 5} className="h-24 text-center text-muted-foreground italic">No contacts registered.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
