export const SAFEVIATE_SAFETY_REPORTS_UPDATED = 'safeviate-safety-reports-updated';
export const SAFEVIATE_QUICK_SAFETY_REPORTS_UPDATED = 'safeviate-quick-safety-reports-updated';
export const SAFEVIATE_TECHNICAL_REPORTS_UPDATED = 'safeviate-technical-reports-updated';

export function dispatchSafeviateEvent(eventName: string) {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new Event(eventName));
}
