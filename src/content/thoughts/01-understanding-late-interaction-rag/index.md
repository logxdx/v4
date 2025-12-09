---
title: "Understanding Late Interaction RAG"
description: "Why we chose ColBERT over Bi-Encoders and Cross-Encoders for Converge."
date: "Nov 20 2025"
---

In the world of semantic search, there are two dominant paradigms: **Bi-Encoders** and **Cross-Encoders**. When building **Converge**, we found that neither was quite right. We needed the speed of one and the precision of the other. That's why we bet on **Late Interaction** (ColBERT).

## The Trade-off: Speed vs. Precision

### Bi-Encoders (The Standard)
Most RAG pipelines use Bi-Encoders (like `text-embedding-3-small`). They compress an entire document into a single vector.
- **Pros**: Extremely fast retrieval (Approximate Nearest Neighbor search).
- **Cons**: "Information Bottleneck". A 500-page PDF compressed into 1536 dimensions loses a lot of nuance.

### Cross-Encoders (The Gold Standard)
Cross-Encoders feed the query and the document into the LLM simultaneously.
- **Pros**: Perfect attention mechanism. The model sees every word of the query against every word of the document.
- **Cons**: O(N) complexity at query time. You have to run a full BERT pass for *every* document in your database. It's unscalable for search.

## Enter ColBERT: The "Late Interaction" Compromise

ColBERT (Contextualized Late Interaction over BERT) offers a middle ground. Instead of a single vector, it computes a **bag of embeddings** for the document (one vector per token).

When you search, it does the same for your query. Then, it performs a **MaxSim** operation:
1.  For every token in your query, find the best matching token in the document.
2.  Sum these maximum scores.

### Why We Used It in Converge

For **Converge**, we needed to search through messy, unstructured web data where keywords matter as much as semantic meaning.

- **Token-Level Precision**: If a user searches for "React 19 useOptimistic hook", a Bi-Encoder might just return general React articles. ColBERT ensures the specific tokens `useOptimistic` are present and contextually relevant.
- **Interpretability**: Because the score is a sum of token-pair scores, we can highlight exactly *which* part of the document triggered the match.

The cost is storage—your index grows by ~50x compared to single vectors—but for a local, high-precision search engine, it's the only architecture that makes sense.
