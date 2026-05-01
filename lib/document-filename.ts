const UNTITLED_MD_PATTERN = /^untitled-\d{8}-\d{4}\.md$/i;
const MAX_PDF_FILE_NAME_LEN = 44;

export function isUntitledMdFileName(mdFileName: string) {
  return UNTITLED_MD_PATTERN.test(mdFileName.trim());
}

export function mdFileNameFromPdfFileName(pdfFileName: string) {
  const trimmed = pdfFileName.trim();
  const base = trimmed.toLowerCase().endsWith(".pdf")
    ? trimmed.slice(0, -4)
    : trimmed;
  return `${base}.md`;
}

export function sanitizeSuggestedPdfFileName(value: string) {
  const withoutExtension = value
    .trim()
    .replace(/\.pdf$/i, "")
    .normalize("NFKC")
    .toLowerCase();

  const normalizedSlug = withoutExtension
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/[-_.]{2,}/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "");
  const truncated = normalizedSlug.slice(0, MAX_PDF_FILE_NAME_LEN);
  const lastDashIndex = truncated.lastIndexOf("-");
  const slug =
    normalizedSlug.length > MAX_PDF_FILE_NAME_LEN && lastDashIndex > 0
      ? truncated.slice(0, lastDashIndex)
      : truncated;

  if (!slug) return null;
  return `${slug}.pdf`;
}
