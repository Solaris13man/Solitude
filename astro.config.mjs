// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://cardhearth.com',
  trailingSlash: 'always',
  integrations: [
    sitemap({
      // Keep noindex utility pages out of the sitemap so we don't send Google
      // the mixed signal of "index this" (sitemap) + "don't" (robots meta).
      filter: (page) =>
        !['/account/', '/profile/', '/404/'].some((p) => page.endsWith(p)),
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
