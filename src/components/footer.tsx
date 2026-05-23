import Link from "next/link";
import Image from "next/image";
import { SVGProps } from "react";

const navigation = {
  product: [
    { name: "Features", href: "/features" },
    { name: "Pricing", href: "/pricing" },
    { name: "How It Works", href: "/#how-it-works" },
    { name: "Use Cases", href: "/#use-cases" },
    { name: "FAQ", href: "/#faq" },
  ],
  company: [
    { name: "About", href: "/about" },
    { name: "Blog", href: "/blog" },
    { name: "Changelog", href: "/changelog" },
    { name: "Open Source", href: "https://github.com/spokvulcan/poker-planning" },
    {
      name: "Contribute",
      href: "https://github.com/spokvulcan/poker-planning/blob/main/CONTRIBUTING.md",
    },
  ],
  legal: [
    { name: "Privacy Policy", href: "/privacy" },
    { name: "Terms of Service", href: "/terms" },
    { name: "Refund Policy", href: "/refund-policy" },
    {
      name: "License",
      href: "https://github.com/spokvulcan/poker-planning/blob/main/LICENSE",
    },
  ],
  social: [
    {
      name: "X",
      href: "https://x.com/spok_vulkan",
      icon: (props: SVGProps<SVGSVGElement>) => (
        <svg fill="currentColor" viewBox="0 0 24 24" {...props}>
          <path d="M13.6823 10.6218L20.2391 3H18.6854L12.9921 9.61788L8.44486 3H3.2002L10.0765 13.0074L3.2002 21H4.75404L10.7663 14.0113L15.5685 21H20.8131L13.6819 10.6218H13.6823ZM11.5541 13.0956L10.8574 12.0991L5.31391 4.16971H7.70053L12.1742 10.5689L12.8709 11.5655L18.6861 19.8835H16.2995L11.5541 13.096V13.0956Z" />
        </svg>
      ),
    },
    {
      name: "GitHub",
      href: "https://github.com/spokvulcan/poker-planning",
      icon: (props: SVGProps<SVGSVGElement>) => (
        <svg fill="currentColor" viewBox="0 0 24 24" {...props}>
          <path
            fillRule="evenodd"
            d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
            clipRule="evenodd"
          />
        </svg>
      ),
    },
  ],
};

export const Footer = () => {
  return (
    <footer
      aria-labelledby="footer-heading"
      className="bg-gray-50 dark:bg-black border-t border-gray-200 dark:border-zinc-900"
    >
      <h2 id="footer-heading" className="sr-only">
        Footer
      </h2>
      <div className="mx-auto max-w-7xl px-6 pb-8 pt-16 sm:pt-24 lg:px-8 lg:pt-32">
        <div className="xl:grid xl:grid-cols-3 xl:gap-8">
          <div className="space-y-8">
            <Link href="/" className="flex items-center">
              <Image
                src="/logo.svg"
                alt=""
                width={32}
                height={32}
                className="mr-2"
                aria-hidden="true"
              />
              <span className="text-xl font-bold text-gray-900 dark:text-white">
                AgileKit
              </span>
            </Link>
            <p className="text-sm leading-6 text-gray-600 dark:text-gray-300">
              The free, open-source planning poker tool for Agile teams. Improve
              your sprint planning and estimation accuracy.
            </p>
            <div className="flex space-x-6">
              {navigation.social.map((item) => (
                <a
                  key={item.name}
                  href={item.href}
                  data-testid={item.name === "GitHub" ? "hero-github-link" : undefined}
                  className="text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span className="sr-only">{item.name}</span>
                  <item.icon aria-hidden="true" className="h-6 w-6" />
                </a>
              ))}
            </div>
          </div>
          <div className="mt-16 grid grid-cols-2 gap-8 xl:col-span-2 xl:mt-0">
            <div className="md:grid md:grid-cols-2 md:gap-8">
              <div>
                <h3 className="text-sm font-semibold leading-6 text-gray-900 dark:text-white">
                  Product
                </h3>
                <ul className="mt-6 space-y-4">
                  {navigation.product.map((item) => (
                    <li key={item.name}>
                      {item.href.startsWith("http") ? (
                        <a
                          href={item.href}
                          className="text-sm leading-6 text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {item.name}
                        </a>
                      ) : item.href.startsWith("/#") ? (
                        <a
                          href={item.href}
                          className="text-sm leading-6 text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white cursor-pointer"
                        >
                          {item.name}
                        </a>
                      ) : (
                        <Link
                          href={item.href}
                          className="text-sm leading-6 text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
                        >
                          {item.name}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-10 md:mt-0">
                <h3 className="text-sm font-semibold leading-6 text-gray-900 dark:text-white">
                  Company
                </h3>
                <ul className="mt-6 space-y-4">
                  {navigation.company.map((item) => (
                    <li key={item.name}>
                      {item.href.startsWith("http") ? (
                        <a
                          href={item.href}
                          className="text-sm leading-6 text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {item.name}
                        </a>
                      ) : (
                        <Link
                          href={item.href}
                          className="text-sm leading-6 text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
                        >
                          {item.name}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold leading-6 text-gray-900 dark:text-white">
                Legal
              </h3>
              <ul className="mt-6 space-y-4">
                {navigation.legal.map((item) => (
                  <li key={item.name}>
                    {item.href.startsWith("http") ? (
                      <a
                        href={item.href}
                        className="text-sm leading-6 text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {item.name}
                      </a>
                    ) : (
                      <Link
                        href={item.href}
                        className="text-sm leading-6 text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
                      >
                        {item.name}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
        <div className="mt-16 border-t border-gray-900/10 dark:border-gray-700 pt-8 sm:mt-20 lg:mt-24">
          <p className="text-xs leading-5 text-gray-500 dark:text-gray-400">
            &copy; {new Date().getFullYear()} AgileKit. Open source
            under MIT License. Operated by Bohdan Ivanchenko.
          </p>
        </div>
      </div>
    </footer>
  );
};
