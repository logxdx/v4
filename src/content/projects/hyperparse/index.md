---
title: "hyperparse"
short: "hyperparse"
description: "A GPU PDF parser in C++ and CUDA that turns everyday documents into layout, text, LaTeX formulas, tables and Markdown at about 16 pages per second."
date: "2026-11-19"
repoURL: "https://github.com/logxdx/hyperparse"
category: "Document AI · CUDA"
areas: [rag]
tags: ["C++", "CUDA", "TensorRT", "PDFium", "PP-OCRv6", "D-FINE"]
featured: false
---

hyperparse is a PDF parser that runs on one consumer GPU. It handles common document types, like reports, papers and scanned pages, and turns them into layout regions, text lines, LaTeX formulas, tables and Markdown.

Hosted document-parsing APIs are expensive, and the open-source pipelines usually assume a big GPU and a Python stack. I wanted a professional-grade pipeline that fits a 6 GB laptop GPU, so it's C++ and CUDA end to end with TensorRT for every model.

## What it produces

Each page gets 12 kinds of layout region, such as text, title, table, picture, formula, caption, code and stamp, along with their reading order. Text comes from the PDF's own text layer when it's usable, and from OCR where it isn't.

Display formulas come out as LaTeX, and tables as Markdown pipe tables built from where their text sits. There's Markdown per page and for the whole document. It runs as a CLI or as an HTTP server with a queue, streaming results, metrics and health checks.

## Benchmarks

Measured on a 6 GB laptop GPU:

| Set | Pages | Throughput | Notes |
|---|---|---|---|
| Scanned documents (IDL) | 751 | 16.5 pages/s | word F1 of 0.894 against AWS Textract's OCR of the same pages |
| Scientific papers | 60 | 13.7 pages/s | 98 formulas |
| Mixed documents | 100 | 12.2 pages/s | 118 formulas |

With all the models loaded it uses about 3 GB of GPU memory. The models unload after an idle timeout and reload on the next request in about 0.6 s.

## Text layer first

Most born-digital PDFs already contain correct text, so running OCR on them is wasted work. Each page is routed one of three ways: native text, partial OCR for the regions that need it, or full OCR.

Only the pages that need pixels get rendered. Skipping OCR where it isn't needed is the biggest speed-up in the whole pipeline. The routing and the recovery of broken glyphs are ported from liteparse.

## Pipeline

```text
PDF bytes
  -> page workers (processes running PDFium)                       CPU
       text layer + glyph recovery -> route: native | partial | full OCR
       render only the pages that need pixels -> shared-memory ring
  -> GPU pipeline (TensorRT FP16, CUDA streams)                     GPU
       D-FINE layout, PP-OCR detection + recognition, PP-FormulaNet-S
       assembly: reading order, LaTeX formulas, table grids, Markdown
  -> per-page results, streamed as they finish
```

The layout model is D-FINE, which takes about 14 ms per page at 960 by 960 in FP16. OCR uses PP-OCRv6 small and formulas use PP-FormulaNet-S, both small enough to fit next to the layout model in 6 GB.

Resizing, crop batching and preprocessing all run as CUDA kernels, and text recognition replays CUDA graphs, so there's no Python anywhere on the hot path.

## Built to stay up

The page workers are separate processes, because PDFium isn't thread-safe. That also isolates crashes. A watchdog times out stuck pages, and one bad page doesn't take down the whole document.

Models load lazily and can unload when idle, giving the GPU back between bursts. Model setup runs in a child process that downloads from Hugging Face, checks SHA-256 hashes and builds the TensorRT engines for the exact GPU it's running on.

hyperparse builds on liteparse, SoMark OXR, PaddleOCR, PDFium and Drogon, and each keeps its own license.
