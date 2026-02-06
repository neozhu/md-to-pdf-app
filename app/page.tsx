import { MdDashboard } from "@/components/md/md-dashboard";

export default function Home() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "MD → PDF",
    url: "https://md-to-pdf.blazorserver.com",
    description:
      "Free online Markdown to PDF converter. Edit, preview, and export Markdown documents to PDF instantly.",
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Any",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    featureList: [
      "Markdown editor with syntax highlighting",
      "Live preview",
      "PDF export",
      "Document history",
      "Dark mode support",
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <MdDashboard />
    </>
  );
}
