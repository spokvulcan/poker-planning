import type { MDXComponents } from "mdx/types";
import Link from "next/link";
import Image from "next/image";
import type { ComponentProps, HTMLAttributes, ReactNode } from "react";
import { Lightbulb, ArrowRight, HelpCircle, ChevronDown } from "lucide-react";
import { START_ESTIMATING } from "@/lib/site-copy";

// Wrapper for code blocks with syntax highlighting (handled by rehype-pretty-code)
function Pre({ children, ...props }: HTMLAttributes<HTMLPreElement>) {
  return (
    <pre
      className="overflow-x-auto rounded-lg border border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-900 px-3 py-4 text-sm my-6"
      {...props}
    >
      {children}
    </pre>
  );
}

function Code({
  children,
  ...props
}: HTMLAttributes<HTMLElement> & { "data-language"?: string }) {
  // Check if this is inline code (not in a pre block)
  // Inline code is single-line and doesn't have data-language
  const hasLanguage = !!props["data-language"];
  const isMultiline =
    typeof children === "string" && children.includes("\n");

  // Only apply inline styling for single-line code without a language
  if (!hasLanguage && !isMultiline) {
    return (
      <code
        className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-zinc-800 text-sm font-mono text-primary"
        {...props}
      >
        {children}
      </code>
    );
  }
  // Code inside pre block (with or without syntax highlighting)
  return <code {...props}>{children}</code>;
}

