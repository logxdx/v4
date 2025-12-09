---
title: "Optimizing Vector Search with Qdrant"
description: "Why we chose Qdrant over Pinecone and PGVector for IntelliPDF."
date: "Nov 20 2025"
---

For **IntelliPDF**, we needed a vector database that was fast, local-first, and capable of handling millions of vectors on consumer hardware. We evaluated three options: **Pinecone**, **PGVector**, and **Qdrant**.

## The Decision Matrix

| Feature | Pinecone | PGVector | Qdrant |
| :--- | :--- | :--- | :--- |
| **Deployment** | Cloud Only | Local / Cloud | Local / Cloud |
| **Performance** | Excellent | Good (IVFFlat) | Excellent (HNSW) |
| **Language** | Proprietary | C / PL/pgSQL | Rust |
| **Quantization** | Closed Source | Limited | Built-in (Binary, Scalar, PQ) |

### Why Not Pinecone?
Pinecone is fantastic, but it's cloud-only. For a privacy-focused tool like IntelliPDF, uploading user PDFs to a third-party cloud was a non-starter.

### Why Not PGVector?
We love Postgres, and keeping data in one place is tempting. However, PGVector's HNSW implementation (at the time) was memory-hungry and slower than dedicated vector engines. It's great for <100k vectors, but we needed to scale further.

### Why Qdrant?
Qdrant hit the sweet spot. It's written in **Rust** (blazing fast), has a native **HNSW** implementation, and most importantly, offers **built-in quantization**.

## The Secret Weapon: Scalar Quantization (INT8)

We achieved a **4x memory reduction** using Scalar Quantization.

We chose **INT8 Scalar Quantization** over **Product Quantization (PQ)**.
- **PQ** compresses vectors more (up to 64x) but destroys spatial relationships, requiring a heavy re-ranking step.
- **INT8** keeps the dimensions intact but maps floats to integers.

This "gentle" compression meant we could keep all vectors in RAM on a standard 16GB laptop while maintaining 99% retrieval accuracy, avoiding the disk I/O penalty that kills search latency.
