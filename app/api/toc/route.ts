import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { frontmatter as parseFrontmatter } from 'fumadocs-core/content/md/frontmatter';
import { remarkHeading } from 'fumadocs-core/mdx-plugins/remark-heading';
import { remark } from 'remark';
import remarkGfm from 'remark-gfm';
import remarkMdx from 'remark-mdx';
import { z } from 'zod';

interface TocResponse {
  title?: string;
  key?: string;
}

interface ContentBlock {
  heading?: string;
  content: string;
}

interface HeadingEntry {
  id: string;
  content: string;
}

interface AstNode {
  type: string;
  children?: AstNode[];
  data?: { hProperties?: { id?: string } };
  position?: { start?: { offset?: number }; end?: { offset?: number } };
}

const tocRequestSchema = z.object({
  payload: z.string(),
});

function isMdxElement(node: AstNode): boolean {
  return node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement';
}

const mdxStringifier = remark().use(remarkGfm).use(remarkMdx);

function headingText(node: AstNode): string {
  return mdxStringifier
    .stringify({ type: 'root', children: [node] } as never)
    .replace(/^#{1,6}\s+/, '')
    .trim();
}

function sourceOf(source: string, node: AstNode): string {
  const start = node.position?.start?.offset;
  const end = node.position?.end?.offset;
  return start != null && end != null ? source.slice(start, end).trim() : '';
}

function extractContentBlocks({
  source,
  out,
  headings,
}: {
  source: string;
  out: ContentBlock[];
  headings: HeadingEntry[];
}) {
  return (tree: unknown) => {
    let lastHeading: string | undefined;

    function emit(node: AstNode, ancestors: AstNode[]) {
      let content = sourceOf(source, node);

      if (ancestors.length > 0) {
        const wrapped = ancestors.reduceRight<AstNode>(
          (child, ancestor) => ({ ...ancestor, children: [child] }),
          node,
        );
        content = mdxStringifier
          .stringify({ type: 'root', children: [wrapped] } as never)
          .trim();
      }

      if (content) {
        out.push(lastHeading === undefined ? { content } : { heading: lastHeading, content });
      }
    }

    function walk(children: AstNode[], ancestors: AstNode[]) {
      for (const node of children) {
        if (node.type === 'heading') {
          lastHeading = node.data?.hProperties?.id;
          if (lastHeading) {
            headings.push({ id: lastHeading, content: headingText(node) });
          }
          continue;
        }

        if (isMdxElement(node)) {
          if (node.children?.length) walk(node.children, [...ancestors, node]);
          else emit(node, ancestors);
          continue;
        }

        if (node.type === 'list' || node.type === 'listItem') {
          if (node.type === 'list' && ancestors.length > 0) {
            emit(node, ancestors);
          } else if (node.children?.length) {
            walk(node.children, ancestors);
          }
          continue;
        }

        emit(node, ancestors);
      }
    }

    walk((tree as AstNode).children ?? [], []);
  };
}

function buildToc(content: string): { headings: HeadingEntry[]; contents: ContentBlock[] } {
  const contents: ContentBlock[] = [];
  const headings: HeadingEntry[] = [];

  remark()
    .use(remarkGfm)
    .use(remarkMdx)
    .use(remarkHeading)
    .use(extractContentBlocks, { source: content, out: contents, headings })
    .processSync(content);

  return { headings, contents };
}

export async function POST(request: NextRequest) {
  let payload: string;
  try {
    payload = tocRequestSchema.parse(await request.json()).payload;
  } catch (error) {
    console.error('Invalid TOC request body:', error);
    return NextResponse.json({ error: 'Bad Request' }, { status: 400 });
  }

  try {
    const { content, data } = parseFrontmatter(payload);
    const { title = '', key = '' } = data as TocResponse;
    return NextResponse.json({ structure: buildToc(content), title, key });
  } catch (error) {
    console.error('Error processing TOC request:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
