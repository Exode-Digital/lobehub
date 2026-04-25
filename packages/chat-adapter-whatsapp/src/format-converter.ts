import type { Root } from 'chat';
import { BaseFormatConverter, parseMarkdown, stringifyMarkdown } from 'chat';

/**
 * WhatsApp uses its own light-weight markup (`*bold*`, `_italic_`, `~strike~`,
 * \`mono\`, \`\`\`block\`\`\`). Standard CommonMark is close enough for casual
 * use that we round-trip through `stringifyMarkdown` and let the platform
 * client's `markdownToWhatsApp` translator handle the asterisk/underscore
 * normalization at outbound time.
 */
export class WhatsAppFormatConverter extends BaseFormatConverter {
  fromAst(ast: Root): string {
    return stringifyMarkdown(ast);
  }

  toAst(text: string): Root {
    return parseMarkdown(text.trim());
  }
}
