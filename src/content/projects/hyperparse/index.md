---
title: "hyperparse"
short: "hyperparse"
description: "A GPU PDF parser in C++ and CUDA that turns everyday documents into layout, ordered text, LaTeX formulas, tables and Markdown at over 60 pages per second."
date: "2026-11-26"
updated: "2026-11-27"
repoURL: "https://github.com/logxdx/hyperparse"
category: "Document AI · CUDA"
areas: [rag, systems]
tags: ["C++", "CUDA", "TensorRT", "PDFium", "PP-OCRv6", "D-FINE"]
stats:
  - value: "~64"
    unit: "pages/s"
    label: "Server throughput on a 6 GB laptop GPU"
    delta: { dir: up, text: "3.2x faster than the previous build" }
  - value: "65.9"
    label: "olmOCR-bench, 5.0 points ahead of OCRia-nano-1"
  - value: "4 of 4"
    label: "Parsing benchmarks where it ranks first"
  - value: "0.5–0.7 s"
    label: "Worst-case server latency"
    delta: { dir: down, text: "from 13 to 15 s" }
featured: false
---

hyperparse is a PDF parser that runs on one consumer GPU. It handles common document types, like reports, papers and scanned pages, and turns them into layout regions, text in reading order, LaTeX formulas, tables and Markdown.

Hosted document-parsing APIs are expensive, and the open-source pipelines usually assume a big GPU and a Python stack. I wanted a professional-grade pipeline that fits a 6 GB laptop GPU, so it's C++ and CUDA end to end with TensorRT for every model.

## Update: 27/11/2026

About 3x faster, and better OCR lines.

hyperparse got much faster this round, mostly from keeping the GPU busy. Text detection and recognition are now pipelined across pages, and the server overlaps up to 8 documents in one long-lived pipeline. Formulas have their own thread, and pages are assembled on three more.

| Run | Before | Now | Speedup |
|---|---|---|---|
| Server, 300 one-page documents, 8 in flight | 20.0 pages/s | **~64 pages/s** | ~3.2x |
| One mixed 300-page PDF | 44.2 | **~62 to 66** | ~1.4 to 1.5x |
| 100 scanned pages | 16.4 | **~24** | ~1.5x |
| 100 formula-heavy arXiv pages | 10.3 | **~24.5** | ~2.4x |
| Benchmark harnesses (olmOCR, Omni, BHL) | 9 to 10 | **18 to 20** | ~2x |

The server's median latency per document fell from 333 ms to about 124 ms. Its 99th-percentile tail on mixed loads fell from 13 to 15 s down to 0.5 to 0.7 s.

Two kernels got much faster. Text detection post-processing went from 5.7 to 0.25 ms per page, and D-FINE layout from 12.0 to 6.4 ms per page with an all-FP16 backbone. The GPU is now 95 to 100% busy during a parse, and a scanned page costs about 42 ms of GPU work.

Against the CPU parsers, the server's ~64 pages/s is about 4.4x liteparse with OCRia-nano-1 on 12 processes (14.7 pages/s) and about 11x on one core (5.6). It's also about 2.3x the 27.8 pages/s that LlamaIndex's report gives OCRia-nano-1 on a 16-vCPU cloud container. Against OXR-1.0's 0.05 pages/s, the benchmark harnesses at 18 to 20 pages/s are roughly 360 to 400x faster.

OCR lines now merge only inside one layout region, in reading order. They used to merge across column gutters.

| Benchmark | Before | Now |
|---|---|---|
| olmOCR-bench | 65.0 | **65.9** |
| ParseBench-2 | 61.7 | **61.8** |
| OmniParseBench | 76.8 | 76.8 |
| ParseBench-1 | 56.5 | 56.5 |
| BHL character error rate (lower is better) | 0.085 | **0.050** |

The BHL error rate dropped by about 41%. It's now within 0.002 of OCRia-nano-1's 0.048 and ahead of Indra, Marker and LiteParse, so historical print is no longer a weak spot. On olmOCR-bench, hyperparse now leads OCRia-nano-1 by 5.0 points.

---

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

For comparison, OXR-1.0, a 4B vision-language model, scores much higher on olmOCR-bench, 86.1 on a 140-page subset, but runs at 0.05 pages/s. hyperparse runs olmOCR-bench at 10.1 pages/s, about 200x faster, and scores 65.0 on the full benchmark.

## Public benchmarks

I ran hyperparse through five full public benchmarks with their official scorers. The other columns come from LlamaIndex's OCRia-nano-1 technical report. I re-ran OCRia-nano-1 myself on ParseBench-1, ParseBench-2 and OmniParseBench and got the report's numbers back.

| Benchmark | hyperparse | OCRia-nano-1 | Indra 1.1.2 | Marker (fast) | LiteParse (Tesseract) |
|---|---|---|---|---|---|
| ParseBench-2 (4,317 pages) | **61.7** | 59.2 | 55.1 | 52.5 | 48.7 |
| OmniParseBench (2,937 pages) | **76.8** | 74.8 | 70.9 | 69.8 | 42.3 |
| ParseBench-1 (2,079 docs) | **56.5** | 52.7 | 42.6 | 40.4 | 40.5 |
| olmOCR-bench (1,403 PDFs) | **65.0** | 60.9 | 60.8 | 60.8 | 45.7 |
| BHL character error rate (lower is better) | 0.085 | **0.048** | 0.062 | 0.067 | 0.275 |

