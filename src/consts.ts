import type { Site, Metadata, Socials, FocusArea } from "@types";

export const SITE: Site = {
  NAME: "Karan Deo Burnwal",
  EMAIL: "logxdx158@gmail.com",
  NUM_POSTS_ON_HOMEPAGE: 2,
  NUM_WORKS_ON_HOMEPAGE: 2,
  NUM_PROJECTS_ON_HOMEPAGE: 3,
};

export const HOME: Metadata = {
  TITLE: "Home",
  DESCRIPTION: "Karan's personal website.",
};

export const BLOG: Metadata = {
  TITLE: "Blog",
  DESCRIPTION: "Notes on retrieval, agents, RL and fine-tuning: what worked, what broke, and why.",
};

export const WORK: Metadata = {
  TITLE: "Work",
  DESCRIPTION: "Where I have worked and what I have done.",
};

export const PROJECTS: Metadata = {
  TITLE: "Projects",
  DESCRIPTION: "Things I've built across RAG, agents, knowledge systems and applied ML.",
};

// Slugs that projects and posts list under `areas`; also the /projects?area=<slug> filter.
export const AREA_SLUGS = ["rag", "agents", "decision", "training"] as const;

// The areas I work in, in display order.
export const FOCUS_AREAS: FocusArea[] = [
  {
    slug: "rag",
    title: "RAG & Knowledge Systems",
    short: "RAG & Knowledge",
    blurb: "Search and RAG over real documents, images and media.",
  },
  {
    slug: "agents",
    title: "Agentic Systems",
    short: "Agents",
    blurb: "Agents that plan, call tools and run code safely.",
  },
  {
    slug: "decision",
    title: "Decision Intelligence",
    short: "Decisions",
    blurb: "Small, fast models that make a call and say how sure they are.",
  },
  {
    slug: "training",
    title: "Fine-tuning & RL",
    short: "Fine-tuning & RL",
    blurb: "Adapting open models with SFT, LoRA and reinforcement learning.",
  },
];

export const SOCIALS: Socials = [
  {
    NAME: "github",
    HREF: "https://github.com/logxdx"
  },
  {
    NAME: "linkedin",
    HREF: "https://www.linkedin.com/in/karan-deo",
  },
  {
    NAME: "x",
    HREF: "https://x.com/_Karan_158",
  },
];
