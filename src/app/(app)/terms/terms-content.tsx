"use client";

import {
  Calendar,
  Scale,
  Shield,
  ArrowRight,
} from "lucide-react";

import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";

const sections = [
  {
    id: "scope",
    title: "1. Scope and Acceptance",
    content:
      "These Terms of Service govern your access to and use of the hosted AgileKit website, application, and related services. AgileKit is operated by Bohdan Ivanchenko, a registered Individual Entrepreneur (FOP - Sole Proprietorship) in Ukraine, doing business as AgileKit. These terms form a legal agreement between you and AgileKit. By accessing or using the service, you agree to these terms. If you use the service on behalf of an organization, you represent that you have authority to bind that organization to these terms.",
  },
  {
    id: "operator",
    title: "2. Service Operator and Contact",
    content:
      "AgileKit is the business name for this service and the contracting party referenced in these terms. The service is operated by Bohdan Ivanchenko (the 'Operator'), as further described in Section 1. Business address: Nauky Ave, 86, Dnipro, Dnipropetrovs'ka oblast, 49000, Ukraine. Contact: support@agilekit.app. References to 'AgileKit', 'we', 'us', or 'our' in these terms refer to the Operator doing business as AgileKit.",
  },
  {
    id: "eligibility",
    title: "3. Eligibility and Accounts",
    content:
      "You must be able to form a binding legal agreement to use the service. You are responsible for the accuracy of the information you provide, for maintaining the confidentiality of your account or sign-in methods, and for activity that occurs under your account or guest session.",
  },
  {
    id: "description",
    title: "4. Description of Service",
    content:
      "AgileKit provides a web-based planning poker and estimation tool for Agile teams. Core features are currently available without charge. We may add, change, suspend, or remove features over time, and where reasonably practical we will provide notice before material adverse changes take effect.",
  },
  {
    id: "user-conduct",
    title: "5. User Conduct",
    content:
      "You agree not to use the service to: (a) upload or transmit any content that is unlawful, harmful, threatening, abusive, harassing, defamatory, vulgar, obscene, or otherwise objectionable; (b) impersonate any person or entity; (c) interfere with or disrupt the service or servers; (d) attempt to gain unauthorized access to any portion of the service; (e) use the service for any illegal or unauthorized purpose.",
  },
  {
    id: "content",
    title: "6. User Content and Feedback",
    content:
      "You retain ownership of the content you create or upload to the service. You grant us a limited, non-exclusive, worldwide license to host, process, reproduce, and transmit that content only as needed to operate, secure, and improve the service. If you send us feedback or suggestions, you grant us permission to use that feedback without restriction or compensation.",
  },
  {
    id: "open-source",
    title: "7. Open-Source Code vs. Hosted Service",
    content:
      "The AgileKit source code repository is licensed under the MIT License. That open-source license applies to the code in the repository. It does not replace these terms for the hosted service, and it does not grant rights to our hosted environment, branding, or any third-party services used with the product.",
  },
  {
    id: "privacy",
    title: "8. Privacy and Data Handling",
    content:
      "Your use of the service is also governed by our Privacy Policy, which explains how we collect, use, and protect personal information. If there is a conflict between these terms and the Privacy Policy on a privacy-specific issue, the Privacy Policy controls for that issue.",
  },
  {
    id: "third-party",
    title: "9. Third-Party Services and Integrations",
    content:
      "Some features rely on third-party services or integrations. Your use of those features may also be subject to the third party's terms and privacy notices. We are not responsible for third-party products or services that we do not control, including integrations you choose to connect.",
  },
  {
    id: "billing",
    title: "10. Paid Features and Billing",
    content:
      "If we introduce paid plans, we will disclose pricing, billing frequency, taxes, renewal terms, and refund terms at checkout or in a separate order form. Unless a separate written agreement states otherwise, self-serve purchases include a 30 calendar day money-back guarantee for the initial charge of a new paid plan. Our order process is conducted by our online reseller Paddle.com. Paddle.com is the Merchant of Record for all our orders. Refund requests are handled by Paddle directly — see your order confirmation for the Paddle support link. For general billing questions, contact us at the email in Section 2.",
  },
  {
    id: "disclaimers",
    title: "11. Disclaimer of Warranties",
    content:
      "To the maximum extent permitted by law, the service is provided on an 'as is' and 'as available' basis. We disclaim all warranties, express or implied, including implied warranties of merchantability, fitness for a particular purpose, and non-infringement. We do not guarantee that the service will be uninterrupted, secure, or error-free.",
  },
  {
    id: "liability",
    title: "12. Limitation of Liability",
    content:
      "To the maximum extent permitted by law, we are not liable for indirect, incidental, special, consequential, exemplary, or punitive damages, or for loss of profits, revenue, data, goodwill, or business interruption arising from or related to the service. Our aggregate liability for any claim related to the service will not exceed the greater of (a) the amount you paid us for the service in the 12 months before the claim arose or (b) USD 100.",
  },
  {
    id: "indemnification",
    title: "13. Indemnity",
    content:
      "To the extent permitted by law, you agree to indemnify and hold us harmless from third-party claims, damages, and costs arising out of your unlawful use of the service, your breach of these terms, or your infringement of another person's rights.",
  },
  {
    id: "termination",
    title: "14. Suspension and Termination",
    content:
      "You may stop using the service at any time. We may suspend or terminate access if we reasonably believe it is necessary for security, to prevent abuse, to comply with law, or because you materially breached these terms. We may also discontinue the service, but will try to provide notice where reasonably practical.",
  },
  {
    id: "governing-law",
    title: "15. Governing Law and Mandatory Rights",
    content:
      "These terms are governed by the laws of Ukraine, excluding conflict-of-law rules. Before filing a formal claim, you agree to contact us and try to resolve the dispute informally. If a dispute is not resolved informally, it will be submitted to the competent courts of Ukraine unless mandatory consumer protection law in your jurisdiction requires a different forum or gives you additional non-waivable rights.",
  },
  {
    id: "changes",
    title: "16. Changes to Terms",
    content:
      "We may update these terms from time to time. If we make material changes, we will update the 'Last updated' date and, where required, provide additional notice before the revised terms take effect. By continuing to use the service after the effective date of updated terms, you agree to the revised terms.",
  },
  {
    id: "contact",
    title: "17. Contact Information",
    content:
      "Questions about these terms can be sent to support@agilekit.app. Postal contact: Nauky Ave, 86, Dnipro, Dnipropetrovs'ka oblast, 49000, Ukraine.",
  },
];

