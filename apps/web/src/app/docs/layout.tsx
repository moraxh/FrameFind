"use client";

import { FrameworkProvider } from "fumadocs-core/framework";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { useParams, usePathname, useRouter } from "next/navigation";
import { baseOptions } from "@/lib/layout.shared";
import { source } from "@/lib/source";

import "./docs.css";

export default function Layout({ children }: LayoutProps<"/docs">) {
  return (
    <FrameworkProvider
      usePathname={usePathname}
      useParams={useParams}
      useRouter={useRouter}
    >
      <DocsLayout tree={source.getPageTree()} {...baseOptions()}>
        {children}
      </DocsLayout>
    </FrameworkProvider>
  );
}
