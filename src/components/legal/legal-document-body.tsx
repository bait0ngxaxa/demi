import { Fragment } from "react";

import { parseLegalMarkdown, type LegalInline } from "@/modules/legal/domain/legal-markdown";

function Inlines({ inlines }: { inlines: readonly LegalInline[] }): React.JSX.Element {
  return (
    <>
      {inlines.map((inline, index) =>
        inline.strong ? <strong className="font-semibold text-text" key={index}>{inline.text}</strong> : <Fragment key={index}>{inline.text}</Fragment>)}
    </>
  );
}

/** Renders a legal body (ADR-0028 Markdown subset) as text only; the body never becomes HTML. */
export function LegalDocumentBody({ body }: { body: string }): React.JSX.Element {
  const blocks = parseLegalMarkdown(body);
  return (
    <div className="type-readable space-y-4 text-base leading-7 text-text">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          const className = block.level === 1
            ? "pt-2 text-xl font-semibold tracking-[-0.02em]"
            : block.level === 2 ? "pt-2 text-lg font-semibold" : "pt-1 text-base font-semibold";
          const Heading = block.level === 1 ? "h2" : block.level === 2 ? "h3" : "h4";
          return <Heading className={className} key={index}><Inlines inlines={block.inlines} /></Heading>;
        }
        if (block.type === "list") {
          const List = block.ordered ? "ol" : "ul";
          return (
            <List className={block.ordered ? "list-decimal space-y-1.5 pl-6" : "list-disc space-y-1.5 pl-6"} key={index}>
              {block.items.map((item, itemIndex) => <li key={itemIndex}><Inlines inlines={item} /></li>)}
            </List>
          );
        }
        return (
          <p key={index}>
            {block.lines.map((line, lineIndex) => (
              <Fragment key={lineIndex}>
                {lineIndex > 0 ? <br /> : null}
                <Inlines inlines={line} />
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
