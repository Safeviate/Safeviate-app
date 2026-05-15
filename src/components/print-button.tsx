'use client';

import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';

type PrintButtonProps = {
  label?: string;
  className?: string;
};

export function PrintButton({ label = 'Print', className }: PrintButtonProps) {
  return (
    <Button type="button" variant="outline" className={className} onClick={() => window.print()}>
      <Printer className="mr-2 h-4 w-4" />
      {label}
    </Button>
  );
}
