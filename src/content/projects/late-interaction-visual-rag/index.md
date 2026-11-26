---
title: "Late interaction for visual RAG"
short: "Late interaction RAG"
description: "RAG over PDFs that indexes whole pages as images with ColPali-style models, so charts, tables and layout count as much as the text."
date: "August 2025"
repoURL: "https://github.com/logxdx/contextualized-late-interation-with-pdfs"
# demoURL: ""
category: "RAG · Vision"
areas: [rag]
tags: ["Late interaction", "ColPali", "ColQwen", "Qdrant", "LiteLLM", "Streamlit"]
featured: true
---

This is a RAG pipeline for PDFs that looks at pages the way a person does. Text-only RAG pulls the text out of a PDF and loses the charts, diagrams, tables and layout. Here every page is indexed as an image, so those count too.

## Pipeline

```text
index:   PDF → page images (100 dpi) → ColPali / ColQwen / ColSmol
               → patch vectors → pool by rows and by columns
               → Qdrant: original + 2 pooled multi-vectors per page

query:   question → query token vectors
               → prefetch on pooled vectors (rows, columns)
               → rerank shortlist on original vectors (MaxSim)
               → top pages as images → vision LLM → answer
```

The pages are embedded with late-interaction vision models from the ColPali family. The code supports five of them, ColPali, ColQwen2, ColQwen2.5, ColSmol-256M and ColSmol-500M, loaded in bf16. Each PDF is first turned into page images at 100 dpi.

## Late interaction scoring

A late-interaction model keeps one 128-dimensional vector per image patch, so a page becomes a grid of hundreds of vectors instead of a single one. A query is also kept as one vector per token.

The score between a query and a page is called MaxSim. For every query token you find the page patch it matches best, and you add those best matches up:

$$
s(q, d) = \sum_{i} \max_{j} \; q_i \cdot d_j
$$

This is very accurate, because each word in the question can find its own spot on the page. But comparing every query token with every patch of every page is slow.

## Pooled vectors in Qdrant

To make search cheaper, I store two smaller versions of each page next to the full one. The patch vectors are laid out on the image grid, and I average them along the rows and along the columns. Averaging down the rows gives one vector per column, and averaging across the columns gives one vector per row. The model's special tokens around the image are kept as they are.

| Vector field in Qdrant | What it holds | Used for |
| --- | --- | --- |
| `original` | every patch vector of the page | final rerank |
| `mean_pooling_rows` | patches averaged down the rows, one vector per column | prefetch |
| `mean_pooling_columns` | patches averaged across the columns, one vector per row | prefetch |

All three are multi-vector fields compared with MaxSim. They use int8 scalar quantization at the 0.99 quantile and live on disk. The `original` field has its HNSW graph switched off, because it's never searched directly. It's only used to rerank a short list.

## Two-stage search

A search runs in two stages inside one Qdrant query. The two pooled fields each prefetch candidate pages. Then only those candidates are rescored with the full patch vectors.

```python
models.QueryRequest(
    query=query,                      # one vector per query token
    prefetch=[
        models.Prefetch(query=query, limit=prefetch_limit, using="mean_pooling_rows"),
        models.Prefetch(query=query, limit=prefetch_limit, using="mean_pooling_columns"),
    ],
    limit=top_k,
    using="original",                 # full MaxSim rerank on the shortlist
)
```

By default each pooled field prefetches 10 pages, and the rerank keeps the top 2. The pooled fields hold a few dozen vectors per page instead of hundreds or even a thousand, so the first stage is cheap. The full comparison only runs on a handful of pages.

Together with batched GPU indexing and the quantization, this cut retrieval time by up to 13x. The cost is extra storage for the two pooled fields.

## Answers and the app

For the answer, the top pages go straight to a vision LLM as JPEG images, together with the question. The prompt tells the model to answer only from what's on those pages, so it can read the chart or table itself as well as its caption. Any local or hosted model works through LiteLLM, with gemma3 on a local Ollama endpoint as the default.

A small Streamlit app ties it together. One tab indexes PDFs, either a folder or uploaded files. The other takes a question and shows the answer with previews of the pages it used. Sliders set the number of pages to return, from 1 to 10, and the prefetch limit, from 1 to 50.
