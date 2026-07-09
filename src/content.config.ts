import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Long-form guides. Frontmatter is the single source of truth for every
// guide's metadata AND its structured data — src/pages/guides/[slug].astro
// generates the JSON-LD (Article / BreadcrumbList / FAQPage / optional HowTo)
// from these fields, so schema can't drift between the page and the markup.
const guides = defineCollection({
  loader: glob({ pattern: '*.mdx', base: './src/content/guides' }),
  schema: z.object({
    title: z.string(), // <title> + meta description pairing
    description: z.string(),
    heading: z.string(), // visible <h1>
    subtitle: z.string().optional(),
    updated: z.string(), // ISO date; kept as a string so schema output is stable
    /** Article schema headline (often the title without the "| CardHearth" suffix). */
    headline: z.string(),
    /** Full URL of the guide's Open Graph / Article image. */
    image: z.string(),
    breadcrumb: z.array(z.object({ name: z.string(), href: z.string() })),
    faq: z.array(z.object({ q: z.string(), a: z.string() })).default([]),
    /** Present on rules guides that carry HowTo structured data. */
    howTo: z
      .object({
        name: z.string(),
        description: z.string(),
        steps: z.array(z.object({ name: z.string(), text: z.string() })),
      })
      .optional(),
    /** Primary call-to-action (usually "play the game this guide is about"). */
    cta: z.object({ href: z.string(), label: z.string() }).optional(),
  }),
});

export const collections = { guides };
