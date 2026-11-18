// Only published entries are shown anywhere on the site, the dev server
// included. Set `draft: true` in a post or project to keep it hidden.
export function isVisible(entry: { data: { draft?: boolean } }): boolean {
  return !entry.data.draft;
}
