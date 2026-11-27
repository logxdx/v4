---
title: "hyperparse"
short: "hyperparse"
description: "A GPU PDF parser in C++ and CUDA that turns everyday documents into layout, ordered text, LaTeX formulas, tables and Markdown at over 60 pages per second."
date: "2026-11-27"
repoURL: "https://github.com/logxdx/hyperparse"
category: "Document AI · CUDA"
areas: [rag, systems]
tags: ["C++", "CUDA", "TensorRT", "PDFium", "PP-OCRv6", "D-FINE"]
featured: false
---

hyperparse is a PDF parser that runs on one consumer GPU. It handles common document types, like reports, papers and scanned pages, and turns them into layout regions, text in reading order, LaTeX formulas, tables and Markdown.

Hosted document-parsing APIs are expensive, and the open-source pipelines usually assume a big GPU and a Python stack. I wanted a professional-grade pipeline that fits a 6 GB laptop GPU, so it's C++ and CUDA end to end with TensorRT for every model.

## What it produces

Each page gets 12 kinds of layout region, such as text, title, table, picture, formula, caption, code and stamp. Text comes from the PDF's own text layer when it's usable, and from OCR where it isn't. Scans turned sideways or upside down are turned upright first.

A reading-order model sorts the lines and groups them into paragraphs, headings and lists. Bold, italic, code, strikethrough, underline and super- and subscripts come through as Markdown. Display formulas come out as LaTeX, and inline maths in TeX-made PDFs is rebuilt from the PDF's glyphs.

Tables come out with rows, columns, spanning cells and header rows as HTML inside the Markdown. It runs as a CLI or as an HTTP server with a queue, streaming results, metrics and health checks.

## Throughput

Measured on a 6 GB laptop GPU. "Before" is the build from a day earlier:

| Run | Before | Now | Speedup |
|---|---|---|---|
| Server, 300 one-page documents, 8 in flight | 20.0 pages/s | **~64 pages/s** | ~3.2x |
| One mixed 300-page PDF | 44.2 | **~62 to 66** | ~1.4 to 1.5x |
| 100 scanned pages | 16.4 | **~24** | ~1.5x |
| 100 formula-heavy arXiv pages | 10.3 | **~24.5** | ~2.4x |
| Benchmark harnesses (olmOCR, Omni, BHL) | 9 to 10 | **18 to 20** | ~2x |

The server's median latency per document fell from 333 ms to about 124 ms. Its worst-case tail on mixed loads, the 99th percentile, fell from 13 to 15 s down to 0.5 to 0.7 s.

Most of that came from keeping the GPU busy. Text detection and recognition are pipelined across pages, and the server overlaps up to 8 documents in one long-lived pipeline. Formulas got their own thread, and pages are assembled on three more.

Several kernels got faster too:

| Step | Before | Now |
|---|---|---|
| Text detection post-processing | 5.7 ms/page | 0.25 ms/page |
| D-FINE layout, all-FP16 backbone | 12.0 ms/page | 6.4 ms/page |

The GPU is now 95 to 100% busy during a parse. A scanned page costs about 42 ms of GPU work: about 27 ms for text recognition, 7.5 ms for text detection and 6.5 ms for layout. With all the models loaded it peaks at about 3.4 GB of GPU memory, and after an idle unload the models reload in about 0.6 s.

For comparison, OXR-1.0, a 4B vision-language model, scores much higher on olmOCR-bench, 86.1 on a 140-page subset, but runs at 0.05 pages/s. hyperparse runs olmOCR-bench at 18 to 20 pages/s, roughly 360 to 400x faster, and scores 65.9 on the full benchmark.

## Public benchmarks

I ran hyperparse through five full public benchmarks with their official scorers. The other columns come from LlamaIndex's OCRia-nano-1 technical report. I re-ran OCRia-nano-1 myself on ParseBench-1, ParseBench-2 and OmniParseBench and got the report's numbers back.

| Benchmark | hyperparse | OCRia-nano-1 | Indra 1.1.2 | Marker (fast) | LiteParse (Tesseract) |
|---|---|---|---|---|---|
| ParseBench-2 (4,317 pages) | **61.8** | 59.2 | 55.1 | 52.5 | 48.7 |
| OmniParseBench (2,937 pages) | **76.8** | 74.8 | 70.9 | 69.8 | 42.3 |
| ParseBench-1 (2,079 docs) | **56.5** | 52.7 | 42.6 | 40.4 | 40.5 |
| olmOCR-bench (1,403 PDFs) | **65.9** | 60.9 | 60.8 | 60.8 | 45.7 |
| BHL character error rate (lower is better) | 0.050 | **0.048** | 0.062 | 0.067 | 0.275 |

hyperparse is first on all four parsing benchmarks. It leads OCRia-nano-1 by 2.6 points on ParseBench-2, 2.0 on OmniParseBench, 3.8 on ParseBench-1 and 5.0 on olmOCR-bench. On BHL historical print it's within 0.002 of OCRia-nano-1 and ahead of the other three.

Layout is where it leads most. On ParseBench-2 layout it scores 82.1 against OCRia-nano-1's 72.4, and on ParseBench-1 layout 71.4 against 53.1.

Two caveats. The other parsers in the table run on CPU, while hyperparse needs an NVIDIA GPU. And bigger GPU or cloud vision-language parsers, like Reducto, Datalab and Chandra 2, score 79 to 87 on ParseBench-2.

## Speed against CPU parsers

