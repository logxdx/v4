---
title: "hyperparse"
short: "hyperparse"
description: "A GPU PDF parser in C++ and CUDA that turns everyday documents into layout, ordered text, LaTeX formulas, tables and Markdown at up to 19 pages per second."
date: "2026-11-26"
repoURL: "https://github.com/logxdx/hyperparse"
category: "Document AI · CUDA"
areas: [rag]
tags: ["C++", "CUDA", "TensorRT", "PDFium", "PP-OCRv6", "D-FINE"]
featured: false
---

hyperparse is a PDF parser that runs on one consumer GPU. It handles common document types, like reports, papers and scanned pages, and turns them into layout regions, text in reading order, LaTeX formulas, tables and Markdown.

Hosted document-parsing APIs are expensive, and the open-source pipelines usually assume a big GPU and a Python stack. I wanted a professional-grade pipeline that fits a 6 GB laptop GPU, so it's C++ and CUDA end to end with TensorRT for every model.

## What it produces

Each page gets 12 kinds of layout region, such as text, title, table, picture, formula, caption, code and stamp. Text comes from the PDF's own text layer when it's usable, and from OCR where it isn't.

A reading-order model sorts the lines and groups them into paragraphs, headings and lists. Tables come out with rows, columns, spanning cells and header rows as HTML inside the Markdown, and display formulas come out as LaTeX. It runs as a CLI or as an HTTP server with a queue, streaming results, metrics and health checks.

## Throughput

Measured on a 6 GB laptop GPU with 8 page workers:

| Set | Pages | Pages/s | Routes (native / partial / full OCR) |
|---|---|---|---|
| Scanned documents (IDL) | 751 | **19.3** | 3 / 4 / 744 |
| Scientific papers | 60 | **15.2** | 14 / 37 / 9 |
| Table pages (OmniDocBench images) | 100 | **14.6** | 0 / 0 / 100 |
| Mixed documents | 100 | **14.0** | 19 / 36 / 45 |
| olmOCR-bench subset | 140 | **12.9** | 21 / 52 / 67 |
| OmniDocBench (~2000 px images) | 100 | **9.9** | 0 / 0 / 100 |

That's up from 16.5, 13.7 and 12.2 pages/s on the scans, papers and mixed sets in the previous version, about 1.1 to 1.2x faster. With all the models loaded it peaks at about 3.4 GB of GPU memory, and after an idle unload the models reload in about 0.6 s.

For comparison, OXR-1.0, a 4B vision-language model, scores much higher on olmOCR-bench (86.1) but runs at 0.05 pages/s. hyperparse does that benchmark at 12.9 pages/s, about 260x faster, at 55.6.

## Accuracy

"Before" is the earlier pipeline, with simple XY-cut reading order and tables built only from where the text sits.

| Benchmark | Before | Now |
|---|---|---|
| olmOCR-bench overall (835 tests) | 49.9 | **55.6** |
| olmOCR-bench reading order | 43.5 | **55.7** |
| olmOCR-bench multi-column | 61.3 | **77.3** |
| olmOCR-bench tables | 53.4 | **72.8** |
| OmniDocBench reading order (Kendall tau) | 0.876 | **0.943** |
| OmniDocBench page text edit distance (lower is better) | 0.450 | **0.402** |
| OmniDocBench table TEDS (135 tables) | 0.480 | **0.658** |

On the 751 scanned pages, OCR reaches a word F1 of 0.894 against AWS Textract's OCR of the same pages. On 300 display formulas, 45.0% match when rendered and compared the way olmOCR-bench does.

On olmOCR-bench, hyperparse at 55.6 is ahead of the CPU pipelines I compared: Indra OCR at 46.9 and LiteParse with OCRia-nano-1 at 49.8.

## Reading order and tables

Two small models made most of that jump. OrderNet, from Indra OCR, is a 0.73M-parameter model that orders a page's text lines and groups them into blocks. It takes about 0.4 ms for 256 lines on the GPU, and 1 to 3 ms per page including decoding and Markdown.

LayoutNet, from OCRia-nano-1, is a 4.3M-parameter table-structure model. It runs only on pages where the layout model finds a table, at about 25 ms per table page.

Both run as FP16 TensorRT engines, which match FP32 on every benchmark above and are faster:

| Model, 1024 lines or units | FP32 | FP16 | Speedup |
|---|---|---|---|
| OrderNet | 3.90 ms | 2.40 ms | 1.6x |
| LayoutNet | 9.50 ms | 6.56 ms | 1.4x |

I tried INT8 too. It made LayoutNet slower and cost 1.4 TEDS points, so FP16 is what ships.

## Text layer first

Most born-digital PDFs already contain correct text, so running OCR on them is wasted work. Each page is routed one of three ways: native text, partial OCR for the regions that need it, or full OCR. The routes column above shows how this plays out, with only 9 of 60 scientific papers' pages needing full OCR.

Reading the text layer and routing a page costs 0.5 to 8 ms. OCR costs 46 to 91 ms per page, on top of 14 to 30 ms to render it, and a native page skips both. The routing and the recovery of broken glyphs are ported from liteparse.

## Pipeline

```text
PDF bytes
  -> page workers (processes running PDFium)                       CPU
       text layer + glyph recovery -> route: native | partial | full OCR
       render only the pages that need pixels -> shared-memory ring
  -> GPU pipeline (TensorRT FP16, CUDA streams)                     GPU
       D-FINE layout, PP-OCR detection + recognition, PP-FormulaNet-S
       assembly: LayoutNet tables, OrderNet order + blocks, LaTeX, Markdown
  -> per-page results, streamed as they finish
```

| Stage | Where | Cost |
|---|---|---|
| Text layer + routing | page workers | 0.5 to 8 ms per page |
| Render | page workers | 14 to 30 ms per page |
| OCR (detection + recognition) | GPU | 46 to 91 ms per OCR page |
| Formulas | assembly thread | 37 to 70 ms per batch of up to 8 |
| LayoutNet | assembly thread | 8 to 24 ms per page with a table |
| OrderNet | assembly thread | 0.9 to 3.2 ms per page |

These stages overlap, since the workers, the GPU thread and the assembly thread run at the same time. The layout model, D-FINE, takes about 14 ms per page at 960 by 960 in FP16 and scored the best layout recall of the candidates I tried (0.920, against 0.561 for Indra's).

## Built to stay up

The page workers are separate processes, because PDFium isn't thread-safe. That also isolates crashes. A watchdog times out stuck pages, and one bad page doesn't take down the whole document.

Models load lazily in 1.0 to 1.1 s from the engine cache and can unload when idle, giving the GPU back between bursts. Model setup runs in a child process that downloads from Hugging Face, checks SHA-256 hashes and builds the TensorRT engines for the exact GPU it's running on.

hyperparse builds on liteparse, SoMark OXR, PaddleOCR, Indra OCR, OCRia-nano-1, PDFium and Drogon, and each keeps its own license.
