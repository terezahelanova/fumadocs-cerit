import { codeToHtml } from 'shiki';

const pattern = '(text)';

function createCaseInsensitiveWordHighlighter(query) {
  const terms = Array.from(new Set(query.trim().split(/\s+/).filter(Boolean)));
  if (terms.length === 0) {
    return { name: 'word-highlight', code() {} };
  }

  const escapedTerms = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = `(${escapedTerms.join('|')})`;

  return {
    name: 'word-highlight',
    code(codeNode) {
      console.log('codeNode type:', codeNode.type);
      console.log('codeNode tagName:', codeNode.tagName);
      console.log('codeNode children count:', codeNode.children?.length);
      
      function processNode(node) {
        if (!node) return node;

        if (node.type === 'text') {
          console.log('Text node value:', JSON.stringify(node.value));
          const content = node.value;
          if (!content) return node;

          const regex = new RegExp(pattern, 'gi');
          const matches = [...content.matchAll(regex)];
          console.log('Matches for text:', matches.length);

          if (matches.length === 0) return node;

          const result = [];
          let lastIndex = 0;

          for (const match of matches) {
            const start = match.index;
            const end = start + match[0].length;

            if (start > lastIndex) {
              const textBefore = content.slice(lastIndex, start);
              if (textBefore) {
                result.push({ type: 'text', value: textBefore });
              }
            }

            result.push({
              type: 'element',
              tagName: 'span',
              properties: {
                class: 'highlight',
                style: 'background-color: rgba(255, 255, 0, 0.3);',
              },
              children: [{ type: 'text', value: match[0] }],
            });

            lastIndex = end;
          }

          if (lastIndex < content.length) {
            const textAfter = content.slice(lastIndex);
            if (textAfter) {
              result.push({ type: 'text', value: textAfter });
            }
          }

          return result.length === 1 ? result[0] : result;
        }

        if (node.type === 'element' && node.children && Array.isArray(node.children)) {
          const newChildren = [];
          for (const child of node.children) {
            const processed = processNode(child);
            if (Array.isArray(processed)) {
              newChildren.push(...processed);
            } else {
              newChildren.push(processed);
            }
          }
          return { ...node, children: newChildren };
        }

        return node;
      }

      const processed = processNode(codeNode);
      Object.assign(codeNode, processed);
    },
  };
}

async function test() {
  const code = 'const x = `text`;\nconsole.log("Hello");';

  const html = await codeToHtml(code, {
    lang: 'javascript',
    theme: 'slack-dark',
    transformers: [createCaseInsensitiveWordHighlighter('text')],
  });

  // Check if highlight span is in output
  if (html.includes('highlight')) {
    console.log('\n✓ Highlight found in output!');
  } else {
    console.log('\n✗ No highlight found in output');
  }
  
  // Extract just the code part
  const codeMatch = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/);
  if (codeMatch) {
    console.log('\nCode block HTML:');
    console.log(codeMatch[0]);
  }
}

test();
