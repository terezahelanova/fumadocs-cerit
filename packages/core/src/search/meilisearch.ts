import { type SortedResult, createContentHighlighter } from '@/search';
import { createEndpoint } from '@/search/server/endpoint';
import type { SearchAPI, QueryOptions } from '@/search/server/types';
import { codeToHtml } from 'shiki';
import type { ShikiTransformer } from 'shiki';

export interface MeilisearchOptions {
  /**
   * The identifier of the Meilisearch index to search in.
   */
  indexUid: string;
  /**
   * The Meilisearch client instance.
   */
  client: any;
  /**
   * Attribute name used for filtering.
   */
  filterAttribute?: string;
  /**
   * Concrete value of 'filterAttribute' to filter results by.
   */
  filterAttributeValue?: string;
}

type FacetHit = {
  value: string;
  count: number;
};

/**
 * Meilisearch documents are expected to contain:
 * - url: Page path including anchor (e.g., "/guide#installation")
 * - heading: The heading text for the search result
 * - pageTitle: The title of the page
 * - rawContent: Text with the search result in a Markdown format
 * - content: Plain text with the search result
 */

type SearchHit = {
  url: string;
  heading: string;
  pageTitle: string;
  rawContent: string;
  content: string;
  _formatted?: {
    rawContent?: string;
    content?: string;
    heading?: string;
  };
};

type ParsedCodeBlock = {
  lang: string;
  code: string;
};

export function createMeilisearchAPI(options: MeilisearchOptions): SearchAPI<QueryOptions> {
  const { indexUid, client, filterAttribute, filterAttributeValue } = options;

  return createEndpoint({
    async search(query) {
      const trimmedQuery = query.trim();

      if (!trimmedQuery) {
        return [];
      }

      const index = client.index(indexUid);

      const response = await index.search(trimmedQuery, {
        filter: createFilter(filterAttribute, filterAttributeValue),
        attributesToHighlight: ['heading', 'rawContent'],
        highlightPreTag: '<mark>',
        highlightPostTag: '</mark>',
      });

      return mapHitsToSortedResults(response.hits as SearchHit[], trimmedQuery);
    },

    async export() {
      throw new Error('Export is not implemented.');
    },
  });
}

function processHighlightedContent(delimiter: string, highlightedContent: string): string {
  const parts = highlightedContent.split(/(<mark>[^<]+<\/mark>)/g);
  let result = '';

  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith('<mark>')) {
      result += part;
    } else {
      result += delimiter + part + delimiter;
    }
  }

  return result;
}

