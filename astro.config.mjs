// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';

export default defineConfig({
  site: 'https://cardhearth.com',
  trailingSlash: 'always',
  integrations: [
    mdx(),
    sitemap({
      // Keep noindex pages out of the sitemap so we don't send Google the
      // mixed signal of "index this" (sitemap) + "don't" (robots meta). This
      // covers the utility pages plus the dated Daily Challenge archive
      // (/daily/YYYY-MM-DD/), which is noindexed as thin, near-duplicate
      // content — the /daily-challenge/ hub itself stays indexed.
      filter: (page) =>
        !['/account/', '/profile/', '/404/'].some((p) => page.endsWith(p)) &&
        !/\/daily\/\d{4}-\d{2}-\d{2}\/$/.test(page),
    }),
  ],
  // The guides were authored with straight quotes/apostrophes; SmartyPants
  // (on by default) would silently rewrite them all to curly. Keep it off so
  // the MDX migration changes no visible text. GFM stays on.
  markdown: {
    smartypants: false,
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