hyperparse is first on all four parsing benchmarks. It leads OCRia-nano-1 by 2.5 points on ParseBench-2, 2.0 on OmniParseBench, 3.8 on ParseBench-1 and 4.1 on olmOCR-bench. Historical print, measured by BHL, is the one benchmark where it's behind.

Layout is where it leads most. On ParseBench-2 layout it scores 82.1 against OCRia-nano-1's 72.4, and on ParseBench-1 layout 71.4 against 53.1. One caveat is that the other parsers run on CPU, while hyperparse needs an NVIDIA GPU.

## Speed against CPU parsers

On the same 300 ParseBench-1 documents (302 pages) on my laptop:

| Parser | Pages/s |
|---|---|
| hyperparse, GPU server, 4 to 16 requests in flight | **20.5** |
| liteparse + OCRia-nano-1, 12 CPU processes | 14.7 |
| liteparse + OCRia-nano-1, 1 CPU core | 5.6 |

That's about 1.4x the 12-process CPU run and 3.7x a single core. LlamaIndex's report gives OCRia-nano-1 27.8 pages/s on a 16-vCPU cloud container, which is faster than hyperparse on my laptop.

On 30 scanned pages, hyperparse took 2.9 s against 7.4 s for liteparse with OCRia-nano-1 on all cores, about 2.6x faster. On 30 born-digital pages it was 1.3 s against 3.6 s, about 2.8x.

## Latest improvements

The last round of changes added page orientation, inline text styles, TeX maths rebuilt from the PDF's glyphs, duplicate-box suppression and table clean-up.

| Benchmark | Before | Now | Change |
|---|---|---|---|
| ParseBench-2 | 59.5 | **61.7** | +2.2 |
| ParseBench-1 | 51.9 | **56.5** | +4.6 |
| OmniParseBench | 70.9 | **76.8** | +5.9 |
| olmOCR-bench | 60.1 | **65.0** | +4.9 |
| BHL character error rate | 0.087 | **0.085** | slightly lower |

The TeX maths gave the biggest single gain. Before it, every maths point came from display formulas, and inline maths never came out as LaTeX. On OmniParseBench's arXiv maths suite, OCRia-nano-1 scores 67.1, and hyperparse now scores 75.5.

Page orientation helped rotated scans the most. On OmniParseBench's rotation and skew suite, hyperparse went from 61.0 to 78.5, against OCRia-nano-1's 78.0.

## Where it still loses

| Weak spot | Benchmark | hyperparse | OCRia-nano-1 |
|---|---|---|---|
| Historical print | BHL character error rate | 0.085 | 0.048 |
| Multilingual pages | OmniParseBench multilingual suites | 62 to 64 | 70.1 to 70.7 |
| Text formatting | ParseBench-2 formatting | 81.2 | 82.2 |
| Semantic formatting | ParseBench-1 formatting | 53.5 | 54.9 |

Historical print is the biggest gap. My best guess is the image size: those scans are 3,000 to 3,700 px tall, and the OCR step shrinks them to a 2,200 px long side, about 60% of their size. Multilingual pages suffer because there's no routing by script, and handwriting is still weak at 13 to 16 on OmniParseBench.

## Reading order and tables

Two small models, OrderNet and LayoutNet, gave the biggest jump in reading order and tables. "Before" is the pipeline without them, using simple XY-cut reading order and tables built only from where the text sits. These were measured on a 140-page olmOCR-bench subset and on OmniDocBench.

| Benchmark | Before | After |
|---|---|---|
| olmOCR-bench subset overall (835 tests) | 49.9 | **55.6** |
| olmOCR-bench subset reading order | 43.5 | **55.7** |
| olmOCR-bench subset multi-column | 61.3 | **77.3** |
| olmOCR-bench subset tables | 53.4 | **72.8** |
| OmniDocBench reading order (Kendall tau) | 0.876 | **0.943** |
| OmniDocBench page text edit distance (lower is better) | 0.450 | **0.402** |
| OmniDocBench table TEDS (135 tables) | 0.480 | **0.658** |

On the 751 scanned IDL pages, OCR reaches a word F1 of 0.894 against AWS Textract's OCR of the same pages. On 300 display formulas, 45.0% match when rendered and compared the way olmOCR-bench does.

OrderNet, from Indra OCR, is a 0.73M-parameter model that orders a page's text lines and groups them into blocks. It takes about 0.4 ms for 256 lines on the GPU, and 1 to 3 ms per page including decoding and Markdown.

LayoutNet, from OCRia-nano-1, is a 4.3M-parameter table-structure model. It runs only on pages where the layout model finds a table, at about 25 ms per table page.

Both run as FP16 TensorRT engines. They matched FP32 on these accuracy tests and are faster:

| Model, 1024 lines or units | FP32 | FP16 | Speedup |
|---|---|---|---|
| OrderNet | 3.90 ms | 2.40 ms | 1.6x |
| LayoutNet | 9.50 ms | 6.56 ms | 1.4x |

I tried INT8 too. It made LayoutNet slower and cost 1.4 TEDS points, so FP16 is what ships.

## Text layer first

Most born-digital PDFs already contain correct text, so running OCR on them is wasted work. Each page is routed one of three ways: native text, partial OCR for the regions that need it, or full OCR. The routes column above shows how this plays out: only 9 of the 60 scientific-paper pages needed full OCR.

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
