import type { Site, Metadata, Socials } from "@types";

export const SITE: Site = {
  NAME: "Karan Deo Burnwal",
  EMAIL: "logxdx158@gmail.com",
  NUM_POSTS_ON_HOMEPAGE: 2,
  NUM_WORKS_ON_HOMEPAGE: 2,
  NUM_PROJECTS_ON_HOMEPAGE: 2,
};

export const HOME: Metadata = {
  TITLE: "Home",
  DESCRIPTION: "Karan's personal website.",
};

export const BLOG: Metadata = {
  TITLE: "Thoughts",
  DESCRIPTION: "Articulation of my mind",
};

export const WORK: Metadata = {
  TITLE: "Work",
  DESCRIPTION: "Where I have worked and what I have done.",
};

export const PROJECTS: Metadata = {
  TITLE: "Projects",
  DESCRIPTION: "A collection of my projects, with links to repositories and demos.",
};

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
