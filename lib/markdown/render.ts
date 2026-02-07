import hljs from "highlight.js";
import { Marked } from "marked";
import { markedHighlight } from "marked-highlight";
import sanitizeHtml from "sanitize-html";

export const MARKDOWN_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "p",
    "a",
    "ul",
    "ol",
    "li",
    "blockquote",
    "code",
    "pre",
    "em",
    "strong",
    "del",
    "hr",
    "br",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    "img",
    "span",
    "input",
  ],
  allowedAttributes: {
    a: ["href", "name", "target", "rel", "title"],
    img: ["src", "alt", "title", "width", "height", "loading"],
    code: ["class"],
    span: ["class"],
    th: ["align", "colspan", "rowspan"],
    td: ["align", "colspan", "rowspan"],
    input: ["type", "checked", "disabled"],
  },
  allowedClasses: {
    code: [/^language-[a-z0-9-]+$/i, /^hljs(?:-[a-z0-9-]+)?$/i],
    span: [/^hljs(?:-[a-z0-9-]+)?$/i],
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesByTag: {
    img: ["http", "https", "data"],
  },
  allowProtocolRelative: false,
  disallowedTagsMode: "discard",
};

const markdownParser = new Marked(
  markedHighlight({
    langPrefix: "hljs language-",
    emptyLangClass: "hljs",
    highlight(code, lang) {
      try {
        if (lang && hljs.getLanguage(lang)) {
          return hljs.highlight(code, { language: lang }).value;
        }
        return hljs.highlightAuto(code).value;
      } catch {
        return code;
      }
    },
  }),
);

markdownParser.setOptions({
  gfm: true,
  breaks: true,
});

export function renderMarkdownToHtml(markdown: string) {
  return markdownParser.parse(markdown) as string;
}

export function renderSafeMarkdownToHtml(markdown: string) {
  const renderedHtml = renderMarkdownToHtml(markdown);
  return sanitizeHtml(renderedHtml, MARKDOWN_SANITIZE_OPTIONS);
}

