"use client";

import Link from "next/link";
import React from "react";

interface BreadcrumbPath {
  name: string;
  href: string;
}

interface StickyHeaderProps {
  header: string;
  paths?: BreadcrumbPath[];
}

export default function StickyHeader({ header, paths }: StickyHeaderProps) {
  return (
    <div className="sticky top-0 z-40 bg-gradient-to-b from-gray-50 via-gray-50/60 to-transparent pb-8 pt-8 backdrop-blur-xs dark:from-zinc-950 dark:via-zinc-950/60">
      <div className="flex justify-between items-end">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
        {header}
      </h1>
        {paths && paths.length > 0 && (
        <nav className="mb-3">
          <ol className="flex flex-wrap items-center gap-1.5 text-sm">
            <li>
              <Link
                className="inline-flex items-center gap-1.5 text-gray-500 transition-colors hover:text-gray-800 dark:text-gray-400 dark:hover:text-white/90"
                href="/"
              >
                Home
              </Link>
            </li>

            <span className="text-gray-400 dark:text-zinc-600">
              <svg width="12" height="12" viewBox="0 0 17 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="stroke-current" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6.0765 12.667L10.2432 8.50033L6.0765 4.33366" />
              </svg>
            </span>

            {paths.map((path, index) => (
              <React.Fragment key={index}>
                <li>
                  <Link
                    className="inline-flex items-center gap-1.5 text-gray-500 transition-colors hover:text-gray-800 dark:text-gray-400 dark:hover:text-white/90"
                    href={path.href}
                  >
                    {path.name}
                  </Link>
                </li>
                <span className="text-gray-400 dark:text-zinc-600">
                  <svg width="12" height="12" viewBox="0 0 17 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="stroke-current" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6.0765 12.667L10.2432 8.50033L6.0765 4.33366" />
                  </svg>
                </span>
              </React.Fragment>
            ))}

            <li className="font-medium text-gray-800 dark:text-white/90 truncate max-w-[200px]">
              {header}
            </li>
          </ol>
        </nav>
      )}
      </div>
      
    </div>
  );
}