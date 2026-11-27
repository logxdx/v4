import { defineCollection, reference, z } from "astro:content";
import { AREA_SLUGS } from "../consts";

const area = z.enum(AREA_SLUGS);

const blog = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    // Short label for compact link lists (e.g. the homepage focus areas).
    short: z.string().optional(),
    description: z.string(),
    date: z.coerce.date(),
    // Set when a post is substantially revised; shown next to the date.
    updated: z.coerce.date().optional(),
    draft: z.boolean().optional(),
    areas: z.array(area).default([]),
    tags: z.array(z.string()).default([]),
    // Personal experiment write-up; labelled as such on cards and the post.
    experiment: z.boolean().default(false),
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
    // Short label for compact link lists (e.g. the homepage focus areas).
    short: z.string().optional(),
    description: z.string(),
    date: z.coerce.date(),
    // Set when a dated update is added to the page; shown next to the date.
    updated: z.coerce.date().optional(),
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