export function TermsContent() {
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
                <span>Last updated: February 28, 2026</span>
              </div>

              <h1 className="text-6xl sm:text-7xl lg:text-8xl font-bold tracking-tighter text-gray-900 dark:text-white leading-[0.95]">
                Terms of Service
              </h1>

              <p className="mt-8 text-xl sm:text-2xl leading-relaxed text-gray-600 dark:text-gray-400 max-w-2xl mx-auto font-light">
                Please read these terms carefully before using AgileKit.
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
                    <Scale className="h-5 w-5 text-gray-900 dark:text-white" />
                  </div>
                  <h3 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white mb-3">
                    Questions about our terms?
                  </h3>
                  <p className="text-base font-light leading-relaxed text-gray-600 dark:text-gray-400 mb-6">
                    We believe in transparency and fairness. If you have any questions about these terms, please reach out.
                  </p>
                  <a
                    href="mailto:support@agilekit.app"
                    className="inline-flex items-center text-sm font-bold tracking-wide text-gray-900 dark:text-white hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  >
                    Email support <ArrowRight className="ml-2 h-4 w-4" />
                  </a>
                </div>
                <div className="rounded-3xl bg-white dark:bg-black p-8 sm:p-10 border border-gray-200/50 dark:border-zinc-800/50">
                  <div className="flex h-12 w-12 items-center justify-center bg-gray-50 dark:bg-zinc-900 border border-gray-200/50 dark:border-zinc-800/50 rounded-2xl mb-6">
                    <Shield className="h-5 w-5 text-gray-900 dark:text-white" />
                  </div>
                  <h3 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white mb-3">
                    Open Source License
                  </h3>
                  <p className="text-base font-light leading-relaxed text-gray-600 dark:text-gray-400">
                    The repository source code is MIT licensed. Your use of the hosted AgileKit service is still governed by these terms.
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
