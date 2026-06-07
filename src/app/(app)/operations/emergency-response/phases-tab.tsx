
'use client';

import { Badge } from '@/components/ui/badge';
import { Clock, Info, ShieldAlert } from 'lucide-react';

export function PhasesTab() {
  return (
    <div className="space-y-6">
      <div className="border-b px-6 py-6">
        <h2 className="font-headline text-2xl font-semibold">Emergency Phases Guide</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Standardized ICAO terminology used for Search and Rescue notification and escalation.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <section className="border border-card-border border-l-4 border-l-blue-500 px-6 py-6">
          <div className="pb-2">
            <div className="flex items-start gap-3">
              <h4 className="flex min-w-0 flex-1 items-center gap-2 text-2xl font-semibold text-blue-700">
                <Info className="h-5 w-5" /> INCERFA (Uncertainty Phase)
              </h4>
              <Badge variant="outline" className="border-blue-200 text-blue-700 bg-blue-50">Phase 1</Badge>
            </div>
            <p className="font-medium text-blue-900/70">
              Uncertainty exists as to the safety of an aircraft and its occupants.
            </p>
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Activation Criteria</p>
              <ul className="text-sm space-y-1.5 list-disc pl-5 text-muted-foreground">
                <li>No communication has been received from an aircraft within a period of 30 minutes after the time a communication should have been received.</li>
                <li>An aircraft fails to arrive within 30 minutes of the estimated time of arrival last notified to or estimated by air traffic services units.</li>
              </ul>
            </div>
            <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
              <p className="text-xs font-bold text-blue-800 uppercase mb-1">Standard Action</p>
              <p className="text-xs text-blue-700 leading-relaxed">
                Initiate communication search. Verify flight plan details. Contact alternate airfields and known frequencies.
              </p>
            </div>
          </div>
        </section>

        <section className="border border-card-border border-l-4 border-l-amber-500 px-6 py-6">
          <div className="pb-2">
            <div className="flex items-start gap-3">
              <h4 className="flex min-w-0 flex-1 items-center gap-2 text-2xl font-semibold text-amber-700">
                <Clock className="h-5 w-5" /> ALERFA (Alert Phase)
              </h4>
              <Badge variant="outline" className="border-amber-200 text-amber-700 bg-amber-50">Phase 2</Badge>
            </div>
            <p className="font-medium text-amber-900/70">
              Apprehension exists as to the safety of an aircraft and its occupants.
            </p>
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Activation Criteria</p>
              <ul className="text-sm space-y-1.5 list-disc pl-5 text-muted-foreground">
                <li>Following the uncertainty phase, subsequent attempts to establish communication or inquiries to other relevant sources have failed to reveal any news of the aircraft.</li>
                <li>An aircraft has been cleared to land and fails to land within five minutes of the estimated time of landing and communication has not been re-established.</li>
                <li>Information is received which indicates that the operating efficiency of the aircraft has been impaired, but not to the extent that a forced landing is likely.</li>
              </ul>
            </div>
            <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
              <p className="text-xs font-bold text-amber-800 uppercase mb-1">Standard Action</p>
              <p className="text-xs text-amber-700 leading-relaxed">
                Notify Search and Rescue Coordination Center (RCC). Prepare ground support. Alert internal management and staff.
              </p>
            </div>
          </div>
        </section>

        <section className="border border-card-border border-l-4 border-l-red-500 px-6 py-6">
          <div className="pb-2">
            <div className="flex items-start gap-3">
              <h4 className="flex min-w-0 flex-1 items-center gap-2 text-2xl font-semibold text-red-700">
                <ShieldAlert className="h-5 w-5" /> DETRESFA (Distress Phase)
              </h4>
              <Badge variant="outline" className="border-red-200 text-red-700 bg-red-50">Phase 3</Badge>
            </div>
            <p className="font-medium text-red-900/70">
              Reasonable certainty exists that an aircraft and its occupants are threatened by grave and imminent danger and require immediate assistance.
            </p>
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Activation Criteria</p>
              <ul className="text-sm space-y-1.5 list-disc pl-5 text-muted-foreground">
                <li>Following the alert phase, further unsuccessful attempts to establish communication and more widespread unsuccessful inquiries point to the probability that the aircraft is in distress.</li>
                <li>The fuel on board is considered to be exhausted, or to be insufficient to enable the aircraft to reach safety.</li>
                <li>Information is received which indicates that a forced landing is likely or has been made.</li>
              </ul>
            </div>
            <div className="p-3 bg-red-50 rounded-lg border border-red-100">
              <p className="text-xs font-bold text-red-800 uppercase mb-1">Standard Action</p>
              <p className="text-xs text-red-700 leading-relaxed">
                Activate full Emergency Response Plan. Dispatch resources. Finalize media holding statements. Contact next of kin.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
