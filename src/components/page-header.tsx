import type { FC, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
  PAGE_FORMAT_PRIMARY_BUTTON_CLASS,
  PAGE_FORMAT_SECONDARY_BUTTON_CLASS,
  PAGE_FORMAT_MOBILE_BUTTON_CLASS,
} from '@/lib/page-format-buttons';

export const HEADER_ACTION_BUTTON_CLASS = PAGE_FORMAT_PRIMARY_BUTTON_CLASS;

export const HEADER_SECONDARY_BUTTON_CLASS = PAGE_FORMAT_SECONDARY_BUTTON_CLASS;

export const HEADER_MOBILE_ACTION_BUTTON_CLASS =
  `${PAGE_FORMAT_PRIMARY_BUTTON_CLASS} ${PAGE_FORMAT_MOBILE_BUTTON_CLASS}`;

export const HEADER_TAB_LIST_CLASS =
  "bg-transparent h-auto p-0 gap-1.5 border-0 rounded-md justify-start flex min-w-max flex-nowrap shadow-none";

export const HEADER_TAB_TRIGGER_CLASS =
  "h-8 rounded-md px-3 text-[9px] font-medium uppercase tracking-[0.08em] transition-all shadow-none border border-input gap-1.5 shrink-0 data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none";

export const HEADER_COMPACT_CONTROL_CLASS =
  "h-8 rounded-md border border-input bg-background px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.08em] shadow-none gap-1.5 shrink-0";

export const CARD_HEADER_BAND_CLASS =
  "border-b border-card-border bg-[hsl(var(--card-header-band-background))] px-2 py-1.5 min-h-11 shrink-0 md:px-4";

export const CARD_HEADER_TOP_ROW_CLASS =
  "flex min-h-[52px] items-start justify-between gap-4";

export const CARD_HEADER_SCOPE_ZONE_CLASS =
  "min-w-0 flex-1";

export const CARD_HEADER_ACTION_ZONE_CLASS =
  "flex min-h-8 shrink-0 flex-wrap items-center justify-end gap-2";

const DEFAULT_HEADER_DESCRIPTIONS: Record<string, string> = {
  'Flight Billing': 'Review completed flights ready for billing and export.',
  'Flight Billing (Admin)': 'Review billing records, exports, and financial totals.',
  Departments: 'Create and maintain company departments.',
  'Threshold & Expiry': 'Set document expiry thresholds and warning windows.',
  'Exam Topics': 'Manage the subject list used across exams and the question bank.',
  'Feature Management': 'Control tenant features, module access, and finding levels.',
  'Mass & Balance Configurator': 'Build and maintain aircraft mass and balance profiles.',
  'Safety Monitor Thresholds': 'Configure the alert limits used by the safety monitor.',
  Permissions: 'Review the permission catalog available in the app.',
  Roles: 'Create roles and assign the permissions they can use.',
  'Bookings History': 'Review past bookings and completed activity.',
  'Daily Schedule': 'Plan and monitor resource bookings for the day.',
  'My Logbook': 'Track your personal logbook entries and records.',
  Messages: 'See your latest messages and discussions.',
  'My Outstanding Tasks': 'Review tasks assigned to you and follow up on due items.',
  'Operations Alerts': 'View and manage critical operational alerts.',
  'Emergency Response Plan': 'Manage emergency contacts, triggers, and response records.',
  'Route Planner': 'Manage standardized and general aviation flight paths.',
  'Training Routes': 'Manage standardized training flight paths and sectors.',
  'Annual Audit Schedule': 'Plan and track the annual audit program.',
  Audits: 'Review audit results and follow-up status.',
  'Coherence Matrix': 'Compare requirements, policies, and procedures for alignment.',
  'Risk Matrix': 'Visualize risk likelihood and severity across the organization.',
  'Question Bank Manager': 'Manage aviation questions and organize them by topic.',
  'Student Progress': 'Track student progress and open individual reports.',
  'Access Overview': 'See which modules each role can access.',
};

interface MainPageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
  centerActions?: boolean;
}

interface CardControlHeaderProps {
  context?: ReactNode;
  actions?: ReactNode;
  navigation?: ReactNode;
  mobileContext?: ReactNode;
  mobileActions?: ReactNode;
  className?: string;
  isMobile?: boolean;
  centerActions?: boolean;
}

/**
 * Shared supporting header for pages that already expose the title in the app top bar.
 * Keep this strip slim and use it for secondary description text and in-page actions.
 */
export const MainPageHeader: FC<MainPageHeaderProps> = ({
  title,
  description,
  actions,
  className,
  centerActions = false,
}) => {
  const hasExplicitDescription = description !== undefined;
  const resolvedDescription = hasExplicitDescription
    ? description?.trim()
    : DEFAULT_HEADER_DESCRIPTIONS[title] || 'Overview of this section.';

  return (
    <CardControlHeader
      className={cn("main-page-header flex w-full shrink-0 flex-col bg-[hsl(var(--card-header-band-background))]", className)}
      isMobile={false}
      centerActions={centerActions}
      context={resolvedDescription ? (
        <div className="flex min-w-0 flex-col gap-1">
          <p className="main-page-header__description text-[10px] font-medium text-muted-foreground sm:text-xs">
            {resolvedDescription}
          </p>
        </div>
      ) : undefined}
      mobileContext={resolvedDescription ? (
        <div className="flex min-w-0 flex-col gap-1">
          <p className="main-page-header__description text-[10px] font-medium text-muted-foreground sm:text-xs">
            {resolvedDescription}
          </p>
        </div>
      ) : undefined}
      actions={actions ? (
        <div className="main-page-header__actions flex w-full flex-wrap items-center gap-1.5 [&_button]:h-8 [&_button]:gap-1.5 [&_button]:px-3 [&_button]:text-[9px] [&_button]:tracking-[0.08em] [&_a]:h-8 [&_a]:gap-1.5 [&_a]:px-3 [&_a]:text-[9px] [&_a]:tracking-[0.08em]">
          {actions}
        </div>
      ) : undefined}
    />
  );
};

export const CardControlHeader: FC<CardControlHeaderProps> = ({
  context,
  actions,
  navigation,
  mobileContext,
  mobileActions,
  className,
  isMobile = false,
  centerActions = false,
}) => {
  const hasTopRow = Boolean(context || actions || mobileContext || mobileActions);
  const resolvedMobileContext = mobileContext ?? context;
  const resolvedMobileActions = mobileActions ?? actions;

  return (
    <div className={cn("flex w-full shrink-0 flex-col", className)}>
      {hasTopRow ? (
        <div className={CARD_HEADER_BAND_CLASS}>
          {isMobile ? (
            <div className="space-y-2">
              {resolvedMobileContext ? resolvedMobileContext : null}
              {resolvedMobileActions ? resolvedMobileActions : null}
            </div>
          ) : (
            <div
              className={cn(
                CARD_HEADER_TOP_ROW_CLASS,
                "main-page-header__header",
                centerActions && "justify-center"
              )}
            >
              <div
                className={cn(
                  CARD_HEADER_SCOPE_ZONE_CLASS,
                  "main-page-header__scope-zone",
                  centerActions && "hidden"
                )}
              >
                {context ? context : null}
              </div>
              {actions ? (
                <div
                  className={cn(
                    CARD_HEADER_ACTION_ZONE_CLASS,
                    "main-page-header__action-zone",
                    centerActions && "w-full flex-1 justify-center"
                  )}
                >
                  {actions}
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      {navigation ? (
        <div className={CARD_HEADER_BAND_CLASS}>
          {navigation}
        </div>
      ) : null}
    </div>
  );
};

export default MainPageHeader;
