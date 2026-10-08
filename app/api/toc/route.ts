import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { frontmatter as parseFrontmatter } from 'fumadocs-core/content/md/frontmatter';
import { structure } from 'fumadocs-core/mdx-plugins/remark-structure';
import { z } from 'zod';

interface TocResponse {
  title?: string;
  key?: string;
}

const tocRequestSchema = z.object({
  payload: z.string(),
});

export async function POST(request: NextRequest) {
  let payload: string;
  try {
    const body = tocRequestSchema.parse(await request.json());
    payload = body.payload;
  } catch (error) {
    console.error('Invalid TOC request body:', error);
    return NextResponse.json({ error: 'Bad Request' }, { status: 400 });
  }

  try {
    const { content, data } = parseFrontmatter(payload);
    const { title = '', key = '' } = data as TocResponse;

    const contentStructure = structure(content, [], {
      // Consider everything except list and listItem nodes
      types: (node) => node.type !== 'list' && node.type !== 'listItem',
    });

    console.log('both + types:', contentStructure);
    return NextResponse.json({
      structure: contentStructure,
      title,
      key,
    });
  } catch (error) {
    console.error('Error processing TOC request:', error);

    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
