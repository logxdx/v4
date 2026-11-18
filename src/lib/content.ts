// Drafts are visible on the dev server (with a "Draft" badge) so they can be
// read in place, and are left out of production builds. RSS always skips them.
export function isVisible(entry: { data: { draft?: boolean } }): boolean {
  return !entry.data.draft || import.meta.env.DEV;
}
