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
export const AREA_SLUGS = ["rag", "agents", "knowledge", "decision", "rl", "fine-tuning"] as const;

// The areas I work in, in display order.
export const FOCUS_AREAS: FocusArea[] = [
  {
    slug: "rag",
    title: "RAG & Retrieval",
    short: "RAG",
    blurb: "Retrieval that holds up on messy, visual, real-world documents, measured and not eyeballed.",
  },
  {
    slug: "agents",
    title: "Agentic Systems",
    short: "Agents",
    blurb: "Agents that plan, call tools, run code and recover when a step fails, inside guardrails.",
  },
  {
    slug: "knowledge",
    title: "Knowledge Systems",
    short: "Knowledge",
    blurb: "Turning scattered docs, images and data into something a model can search and reason over.",
  },
  {
    slug: "decision",
    title: "Decision Intelligence",
    short: "Decisions",
    blurb: "Models and analyses that end in a decision, with the numbers to defend it.",
  },
  {
    slug: "rl",
    title: "Reinforcement Learning",
    short: "RL",
    blurb: "Reward design and policy optimisation, from classic control to RL on language models.",
  },
  {
    slug: "fine-tuning",
    title: "Fine-tuning",
    short: "Fine-tuning",
    blurb: "Adapting open models to a domain with SFT, LoRA and preference tuning, evaluated end to end.",
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
