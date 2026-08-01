import sanitizeHtml from "sanitize-html";

const richTextOptions: sanitizeHtml.IOptions = {
    allowedTags: [
        "p", "br", "strong", "b", "em", "i", "u", "s",
        "h1", "h2", "h3", "ul", "ol", "li", "blockquote", "a",
    ],
    allowedAttributes: {
        a: ["href", "target", "rel"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
        a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" }),
    },
};

export const getRichTextLength = (value: string) =>
    sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} })
        .replace(/&nbsp;/g, " ")
        .trim()
        .length;

export const sanitizeContestRichText = (value: string) =>
    sanitizeHtml(value.trim(), richTextOptions);

