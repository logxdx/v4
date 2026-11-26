---
title: "hyperparse"
short: "hyperparse"
description: "A GPU PDF parser in C++ and CUDA that turns everyday documents into layout, ordered text, LaTeX formulas, tables and Markdown at up to 19 pages per second."
date: "2026-11-26"
repoURL: "https://github.com/logxdx/hyperparse"
category: "Document AI · CUDA"
areas: [rag, systems]
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

## Public benchmarks

I ran the public version of hyperparse through five full public benchmarks with their official scorers. The other columns come from LlamaIndex's OCRia-nano-1 technical report. I re-ran OCRia-nano-1 myself on ParseBench-1, ParseBench-2 and OmniParseBench and got the report's numbers back.

| Benchmark | hyperparse | OCRia-nano-1 | Indra 1.1.2 | Marker (fast) | LiteParse (Tesseract) |
|---|---|---|---|---|---|
| ParseBench-2 (4,317 pages) | **59.5** | 59.2 | 55.1 | 52.5 | 48.7 |
| OmniParseBench (2,937 pages) | 70.9 | **74.8** | 70.9 | 69.8 | 42.3 |
| ParseBench-1 (2,079 docs) | 51.9 | **52.7** | 42.6 | 40.4 | 40.5 |
| olmOCR-bench (1,403 PDFs) | 60.1 | **60.9** | 60.8 | 60.8 | 45.7 |
| BHL character error rate (lower is better) | 0.087 | **0.048** | 0.062 | 0.067 | 0.275 |

hyperparse is first on ParseBench-2, and well ahead of Indra, Marker and LiteParse on ParseBench-1. On olmOCR-bench the top four parsers are within 0.8 of each other. It's 0.8 behind OCRia-nano-1 on ParseBench-1 and 3.9 behind on OmniParseBench, where it ties Indra.

Layout is where it leads most. On ParseBench-2 layout it scores 80.3 against OCRia-nano-1's 72.4, and on ParseBench-1 layout 71.4 against 53.1. One caveat is that the other parsers run on CPU, while hyperparse needs an NVIDIA GPU.

## Speed against CPU parsers

On the same 300 ParseBench-1 documents (302 pages) on my laptop:

| Parser | Pages/s |
|---|---|
| hyperparse, GPU server, 4 to 16 requests in flight | **20.5** |
| liteparse + OCRia-nano-1, 12 CPU processes | 14.7 |
| liteparse + OCRia-nano-1, 1 CPU core | 5.6 |

That's about 1.4x the 12-process CPU run and 3.7x a single core. On 30 scanned pages, hyperparse took 2.9 s against 7.4 s for liteparse with OCRia-nano-1 on all cores, about 2.6x faster. On 30 born-digital pages it was 1.3 s against 3.6 s, about 2.8x.

## Where it still loses

| Weak spot | Benchmark | hyperparse | OCRia-nano-1 |
|---|---|---|---|
| Inline maths | OmniParseBench arXiv maths | 35.0 | 67.1 |
| Text formatting (bold, underline, strikeout) | ParseBench-2 formatting | 75.3 | 82.2 |
| Rotated or skewed pages | OmniParseBench rotation and skew | 61.0 | 78.0 |
| Historical print | BHL character error rate | 0.087 | 0.048 |
| Multilingual pages | OmniParseBench multilingual | 59.8 | 70.7 |

Inline maths is the biggest gap. Every maths point hyperparse gets comes from display formulas, so inline maths never comes out as LaTeX. It also had no page-orientation model, and its Markdown carried no bold, italic or strikeout from the PDF's fonts.

## Next version

A development branch fixes several of those weak spots. It adds page orientation, inline text styles, TeX maths rebuilt from the PDF's glyphs, duplicate-box suppression and table clean-up. It isn't in the public repo yet.

| Benchmark | Public version | Development branch | OCRia-nano-1 |
|---|---|---|---|
| ParseBench-2 | 59.5 | **61.7** | 59.2 |
| ParseBench-1 | 51.9 | **56.5** | 52.7 |
| OmniParseBench | 70.9 | **76.8** | 74.8 |
| olmOCR-bench | 60.1 | **65.0** | 60.9 |
| BHL character error rate | 0.087 | 0.085 | **0.048** |

On that branch hyperparse is ahead of OCRia-nano-1 on all four parsing benchmarks. OmniParseBench went up 5.9 points, mostly from the TeX maths, and olmOCR-bench went up 4.9. Historical print is still the one clear loss.

## Reading order and tables

Two small models drove the earlier jump in reading order and tables. On a 140-page olmOCR-bench subset and OmniDocBench, "Before" is the pipeline with simple XY-cut reading order and tables built only from where the text sits.

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
