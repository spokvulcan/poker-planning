"use client";

import {
  Calendar,
  Lock,
  Eye,
  ArrowRight,
} from "lucide-react";

import { AnalyticsPreferenceControls } from "@/components/legal/analytics-consent";
import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";

const sections = [
  {
    id: "controller",
    title: "1. Controller and Scope",
    content:
      "This Privacy Policy explains how AgileKit, operated by Bohdan Ivanchenko, an individual entrepreneur in Ukraine doing business as AgileKit ('we', 'us', or 'our'), collects, uses, and protects personal information when you use our website, application, and related services.",
  },
  {
    id: "information-collection",
    title: "2. Information We Collect",
    content:
      "Depending on how you use the service, we may collect: (a) account and profile data, such as display name, email address, authentication identifiers, and avatar image; (b) collaboration data, such as room memberships, issues, votes, session history, and messages or feedback you send us; (c) device and usage data, such as IP address, browser information, page visits, and diagnostic events; and (d) integration data, such as connected Jira account metadata and encrypted OAuth tokens when you connect a third-party integration.",
  },
  {
    id: "cookies",
    title: "3. Cookies and Similar Technologies",
    content:
      "We use strictly necessary cookies and similar technologies for authentication, security, fraud prevention, CSRF protection, and user preferences. We also use an analytics consent cookie to remember your choice. Non-essential analytics tools, such as Google Analytics and Vercel Speed Insights, stay off unless you actively allow them.",
  },
  {
    id: "data-usage",
    title: "4. How We Use Your Information",
    content:
      "We use personal information to provide and secure the service, authenticate users, maintain planning sessions, support collaboration features, send sign-in emails and, unless you opt out, emails about retros and action items in teams you belong to, operate integrations you request, troubleshoot and improve the product, comply with legal obligations, and, where you consent, measure product usage through analytics.",
  },
  {
    id: "legal-bases",
    title: "5. Legal Bases for Processing",
    content:
      "Where laws such as the GDPR or UK GDPR apply, we generally rely on one or more of the following legal bases: performance of a contract or steps taken at your request, our legitimate interests in operating and securing the service, your consent for optional analytics or similar choices, and compliance with legal obligations.",
  },
  {
    id: "sharing",
    title: "6. Sharing and Service Providers",
    content:
      "We may share personal information with service providers that help us operate the product, such as infrastructure, database, authentication, analytics, email delivery, and integration providers. Depending on the features you use, current examples may include Convex, Vercel Speed Insights, Google Analytics, Google sign-in, Resend, and Atlassian. We may also disclose information when required by law, to protect rights and safety, or in connection with a reorganization, sale, or transfer of the service.",
  },
  {
    id: "international-transfers",
    title: "7. International Data Transfers",
    content:
      "We and our service providers may process personal information in countries other than the country where you live. When that happens, we take steps designed to protect the data, such as relying on contractual safeguards, provider transfer mechanisms, or other lawful measures where required by applicable law.",
  },
  {
    id: "data-retention",
    title: "8. Data Retention",
    content:
      "We retain personal information for as long as needed to provide the service, maintain security, comply with legal obligations, resolve disputes, and enforce our agreements. Retention periods vary by data type and feature. You may request deletion of your account data, but we may keep limited records where required for security, fraud prevention, or legal compliance.",
  },
  {
    id: "security",
    title: "9. Security and Automated Decisions",
    content:
      "We use reasonable technical and organizational measures designed to protect personal information, but no system is completely secure. We do not use automated decision-making or profiling that produces legal effects or similarly significant effects on users.",
  },
  {
    id: "rights",
    title: "10. Your Rights and Choices",
    content:
      "Depending on your location, you may have rights to request access, correction, deletion, portability, restriction, objection, or withdrawal of consent. You may also have the right to complain to your local data protection authority. We do not provide a public GitHub workflow for privacy requests because those channels can expose personal data; please use email for privacy-related requests. You can stop retro and action emails from Settings or from the unsubscribe link in any such email.",
  },
  {
    id: "children",
    title: "11. Children's Privacy",
    content:
      "AgileKit is not directed to children. We do not knowingly collect personal information from children under 13, or a higher age where local law requires. If you believe a child has provided personal information to us, please contact us so we can review and delete it where appropriate.",
  },
  {
    id: "changes",
    title: "12. Changes to This Policy",
    content:
      "We may update this Privacy Policy from time to time. If we make material changes, we will update the 'Last updated' date and, where required, provide additional notice or request consent before the changes apply.",
  },
  {
    id: "contact",
    title: "13. Contact Information",
    content:
      "For privacy questions or requests, contact Bohdan Ivanchenko at support@agilekit.app. Postal contact: Nauky Ave, 86, Dnipro, Dnipropetrovs'ka oblast, 49000, Ukraine.",
  },
];

