import { SITE_ORIGIN } from "@/lib/site-config";
import { WEB_APPLICATION, FAQ_SCHEMA } from "./copy";

// A raster logo: Google reads Organization logos of at least 112x112px.
const logoUrl = `${SITE_ORIGIN}/logo-512.png`;

// Google retired HowTo rich results in 2023, so the homepage carries no
// HowTo schema: markup is kept only where it describes the page for a
// search feature that still reads it.

/**
 * The site's name for search results. Google reads it from the homepage's
 * WebSite markup when it chooses the name shown above a result.
 */
export function WebSiteSchema() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "AgileKit",
    url: `${SITE_ORIGIN}/`,
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

export function WebApplicationSchema() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: WEB_APPLICATION.name,
    applicationCategory: "BusinessApplication",
    operatingSystem: "All",
    offers: {
      "@type": "Offer",
      price: "0.00",
      priceCurrency: "USD",
    },
    description: WEB_APPLICATION.description,
    url: SITE_ORIGIN,
    author: {
      "@type": "Organization",
      name: "AgileKit",
      url: "https://github.com/spokvulcan/poker-planning",
    },
    screenshot: `${SITE_ORIGIN}/og-image.png`,
    featureList: WEB_APPLICATION.featureList,
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

export function OrganizationSchema() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "AgileKit",
    url: SITE_ORIGIN,
    logo: logoUrl,
    sameAs: ["https://github.com/spokvulcan/poker-planning"],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

export function FAQSchema() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_SCHEMA.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

export function BreadcrumbSchema({
  items,
}: {
  items: { name: string; url: string }[];
}) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

interface BlogPostingSchemaProps {
  title: string;
  description: string;
  datePublished: string;
  dateModified?: string;
  slug: string;
  wordCount?: number;
}

export function BlogPostingSchema({
  title,
  description,
  datePublished,
  dateModified,
  slug,
  wordCount,
}: BlogPostingSchemaProps) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: title,
    description: description,
    datePublished: datePublished,
    dateModified: dateModified || datePublished,
    author: {
      "@type": "Organization",
      name: "AgileKit",
      url: SITE_ORIGIN,
    },
    publisher: {
      "@type": "Organization",
      name: "AgileKit",
      logo: {
        "@type": "ImageObject",
        url: logoUrl,
      },
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${SITE_ORIGIN}/blog/${slug}`,
    },
    // The post's social card; posts have no image of their own since the
    // per-post opengraph-image route was removed (#114).
    image: `${SITE_ORIGIN}/og-image.png`,
    ...(wordCount && { wordCount }),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
