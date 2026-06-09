import { redirect } from 'next/navigation';

type SearchParams = Record<string, string | string[] | undefined>;

export default function AssetInspectionChecklistsRedirectPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const copyFrom = typeof searchParams?.copyFrom === 'string' ? searchParams.copyFrom.trim() : '';
  const template = typeof searchParams?.template === 'string' ? searchParams.template.trim() : '';
  const query = copyFrom
    ? `?copyFrom=${encodeURIComponent(copyFrom)}`
    : template
      ? `?template=${encodeURIComponent(template)}`
      : '';

  redirect(`/assets/checklists/new${query}`);
}
