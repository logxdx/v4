import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import tailwind from "@astrojs/tailwind";
import react from "@astrojs/react";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeEmphasizeNumbers from "./src/lib/rehype-emphasize-numbers.mjs";

export default defineConfig({
  site: "https://v4-one-theta.vercel.app",
  // The blog used to live at /thoughts.
  redirects: {
    "/thoughts": "/blog",
  },
  markdown: {
    remarkPlugins: [remarkMath],
    rehypePlugins: [rehypeKatex, rehypeEmphasizeNumbers],
  },
  integrations: [
    mdx({
      remarkPlugins: [remarkMath],
      rehypePlugins: [rehypeKatex, rehypeEmphasizeNumbers],
    }),
    sitemap(),
    tailwind(),
    react(),
  ],
});
