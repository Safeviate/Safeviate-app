'use client';

import { useState } from 'react';
import { NewSafetyReportForm, type NewSafetyReportValues } from './new-safety-report-form';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { useUserProfile } from '@/hooks/use-user-profile';
import type { Aircraft } from '@/types/aircraft';
import { useEffect, useState as useReactState } from 'react';
import { parseJsonResponse } from '@/lib/safe-json';
import { dispatchSafeviateEvent, SAFEVIATE_SAFETY_REPORTS_UPDATED } from '@/lib/client-events';

const getReportTypePrefix = (type: NewSafetyReportValues['reportType']): string => {
    switch (type) {
        case 'Flight Operations': return 'FLT';
        case 'Aircraft Defect': return 'ADR';
        case 'Ground Operations': return 'GRD';
        case 'General Safety Concern': return 'GEN';
        default: return 'REP';
    }
}

export default function NewSafetyReportPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { tenantId, userProfile } = useUserProfile();
  const [aircrafts, setAircrafts] = useReactState<Aircraft[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
        try {
        const response = await fetch('/api/schedule-data', { cache: 'no-store' });
        const payload = await response.json().catch(() => ({ aircraft: [] }));
        if (!cancelled) setAircrafts(payload?.aircraft ?? []);
      } catch {
        if (!cancelled) setAircrafts([]);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleNewReport = async (values: NewSafetyReportValues) => {
    if (!tenantId) {
      toast({ variant: 'destructive', title: 'Error', description: 'You must be logged in to file a report.' });
      return;
    }

    const filedOnBehalfOf = values.submittedOnBehalfOf?.trim() || '';
    const reporterEmail = userProfile?.email?.trim() || '';
    const reporterLabel = filedOnBehalfOf || reporterEmail || [userProfile?.firstName, userProfile?.lastName].filter(Boolean).join(' ').trim() || 'Signed-in User';
    
    setIsSubmitting(true);

    try {
        const response = await fetch('/api/safety-reports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            report: {
              reportNumber: `${getReportTypePrefix(values.reportType)}-${String(Date.now()).slice(-4)}`,
              reportType: values.reportType,
              status: 'Open',
              submittedBy: values.isAnonymous ? 'anonymous' : (reporterEmail || userProfile?.id || 'signed-in-user'),
              submittedByEmail: values.isAnonymous ? null : reporterEmail || null,
              submittedByName: values.isAnonymous ? 'Anonymous' : reporterLabel,
              submittedOnBehalfOf: values.isAnonymous ? null : (filedOnBehalfOf || null),
              submittedAt: new Date().toISOString(),
              isAnonymous: values.isAnonymous,
              eventDate: format(values.eventDate, 'yyyy-MM-dd'),
              eventTime: values.eventTime,
              location: values.location,
              description: values.description,
              phaseOfFlight: values.phaseOfFlight,
              systemOrComponent: values.systemOrComponent,
            },
          }),
        });

        const payload = await parseJsonResponse<{
          error?: string;
          report?: { id?: string };
        }>(response);

        if (!response.ok) {
          throw new Error(payload?.error || 'Failed to submit report.');
        }

        const newReportId = payload?.report?.id;
        if (!newReportId) {
          throw new Error('Report was saved but no report id was returned.');
        }

      toast({
        title: 'Report Submitted',
        description: 'Your safety report has been successfully filed.',
      });

      dispatchSafeviateEvent(SAFEVIATE_SAFETY_REPORTS_UPDATED);
      router.push(`/safety/safety-reports/${newReportId}`);

    } catch (error) {
      console.error(error);
      toast({
        variant: 'destructive',
        title: 'Submission Failed',
        description: error instanceof Error ? error.message : 'An unknown error occurred while submitting the report.',
      });
    } finally {
        setIsSubmitting(false);
    }
  };
  

  return (
    <NewSafetyReportForm 
        aircrafts={aircrafts || []}
        onSubmit={handleNewReport}
        isSubmitting={isSubmitting}
    />
  );
}
