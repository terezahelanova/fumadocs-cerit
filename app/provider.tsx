'use client';

import { RootProvider } from 'fumadocs-ui/provider/next';
import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';
import { TooltipProvider } from '@radix-ui/react-tooltip';

const SearchDialog = dynamic(() => import('@/components/search/meilisearch'), {
  ssr: false,
});

export function Provider({
  children,
  i18n,
  theme
}: {
  children: ReactNode;
  i18n?: Parameters<typeof RootProvider>[0]['i18n'];
  theme?: Parameters<typeof RootProvider>[0]['theme'];
}) {
  return (
    <RootProvider
      i18n={i18n}
      theme={theme}
      search={{
        SearchDialog,
      }}
    >
      <TooltipProvider>
        {children}
      </TooltipProvider>
    </RootProvider>
  );
}
