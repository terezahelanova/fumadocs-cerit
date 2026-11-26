import { NextResponse } from 'next/server';
import { fetchFilters } from 'meilisearch-fumadocs-adapter';
import { meiliClient, MEILISEARCH_INDEX } from '@/lib/meilisearch/meilisearch';

export async function GET(request: Request) {
  try {
    const filters = await fetchFilters({
      indexUid: MEILISEARCH_INDEX,
      client: meiliClient,
      filterAttribute: process.env.MEILISEARCH_FILTER_ATTRIBUTE || 'scope',
    });

    return NextResponse.json(filters);
  } catch (error) {
    return NextResponse.json([], { status: 500 });
  }
}
