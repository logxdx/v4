---
# Starter post. `draft: true` keeps it out of the site, the RSS feed and the homepage.
# Flip it to false (or delete the line) once it's written.
title: "Late interaction for PDF RAG: what 13x faster retrieval actually cost"
description: "Indexing PDF pages as images with ColQwen, and the prefetch + rerank trick that made it usable."
date: "2026-11-18"
draft: true
# Any of: rag, agents, knowledge, decision, rl, fine-tuning
areas: [rag, knowledge]
tags: ["ColQwen", "Qdrant", "Late interaction"]
---

<!--
  Suggested shape for posts (borrowed from good case studies):
  1. The problem, in one paragraph, with a concrete failing example.
  2. What you tried first and why it broke.
  3. What worked, with the one diagram or table that explains it.
  4. The numbers: before/after, and how you measured.
  5. What you'd do differently / open questions.
-->

## The problem

Text-only chunking loses tables, charts and layout. Show one PDF page where it fails.

## Why late interaction

ColPali-style multi-vector embeddings per page patch; MaxSim scoring. One diagram.

## Making it fast enough

Pooled-embedding prefetch in Qdrant, then full multi-vector rerank; scalar quantization.

## Results

| Setup | Latency | Recall@5 |
| --- | --- | --- |
| Full multi-vector search | TODO | TODO |
| Prefetch + rerank | TODO | TODO |

## What I'd change

TODO
