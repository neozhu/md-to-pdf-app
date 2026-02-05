import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

export function MdPreview({
  markdown,
  className,
}: {
  markdown: string;
  className?: string;
}) {
  return (
    <div className={cn("h-full overflow-auto p-5", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (props) => (
            <h1
              className="mb-4 text-2xl font-semibold tracking-tight"
              {...props}
            />
          ),
          h2: (props) => (
            <h2
              className="mt-8 mb-3 text-xl font-semibold tracking-tight"
              {...props}
            />
          ),
          h3: (props) => (
            <h3 className="mt-6 mb-2 text-lg font-semibold" {...props} />
          ),
          p: (props) => (
            <p className="my-3 leading-7 text-foreground/90" {...props} />
          ),
          a: (props) => (
            <a
              className="font-medium underline underline-offset-4 hover:text-foreground"
              {...props}
            />
          ),
          ul: (props) => <ul className="my-3 ml-5 list-disc" {...props} />,
          ol: (props) => <ol className="my-3 ml-5 list-decimal" {...props} />,
          li: (props) => <li className="my-1" {...props} />,
          hr: () => <hr className="my-6 border-border" />,
          blockquote: (props) => (
            <blockquote
              className="my-4 border-l-2 border-border pl-4 text-muted-foreground"
              {...props}
            />
          ),
          table: (props) => (
            <div className="my-4 overflow-x-auto">
              <table className="w-full border-collapse text-sm" {...props} />
            </div>
          ),
          th: (props) => (
            <th
              className="border border-border bg-muted px-3 py-2 text-left font-medium"
              {...props}
            />
          ),
          td: (props) => (
            <td className="border border-border px-3 py-2" {...props} />
          ),
          code: ({ className, children, ...props }) => {
            const text = String(children ?? "");
            const isBlock = Boolean(className) || text.includes("\n");

            if (isBlock) {
              return (
                <code
                  className={cn(
                    "block overflow-x-auto rounded-lg border border-border bg-muted px-4 py-3 font-mono text-xs leading-6",
                    className,
                  )}
                  {...props}
                >
                  {children}
                </code>
              );
            }

            return (
              <code
                className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs"
                {...props}
              >
                {children}
              </code>
            );
          },
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
