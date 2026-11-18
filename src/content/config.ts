import { defineCollection, reference, z } from "astro:content";
import { AREA_SLUGS } from "../consts";

const area = z.enum(AREA_SLUGS);

const blog = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    draft: z.boolean().optional(),
    areas: z.array(area).default([]),
    tags: z.array(z.string()).default([]),
  }),
});

const work = defineCollection({
  type: "content",
  schema: z.object({
    company: z.string(),
    role: z.string(),
    dateStart: z.coerce.date(),
    dateEnd: z.union([z.coerce.date(), z.string()]),
  }),
});

const projects = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    draft: z.boolean().optional(),
    demoURL: z.string().optional(),
    repoURL: z.string().optional(),
    // Short label shown above the title on cards, e.g. "RAG · Vision".
    category: z.string().optional(),
    // Focus areas this project belongs to; drives the /projects filter.
    areas: z.array(area).default([]),
    // Stack / technique chips shown on the project page.
    tags: z.array(z.string()).default([]),
    // Pinned to the top of the homepage list.
    featured: z.boolean().default(false),
    // Slug of a blog post that writes this project up (src/content/blog/<slug>).
    // Linked from the project page once the post is published.
    writeup: reference("blog").optional(),
  }),
});

export const collections = { blog, work, projects };
