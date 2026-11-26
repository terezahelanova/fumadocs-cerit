import {
  createMeilisearchAPI,
  createUrlNormalizer,
} from 'meilisearch-fumadocs-adapter';
import { meiliClient, MEILISEARCH_INDEX } from '@/lib/meilisearch/meilisearch';

const transformUrl = createUrlNormalizer({ locales: ['cz'], basePath: '/docs' });

export async function GET(request: Request) {
  const url = new URL(request.url);

  const filterAttributeValue = url.searchParams.get('filterAttributeValue') ?? undefined;
  const language = url.searchParams.get('language') ?? undefined;

  const searchAPI = createMeilisearchAPI({
    indexUid: MEILISEARCH_INDEX,
    client: meiliClient,
    filterAttribute: process.env.MEILISEARCH_FILTER_ATTRIBUTE || 'scope',
    filterAttributeValue,
    language,
    transformUrl,
  });
  return searchAPI.GET(request);
}