On samples of 300 short ParseBench-1 documents on my laptop:

| Parser | Pages/s |
|---|---|
| hyperparse, GPU server, 8 requests in flight | **~64** |
| liteparse + OCRia-nano-1, 12 CPU processes | 14.7 |
| liteparse + OCRia-nano-1, 1 CPU core | 5.6 |

That's about 4.4x the 12-process CPU run and about 11x a single core. LlamaIndex's report gives OCRia-nano-1 27.8 pages/s on a 16-vCPU cloud container, so hyperparse on my laptop is about 2.3x that too.

## Latest improvements

The last round of changes added page orientation, inline text styles, TeX maths rebuilt from the PDF's glyphs, duplicate-box suppression, table clean-up, and OCR lines that merge only inside one layout region.

| Benchmark | Before | Now | Change |
|---|---|---|---|
| ParseBench-2 | 59.5 | **61.8** | +2.3 |
| ParseBench-1 | 51.9 | **56.5** | +4.6 |
| OmniParseBench | 70.9 | **76.8** | +5.9 |
| olmOCR-bench | 60.1 | **65.9** | +5.8 |
| BHL character error rate | 0.087 | **0.050** | about 43% lower |

The TeX maths gave the biggest single gain. Before it, inline maths never came out as LaTeX, and olmOCR-bench's arXiv maths score went from 18 to 62. On OmniParseBench's arXiv maths suite, hyperparse now scores 75.5 against OCRia-nano-1's 67.1.

Page orientation took OmniParseBench's rotated and skewed pages from 61 to 78.5. Inline styles took ParseBench formatting from 75.3 to 81.2 and from 36.6 to 53.5, and the table clean-up took ParseBench tables from 57.2 to 60.9 and from 63.2 to 68.9.

The BHL jump came from the line fix. OCR lines used to merge across column gutters, and now they only merge inside one layout region, in reading order.

## Where it still loses

| Weak spot | Benchmark | hyperparse | OCRia-nano-1 |
|---|---|---|---|
| Multilingual pages | OmniParseBench multilingual suites | 62 to 64 | 70.1 to 70.7 |
| Text formatting | ParseBench-2 formatting | 81.2 | 82.2 |
| Semantic formatting | ParseBench-1 formatting | 53.5 | 54.9 |

Multilingual pages are now the biggest gap, because there's no routing by script. Handwriting is also weak, at 13 to 16 on OmniParseBench, and there's no chart model, so charts stay as figures.

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

On 751 scanned IDL pages, OCR reaches a word F1 of 0.894 against AWS Textract's OCR of the same pages. On 300 display formulas, 45.0% match when rendered and compared the way olmOCR-bench does.

OrderNet, from Indra OCR, is a 0.73M-parameter model that orders a page's text lines and groups them into blocks. It takes about 0.4 ms for 256 lines on the GPU, and 1 to 3 ms per page including decoding and Markdown.

LayoutNet, from OCRia-nano-1, is a 4.3M-parameter table-structure model. It runs only on pages where the layout model finds a table.

Both run as FP16 TensorRT engines. They matched FP32 on these accuracy tests and are faster:

| Model, 1024 lines or units | FP32 | FP16 | Speedup |
|---|---|---|---|
| OrderNet | 3.90 ms | 2.40 ms | 1.6x |
| LayoutNet | 9.50 ms | 6.56 ms | 1.4x |

I tried INT8 too. It made LayoutNet slower and cost 1.4 TEDS points, so FP16 is what ships.

## Text layer first

Most born-digital PDFs already contain correct text, so running OCR on them is wasted work. Each page is routed one of three ways: native text, partial OCR for the regions that need it, or full OCR.

| Set | Pages | Native / partial / full OCR |
|---|---|---|
| Scanned documents (IDL) | 751 | 3 / 4 / 744 |
| Scientific papers | 60 | 14 / 37 / 9 |
| Mixed documents | 100 | 19 / 36 / 45 |
| olmOCR-bench subset | 140 | 21 / 52 / 67 |

Only 9 of the 60 scientific-paper pages needed full OCR. Reading the text layer and routing a page costs 0.5 to 8 ms, while OCR adds about 35 ms of GPU work per scanned page plus the time to render it. The routing and the recovery of broken glyphs are ported from liteparse.

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
| D-FINE layout | GPU | ~6.5 ms per page |
| Text detection + recognition | GPU | ~7.5 + ~27 ms per scanned page |
| LayoutNet | assembly threads | 8 to 24 ms per page with a table |
| OrderNet | assembly threads | 0.9 to 3.2 ms per page |

These stages overlap, since the workers, the GPU thread, the formula thread and the assembly threads run at the same time. D-FINE also scored the best layout recall of the candidates I tried, 0.920 against 0.561 for Indra's.

## Built to stay up

The page workers are separate processes, because PDFium isn't thread-safe. That also isolates crashes. A watchdog times out stuck pages, and one bad page doesn't take down the whole document.

Documents overlap in one pipeline. One renders while another is on the GPU and a third is being assembled, short documents overtake long ones, and an error stays with its own document.

Models load lazily in 1.0 to 1.1 s from the engine cache and can unload when idle, giving the GPU back between bursts. Model setup runs in a child process that downloads from Hugging Face, checks SHA-256 hashes and builds the TensorRT engines for the exact GPU it's running on.

hyperparse builds on liteparse, SoMark OXR, PaddleOCR, Indra OCR, OCRia-nano-1, PDFium and Drogon, and each keeps its own license.
