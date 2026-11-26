---
title: "Startup Finder"
short: "Job search"
description: "Finds recently funded startups hiring for your skills, explains how well each job matches you, and runs locally."
date: "2026-11-24"
repoURL: "https://github.com/logxdx/startup-finder"
category: "Web Scraping · Job Search"
areas: [tools]
tags: ["Python", "FastAPI", "SQLite", "crawl4ai", "httpx", "Jinja2"]
featured: false
---

Startup Finder is a local job-search tool. It finds startups that were funded or launched recently and are hiring, then shows how well each job matches my profile and why. It runs on one machine with no account, as a FastAPI web UI and a CLI over one SQLite file.

It is a Python port of Sakshi Gaikwad's startup-finder (MIT), rebuilt as a standalone local app with crawlberg and crawl4ai as scraping backends.

## Sources

A discovery run reads public sources in order, then an enricher visits startup websites for their careers pages, jobs and public emails on the startup's own domain. The funding feeds include TechCrunch, Inc42, YourStory and Crunchbase News. A first run takes about 5 to 10 minutes.

| Source | What it reads | Merge priority |
|---|---|---|
| YC directory | Up to 60 company pages | 4 |
| Product Hunt | Up to 100 launches from the last 90 days | 2 |
| Himalayas | Remote jobs | 2 |
| Web search | Up to 8 job queries over Greenhouse, Lever and Ashby boards | 2 |
| Funding news | 8 RSS feeds | 1 |
| Company websites | Up to 25 sites | 3 |

The web search turns my profile into up to 8 job queries and sends each one down a chain of providers: TinyFish, then LangSearch, then Exa. A provider that errors or finds no job board hands the query to the next, so the paid one is used only when both free ones fail. Each board it finds is then read through the job board's public API.

## Fetching

All fetching goes through one layer. It respects robots.txt, waits at least 1.5 s between requests to the same host, and keeps a disk cache whose stale copy is reused when the network fails.

HTML pages go through my fork of crawlberg or through crawl4ai, which reads pages in a hidden browser and adds about 130 MB to the install. JSON APIs and RSS feeds go through httpx. A failing source is logged and the run continues.

## Merging companies

The store merges every report about the same company into one row. It matches companies by domain, then LinkedIn URL, then normalised name, and a higher-priority source wins field by field.

For funding, the 12 most recent reports are kept. A confirmed round beats a planned or rumoured one, the earliest announcement date is kept, and conflicting amounts or rounds are recorded.

Only startups with a recent signal are kept: funded within 90 days, in a YC batch from this year, or a Product Hunt launch with 100+ upvotes. Jobs older than 7 days are skipped. News feeds keep only their latest articles, so a daily run builds up 30 to 90 days of history.

## Matching and scoring

Matching is computed on read, so a profile edit applies straight away. Each job gets a score out of 100:

| Part | Max points |
|---|---|
| Role | 40 |
| Skills | 30 |
| Location | 20 |
| Experience | 10 |

A score of 65 or more is a strong match and 40 or more a potential one, with caps for a location outside my list or a job that is too senior. A job that names no known skill gets 12 of the 30 skill points.

Every score keeps its notes, the matched and missing skills, and the reason for any cap, so the UI can explain each match.

## Profile and tracking

The profile can be filled in by uploading a résumé PDF, which suggests skills, roles, locations and years of experience. Jobs and companies can be tracked through application statuses, and every shown job exports to CSV.
