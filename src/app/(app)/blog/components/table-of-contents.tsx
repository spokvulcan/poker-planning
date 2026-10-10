"use client";

import { useEffect, useState } from "react";
import type { TocItem } from "../posts";

interface TableOfContentsProps {
  items: TocItem[];
}

export function TableOfContents({ items }: TableOfContentsProps) {
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      {
        rootMargin: "-80px 0px -80% 0px",
        threshold: 0,
      }
    );

    // Observe all headings
    items.forEach((item) => {
      const element = document.getElementById(item.id);
      if (element) {
        observer.observe(element);
      }
    });

    return () => observer.disconnect();
  }, [items]);

  if (items.length === 0) {
    return null;
  }

  return (
    <nav className="sticky top-24 max-h-[calc(100vh-8rem)] flex flex-col">
      <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex-shrink-0">
        On this page
      </h4>
      <ul className="space-y-2.5 text-sm overflow-y-auto pr-2 toc-scrollbar">
        {items.map((item) => (
          <li
            key={item.id}
            style={{ paddingLeft: `${(item.level - 2) * 12}px` }}
          >
            <a
              href={`#${item.id}`}
              className={`block transition-colors ${
                activeId === item.id
                  ? "text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={(e) => {
                // Only handle left clicks, allow middle-click and Ctrl/Cmd+click default behavior
                if (e.button !== 0 || e.metaKey || e.ctrlKey) {
                  return;
                }
                e.preventDefault();
                const element = document.getElementById(item.id);
                if (element) {
                  element.scrollIntoView({ behavior: "smooth" });
                  // Update URL hash without jumping
                  window.history.pushState(null, "", `#${item.id}`);
                }
              }}
            >
              {item.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
