import { NextResponse } from 'next/server';
import { fetchFilters } from '@rambutanek/meilisearch-fumadocs-adapter';
import { meiliClient, MEILISEARCH_INDEX } from '@/lib/meilisearch/meilisearch';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const filterAttribute = url.searchParams.get('filterAttribute') ?? undefined;

    const filters = await fetchFilters({
      indexUid: MEILISEARCH_INDEX,
      client: meiliClient,
      filterAttribute: filterAttribute,
    });

    return NextResponse.json(filters);
  } catch (error) {
    return NextResponse.json([], { status: 500 });
  }
}
