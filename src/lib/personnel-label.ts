export type PersonnelLike = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
};

function normalizeLookupValue(value?: string | null) {
  return (value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function getPersonnelDisplayName(personnel: PersonnelLike[], lookupValue?: string | null) {
  const normalizedLookup = normalizeLookupValue(lookupValue);
  if (!normalizedLookup) return '';
  const rawLookup = (lookupValue || '').trim();

  const match = personnel.find((person) => {
    const firstName = (person.firstName || '').trim();
    const lastName = (person.lastName || '').trim();
    const email = (person.email || '').trim().toLowerCase();
    const emailLocal = email.split('@')[0] || '';
    const emailDomain = email.split('@')[1] || '';

    const candidateValues = [
      person.id,
      email,
      `${firstName} ${lastName}`,
      `${firstName}${lastName}`,
      `${firstName}.${lastName}`,
      `${firstName}_${lastName}`,
      emailLocal,
      `user_${emailLocal}`,
      `user_${emailLocal}_${emailDomain.replace(/\./g, '_')}`,
      `user_${email.replace(/[@.]/g, '_')}`,
      `user_${firstName}${lastName}`.toLowerCase(),
    ];

    return candidateValues.some((candidate) => normalizeLookupValue(candidate) === normalizedLookup);
  });

  if (!match) return rawLookup;

  const displayName = `${match.firstName || ''} ${match.lastName || ''}`.trim();
  if (displayName) return displayName;
  if (match.email?.trim()) return match.email.trim();
  return match.id;
}
