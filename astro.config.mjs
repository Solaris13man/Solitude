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
      // Keep noindex utility pages out of the sitemap so we don't send Google
      // the mixed signal of "index this" (sitemap) + "don't" (robots meta).
      filter: (page) =>
        !['/account/', '/profile/', '/404/'].some((p) => page.endsWith(p)),
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
