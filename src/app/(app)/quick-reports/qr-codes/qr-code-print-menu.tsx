'use client';

import { Building2, ChevronDown, FileWarning, Printer, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type PrintTarget = 'safety' | 'technical' | 'facility' | 'all';

const printOptions: Array<{ value: PrintTarget; label: string; icon: typeof ShieldAlert }> = [
  { value: 'safety', label: 'Safety Report QR Code', icon: ShieldAlert },
  { value: 'technical', label: 'Technical Report QR Code', icon: FileWarning },
  { value: 'facility', label: 'Facility Report QR Codes', icon: Building2 },
  { value: 'all', label: 'All QR Codes', icon: Printer },
];

export function QrCodePrintMenu({ technicalReportingEnabled = true }: { technicalReportingEnabled?: boolean }) {
  const handlePrint = (target: PrintTarget) => {
    document.documentElement.dataset.qrPrintTarget = target;

    const resetPrintTarget = () => {
      delete document.documentElement.dataset.qrPrintTarget;
      window.removeEventListener('afterprint', resetPrintTarget);
    };

    window.addEventListener('afterprint', resetPrintTarget, { once: true });
    window.print();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" className="print:hidden">
          <Printer className="mr-2 h-4 w-4" />
          Print QR Codes
          <ChevronDown className="ml-2 h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        {printOptions.filter((option) => technicalReportingEnabled || option.value !== 'technical').map((option) => {
          const Icon = option.icon;
          return (
            <DropdownMenuItem key={option.value} onSelect={() => handlePrint(option.value)}>
              <Icon className="h-4 w-4" />
              {option.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
