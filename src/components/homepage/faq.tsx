import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { FAQ as COPY } from "./copy";

export function FAQ() {
  return (
    <section id="faq" className="bg-gray-50/50 dark:bg-zinc-900/10 py-24 sm:py-32">
      <div className="mx-auto max-w-[90rem] px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 lg:gap-24">
          <div className="lg:col-span-5">
            <h2 className="text-sm font-bold tracking-widest text-primary uppercase mb-4">
              {COPY.eyebrow}
            </h2>
            <h3 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tighter text-gray-900 dark:text-white leading-[1.1] mb-6">
              {COPY.heading}<br />{COPY.headingMuted}
            </h3>
            <p className="text-lg sm:text-xl text-gray-600 dark:text-gray-400 font-light mb-8">
              {COPY.description}
            </p>
            <div className="p-8 bg-white dark:bg-black rounded-3xl border border-gray-200/50 dark:border-zinc-800/50">
              <p className="text-base text-gray-900 dark:text-gray-100 font-medium mb-2">{COPY.stillQuestions}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">{COPY.reachOut}</p>
              <a href={COPY.github.href} target="_blank" rel="noopener noreferrer" className="inline-flex h-12 items-center justify-center gap-2 bg-gray-100 dark:bg-zinc-800 px-6 text-sm font-medium text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors rounded-xl">
                {COPY.github.label}
              </a>
            </div>
          </div>

          <div className="lg:col-span-7">
            <div className="bg-white dark:bg-black rounded-3xl p-4 sm:p-8 border border-gray-200/50 dark:border-zinc-800/50">
              <Accordion className="w-full">
                {COPY.items.map((faq, index) => (
                  <AccordionItem
                    key={faq.question}
                    value={`item-${index}`}
                    className="border-b border-gray-100 dark:border-zinc-900 last:border-0 px-2 sm:px-4"
                  >
                    <AccordionTrigger className="text-left text-lg font-bold tracking-tight text-gray-900 dark:text-white hover:no-underline py-6">
                      {faq.question}
                    </AccordionTrigger>
                    <AccordionContent className="text-base text-gray-600 dark:text-gray-400 font-light leading-relaxed pb-6">
                      {faq.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
