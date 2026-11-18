---
title: "Late interaction for visual RAG"
description: "RAG over PDFs that indexes whole pages as images with ColPali-style models, so charts, tables and layout count as much as the text."
date: "August 2025"
repoURL: "https://github.com/logxdx/contextualized-late-interation-with-pdfs"
# demoURL: ""
category: "RAG · Vision"
areas: [rag, knowledge]
tags: ["Late interaction", "ColQwen", "Qdrant", "LiteLLM", "Streamlit"]
featured: true
---

This is a RAG pipeline for PDFs that looks at pages the way a person does. Text-only RAG pulls the text out of a PDF and loses the charts, diagrams, tables and layout. Here every page is indexed as an image, so those count too.

The pages are embedded with late-interaction vision models: ColPali, ColQwen or ColSmol. A late-interaction model keeps many vectors per page, one for each small patch, and scores a query by matching every query token against its best patch. That's very accurate, but comparing all those vectors for every page is slow.

So retrieval runs in two stages. First, Qdrant does a fast search over pooled embeddings, one small summary vector per page, to prefetch a shortlist. Then the full multi-vector late-interaction score reranks only that shortlist. Together with batched GPU ingestion and scalar quantization, this cut retrieval time by up to 13x.

The best pages go straight to the LLM as images, so the answer can use the chart or table itself and not just its caption. Any local or hosted model works through LiteLLM.

A small Streamlit app ties it together. You upload a batch of PDFs, it indexes them, and you ask questions.
