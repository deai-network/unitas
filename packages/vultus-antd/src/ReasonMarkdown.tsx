import { Markdown } from './Markdown.js';

/** Inline markdown for tooltip texts (disable-reasons, descriptions). Thin preset of <Markdown>. */
export function ReasonMarkdown({ children }: { children: string }) {
  return <Markdown inline>{children}</Markdown>;
}