function Anchor({
  href,
  children,
  ...props
}: ComponentProps<"a"> & { href?: string }) {
  if (href?.startsWith("/")) {
    return (
      <Link
        href={href}
        className="text-primary underline underline-offset-4 hover:text-primary/80"
        {...props}
      >
        {children}
      </Link>
    );
  }
  if (href?.startsWith("#")) {
    return (
      <a
        href={href}
        className="text-primary underline underline-offset-4 hover:text-primary/80"
        {...props}
      >
        {children}
      </a>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline underline-offset-4 hover:text-primary/80"
      {...props}
    >
      {children}
    </a>
  );
}

function Img({
  src,
  alt,
  ...props
}: ComponentProps<"img"> & { src?: string; alt?: string }) {
  if (!src) return null;

  // Check if it's a local image (relative path or simple filename)
  const isLocalImage =
    src.startsWith("./") ||
    (!src.startsWith("http") && !src.startsWith("/") && !src.includes("://"));

  if (isLocalImage) {
    // Security: block path traversal and protocol-like patterns
    if (src.includes("..") || src.includes("//") || /^[a-z]+:/i.test(src)) {
      console.warn(`Blocked potentially unsafe image src: ${src}`);
      return null;
    }

    // Sanitize alt text to prevent XSS
    const sanitizedAlt = alt?.replace(/[<>"'&]/g, "") || "";

    return (
      <span className="block my-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={sanitizedAlt}
          className="rounded-lg max-w-full h-auto mx-auto"
          loading="lazy"
          {...props}
        />
      </span>
    );
  }

  // For external images or absolute paths - use Next.js Image
  return (
    <span className="block my-6">
      <Image
        src={src}
        alt={alt || ""}
        width={800}
        height={450}
        className="rounded-lg max-w-full h-auto mx-auto"
      />
    </span>
  );
}

function Blockquote({ children, ...props }: HTMLAttributes<HTMLQuoteElement>) {
  return (
    <blockquote
      className="border-l-4 border-primary pl-4 italic text-muted-foreground my-6"
      {...props}
    >
      {children}
    </blockquote>
  );
}

function Table({ children, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto my-6">
      <table
        className="w-full border-collapse text-sm"
        {...props}
      >
        {children}
      </table>
    </div>
  );
}

function Th({ children, ...props }: HTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className="border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800 px-4 py-2 text-left font-semibold"
      {...props}
    >
      {children}
    </th>
  );
}

function Td({ children, ...props }: HTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className="border border-gray-200 dark:border-zinc-700 px-4 py-2"
      {...props}
    >
      {children}
    </td>
  );
}

// TL;DR summary component for article tops
function Tldr({ children }: { children: ReactNode }) {
  return (
    <div className="my-8 p-6 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
          <Lightbulb className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-200 uppercase tracking-wide mb-2">
            TL;DR
          </h4>
          <div className="text-blue-800 dark:text-blue-100 prose-p:my-2 prose-ul:my-2 prose-li:my-0">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

// CTA component for "Try AgileKit" sections. Every post's CTA promises a
// session in seconds, so it opens the new game form rather than the homepage.
function Cta({
  children,
  href = START_ESTIMATING.href,
  label = "Try AgileKit Free",
}: {
  children?: ReactNode;
  href?: string;
  label?: string;
}) {
  return (
    <div className="my-10 p-8 rounded-xl bg-gradient-to-br from-primary/5 via-purple-500/5 to-blue-500/5 border border-primary/20 text-center">
      {children && (
        <div className="mb-4 text-gray-700 dark:text-gray-300">{children}</div>
      )}
      <Link
        href={href}
        className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
      >
        {label}
        <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  );
}

// FAQ components with schema support
interface FaqItemProps {
  question: string;
  children: ReactNode;
}

function FaqItem({ question, children }: FaqItemProps) {
  return (
    <details className="group">
      <summary className="flex items-center justify-between gap-4 px-4 py-3 cursor-pointer list-none text-left font-medium text-gray-900 dark:text-white hover:text-primary transition-colors">
        <span className="flex items-center gap-3">
          <HelpCircle className="w-5 h-5 text-primary flex-shrink-0" />
          {question}
        </span>
        <ChevronDown className="w-5 h-5 text-gray-400 transition-transform group-open:rotate-180 flex-shrink-0" />
      </summary>
      <div className="px-4 pb-3 pl-12 text-gray-600 dark:text-gray-400 [&>p]:my-0">
        {children}
      </div>
    </details>
  );
}

interface FaqProps {
  children: ReactNode;
  items?: Array<{ question: string; answer: string }>;
}

function Faq({ children, items }: FaqProps) {
  // Generate FAQ schema for SEO
  const schemaItems = items || [];
  const schema = schemaItems.length > 0 ? {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: schemaItems.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  } : null;

  return (
    <div className="my-6 not-prose">
      <div className="rounded-xl border border-gray-200 dark:border-zinc-800 divide-y divide-gray-200 dark:divide-zinc-800">
        {children}
      </div>
      {schema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      )}
    </div>
  );
}

export const mdxComponents: MDXComponents = {
  // Headings with anchor links (handled by rehype-slug and rehype-autolink-headings)
  h1: ({ children, ...props }) => (
    <h1
      className="text-3xl font-bold mt-10 mb-4 scroll-mt-24"
      {...props}
    >
      {children}
    </h1>
  ),
  h2: ({ children, ...props }) => (
    <h2
      className="text-2xl font-semibold mt-10 mb-4 scroll-mt-24 border-b border-gray-200 dark:border-zinc-800 pb-2"
      {...props}
    >
      {children}
    </h2>
  ),
  h3: ({ children, ...props }) => (
    <h3
      className="text-xl font-semibold mt-8 mb-3 scroll-mt-24"
      {...props}
    >
      {children}
    </h3>
  ),
  h4: ({ children, ...props }) => (
    <h4
      className="text-lg font-semibold mt-6 mb-2 scroll-mt-24"
      {...props}
    >
      {children}
    </h4>
  ),

  // Paragraphs
  p: ({ children, ...props }) => (
    <p className="leading-7 my-4" {...props}>
      {children}
    </p>
  ),

  // Lists
  ul: ({ children, ...props }) => (
    <ul className="list-disc pl-6 my-4 space-y-2" {...props}>
      {children}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol className="list-decimal pl-6 my-4 space-y-2" {...props}>
      {children}
    </ol>
  ),
  li: ({ children, ...props }) => (
    <li className="leading-7" {...props}>
      {children}
    </li>
  ),

  // Code
  pre: Pre,
  code: Code,

  // Links
  a: Anchor,

  // Images
  img: Img,

  // Blockquotes
  blockquote: Blockquote,

  // Tables
  table: Table,
  th: Th,
  td: Td,

  // Horizontal rule
  hr: (props) => (
    <hr className="my-8 border-gray-200 dark:border-zinc-800" {...props} />
  ),

  // Strong/Bold
  strong: ({ children, ...props }) => (
    <strong className="font-semibold" {...props}>
      {children}
    </strong>
  ),

  // Emphasis/Italic
  em: ({ children, ...props }) => (
    <em className="italic" {...props}>
      {children}
    </em>
  ),

  // Custom components for SEO and content structure
  Tldr,
  Cta,
  Faq,
  FaqItem,
};