function highlightInlineText(content: string): string {
  const blockPattern = /(`+|\*+|_+)([\s\S]*?)\1/g;

  return content.replace(blockPattern, (_, openDelimiter, innerContent) => {
    if (openDelimiter === '*' && innerContent.startsWith(' ')) {
      return openDelimiter + innerContent + openDelimiter;
    }
    if (!innerContent.includes('<mark>')) {
      return openDelimiter + innerContent + openDelimiter;
    }
    const textOnly = innerContent.replace(/<[^>]+>/g, '');
    if (textOnly.length >= content.length) {
      return openDelimiter + innerContent + openDelimiter;
    }

    return processHighlightedContent(openDelimiter, innerContent);
  });
}

function createFilter(filterAttribute?: string, filterAttributeValue?: string): string | undefined {
  if (!filterAttribute || !filterAttributeValue) {
    return undefined;
  }

  return `${filterAttribute} = "${filterAttributeValue}"`;
}

// Only for CERIT use case
function normalizeUrl(url: string): string {
  if (!url.startsWith('/docs')) {
    return `/docs${url}`;
  }
  return url;
}

async function mapHitsToSortedResults(hits: SearchHit[], query: string): Promise<SortedResult[]> {
  const highlighter = createContentHighlighter(query);

  const pages = new Map<string, SortedResult>();
  const pageItems = new Map<string, SortedResult[]>();

  let idCounter = 0;
  for (const hit of hits) {
    const normalizedUrl = normalizeUrl(hit.url);
    const pageId = normalizedUrl;

    if (!pages.has(pageId)) {
      pages.set(pageId, createPageResult({ ...hit, url: normalizedUrl }, highlighter));
      pageItems.set(pageId, []);
    }

    const codeBlock = parseCodeBlock(hit.rawContent);

    let content = '';
    if (!codeBlock) {
      const formattedContent = hit._formatted?.rawContent || hit.rawContent;
      content = highlighter.highlightMarkdown(highlightInlineText(formattedContent));

    } else {
      content = await highlightCodeBlock(codeBlock, query);
    }

    pageItems.get(pageId)?.push({
      id: `${pageId}_${idCounter++}`,
      type: 'text',
      content,
      url: normalizedUrl,
    });
  }

  return flattenGroupedResults(pages, pageItems);
}

function createPageResult(
  hit: SearchHit,
  highlighter: ReturnType<typeof createContentHighlighter>,
): SortedResult {
  return {
    id: hit.url,
    type: 'page',
    content: highlighter.highlightMarkdown(hit.heading),
    breadcrumbs: [hit.pageTitle],
    url: hit.url,
  };
}

function parseCodeBlock(content: string): ParsedCodeBlock | null {
  const trimmedContent = content.trim();

  const match = trimmedContent.match(/^```([^\s`]*)[^\n]*\n([\s\S]*?)\n```$/);

  if (!match) {
    return null;
  }

  return {
    lang: match[1] || 'text',
    code: match[2],
  };
}

function highlightCodeBlockRecursive(node: any, query: string): void {
  if (!node) return;

  if (node.type === 'element' && node.tagName === 'span') {
    const content = node.children
      ?.filter((c: any) => c.type === 'text')
      .map((c: any) => c.value)
      .join('');

    if (content && content.length > 0) {
      const regex = new RegExp(query, 'gi');
      const matches = [...content.matchAll(regex)];

      if (matches.length > 0) {
        const newChildren: any[] = [];
        let lastIndex = 0;

        for (const match of matches) {
          const start = match.index!;
          const end = start + match[0].length;

          if (start > lastIndex) {
            const textBefore = content.slice(lastIndex, start);
            if (textBefore) {
              newChildren.push({
                type: 'text',
                value: textBefore,
              });
            }
          }

          newChildren.push({
            type: 'element',
            tagName: 'span',
            properties: {
              class: 'highlight',
              style: 'background-color: rgba(255, 255, 0, 0.3);',
            },
            children: [
              {
                type: 'text',
                value: match[0],
              },
            ],
          });

          lastIndex = end;
        }

        if (lastIndex < content.length) {
          const textAfter = content.slice(lastIndex);
          if (textAfter) {
            newChildren.push({
              type: 'text',
              value: textAfter,
            });
          }
        }

        node.children = newChildren;
        return;
      }
    }
  }

  if (node.children && Array.isArray(node.children)) {
    for (const child of node.children) {
      highlightCodeBlockRecursive(child, query);
    }
  }
};


async function highlightCodeBlock(codeBlock: ParsedCodeBlock, query: string): Promise<string> {
  const codeBlockHeighlightTransformer: ShikiTransformer = {
    name: 'word-highlight',
    code(node) {
      highlightCodeBlockRecursive(node, query);
    },
  };

  const codeBlockHeightTransformer: ShikiTransformer = {
    name: 'code-block-height',
    pre(node) {
      const extraStyles = 'max-height: none; height: auto;';
      node.properties.style = `${extraStyles} ${node.properties?.style || ''}`;
    },
  };

  const theme = codeBlock.lang && codeBlock.lang !== '' ? 'one-dark-pro' : 'github-light';

  return codeToHtml(codeBlock.code, {
    lang: codeBlock.lang || 'text',
    theme,
    transformers: [codeBlockHeighlightTransformer, codeBlockHeightTransformer],
  });
}


function flattenGroupedResults(
  pages: Map<string, SortedResult>,
  pageItems: Map<string, SortedResult[]>,
): SortedResult[] {
  const results: SortedResult[] = [];

  for (const [pageId, page] of pages) {
    results.push(page);
    results.push(...(pageItems.get(pageId) ?? []));
  }

  return results;
}

export async function fetchFilters(options: MeilisearchOptions): Promise<string[]> {
  const { indexUid, client, filterAttribute } = options;

  if (!filterAttribute) {
    return [];
  }

  try {
    const index = client.index(indexUid);

    const facetResponse = await index.searchForFacetValues({
      facetName: filterAttribute,
      facetQuery: '',
    });

    return facetResponse.facetHits.map((hit: FacetHit) => hit.value);
  } catch (error) {
    console.error(
      `Failed to fetch facet values for '${filterAttribute}' from index '${indexUid}':`,
      error,
    );

    return [];
  }
}