export function PrivacyContent() {
  return (
    <div className="bg-white dark:bg-black min-h-screen selection:bg-primary/10 selection:text-primary">
      <Navbar />

      <main className="relative isolate overflow-hidden bg-white dark:bg-black">
        {/* Hero Section */}
        <section className="relative pt-32 pb-24 sm:pt-40 sm:pb-32 overflow-hidden bg-white dark:bg-black border-b border-gray-200/50 dark:border-zinc-800/50">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#f0f0f0_1px,transparent_1px),linear-gradient(to_bottom,#f0f0f0_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,#18181b_1px,transparent_1px),linear-gradient(to_bottom,#18181b_1px,transparent_1px)] bg-[size:4rem_4rem]"></div>
          
          <div className="mx-auto max-w-[90rem] px-6 lg:px-8 relative z-10">
            <div className="mx-auto max-w-4xl text-center">
              <div className="inline-flex items-center gap-2 mb-8 rounded-full bg-gray-50 dark:bg-zinc-900 border border-gray-200/50 dark:border-zinc-800/50 px-4 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-400">
                <Calendar className="h-4 w-4" />
                <span>Last updated: February 27, 2026</span>
              </div>
              
              <h1 className="text-6xl sm:text-7xl lg:text-8xl font-bold tracking-tighter text-gray-900 dark:text-white leading-[0.95]">
                Privacy Policy
              </h1>
              
              <p className="mt-8 text-xl sm:text-2xl leading-relaxed text-gray-600 dark:text-gray-400 max-w-2xl mx-auto font-light">
                Learn how we collect, use, and protect your information at AgileKit.
              </p>
            </div>
          </div>
        </section>

        {/* Content Section */}
        <section className="py-24 sm:py-32 bg-white dark:bg-black">
          <div className="mx-auto max-w-4xl px-6 lg:px-8">
            <div className="space-y-16">
              {sections.map((section) => (
                <div key={section.id} id={section.id} className="scroll-mt-32">
                  <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-white mb-6">
                    {section.title}
                  </h2>
                  <div className="text-gray-600 dark:text-gray-400 font-light leading-relaxed text-lg">
                    <p>{section.content}</p>
                    {section.id === "rights" ? (
                      <div className="mt-6">
                        <AnalyticsPreferenceControls />
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Contact Section */}
        <section className="py-24 sm:py-32 bg-gray-50/50 dark:bg-zinc-900/10 border-t border-gray-200/50 dark:border-zinc-800/50">
          <div className="mx-auto max-w-[90rem] px-6 lg:px-8">
            <div className="mx-auto max-w-4xl">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="rounded-3xl bg-white dark:bg-black p-8 sm:p-10 border border-gray-200/50 dark:border-zinc-800/50">
                  <div className="flex h-12 w-12 items-center justify-center bg-gray-50 dark:bg-zinc-900 border border-gray-200/50 dark:border-zinc-800/50 rounded-2xl mb-6">
                    <Lock className="h-5 w-5 text-gray-900 dark:text-white" />
                  </div>
                  <h3 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white mb-3">
                    Questions about privacy?
                  </h3>
                  <p className="text-base font-light leading-relaxed text-gray-600 dark:text-gray-400 mb-6">
                    We&apos;re committed to transparency. If you have any questions about how we handle your data, please reach out.
                  </p>
                  <a
                    href="mailto:support@agilekit.app"
                    className="inline-flex items-center text-sm font-bold tracking-wide text-gray-900 dark:text-white hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  >
                    Email privacy contact <ArrowRight className="ml-2 h-4 w-4" />
                  </a>
                </div>
                <div className="rounded-3xl bg-white dark:bg-black p-8 sm:p-10 border border-gray-200/50 dark:border-zinc-800/50">
                  <div className="flex h-12 w-12 items-center justify-center bg-gray-50 dark:bg-zinc-900 border border-gray-200/50 dark:border-zinc-800/50 rounded-2xl mb-6">
                    <Eye className="h-5 w-5 text-gray-900 dark:text-white" />
                  </div>
                  <h3 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white mb-3">
                    Transparency
                  </h3>
                  <p className="text-base font-light leading-relaxed text-gray-600 dark:text-gray-400">
                    Our code is public, but this policy controls how the hosted service handles personal information. When our practices change, we update this page.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
