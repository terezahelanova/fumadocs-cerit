# fumadocs-new

This is a Next.js application generated with
[Create Fumadocs](https://github.com/fuma-nama/fumadocs).

Run development server:

```bash
npm run dev
# or
pnpm dev
# or
yarn dev
```

Open http://localhost:3000 with your browser to see the result.

## Explore

In the project, you can see:

- `lib/source.ts`: Code for content source adapter, [`loader()`](https://fumadocs.dev/docs/headless/source-api) provides the interface to access your content.
- `lib/layout.shared.tsx`: Shared options for layouts, optional but preferred to keep.

| Route                     | Description                                            |
| ------------------------- | ------------------------------------------------------ |
| `app/(home)`              | The route group for your landing page and other pages. |
| `app/docs`                | The documentation layout and pages.                    |
| `app/api/search/route.ts` | The Route Handler for search.                          |

### Fumadocs MDX

A `source.config.ts` config file has been included, you can customise different options like frontmatter schema.

Read the [Introduction](https://fumadocs.dev/docs/mdx) for further details.

## Learn More

To learn more about Next.js and Fumadocs, take a look at the following
resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js
  features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
- [Fumadocs](https://fumadocs.dev) - learn about Fumadocs

## Meilisearch integration

Search is provided by [Meilisearch](https://www.meilisearch.com/) through
[`@rambutanek/meilisearch-fumadocs-adapter`](https://www.npmjs.com/package/@rambutanek/meilisearch-fumadocs-adapter).

### Environment variables

All variables are read server-side by the Next.js route handlers.

```bash
# .env
MEILISEARCH_HOST=<meilisearch_host>
MEILISEARCH_KEY=<meilisearch_key>
MEILISEARCH_INDEX=docs
MEILISEARCH_FILTER_ATTRIBUTE=scope
MEILISEARCH_URL_PREFIX=/docs
```

| Variable                       | Required | Default | Description                                                                                                  |
| ------------------------------ | -------- | ------- | ------------------------------------------------------------------------------------------------------------ |
| `MEILISEARCH_HOST`             | **yes**  | —       | Meilisearch URL                                                                                              |
| `MEILISEARCH_KEY`              | **yes**  | —       | Meilisearch API key                                                                                          |
| `MEILISEARCH_INDEX`            | no       | `docs`  | Index uid to search                                                                                          |
| `MEILISEARCH_FILTER_ATTRIBUTE` | no       | `scope` | Facet attribute powering the search dialog's Filter dropdown; must be `filterable` in the Meilisearch index. |
| `MEILISEARCH_URL_PREFIX`       | no       | `/docs` | Base path prepended to indexed URLs so search results link to real site routes.                              |

### Routes and components

| File                                   | Purpose                                            |
| -------------------------------------- | -------------------------------------------------- |
| `app/api/meilisearch-search/route.ts`  | Search endpoint                                    |
| `app/api/meilisearch-filters/route.ts` | Facet values for the Filter dropdown               |
| `app/api/toc/route.ts`                 | MDX → structured chunks, used by the upload script |
| `lib/meilisearch/meilisearch.ts`       | Meilisearch client configuration                   |
| `components/layouts/meilisearch.tsx`   | Search dialog                                      |
| `components/layouts/meilisearch.css`   | Dialog-specific fixes                              |
