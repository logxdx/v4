---
title: "ANOTAR"
description: "Turns images and PDFs into structured Markdown notes in Obsidian, using OCR, PDF parsing and language models."
date: "March 2025"
repoURL: "https://github.com/logxdx/ANOTAR"
category: "Knowledge · OCR"
areas: [knowledge]
tags: ["Python", "Streamlit", "EasyOCR", "PDF parsing", "LLMs", "Obsidian"]
featured: false
---

ANOTAR turns images and PDF documents into structured notes. You upload a file, it pulls out the text, and a language model writes notes with a summary, bullet points and tagged sections. Tables and equations are kept in the output.

Text comes in two ways. For PDFs, ANOTAR reads the document structure to get the embedded text, including complex layouts. Scanned and handwritten pages go through OCR with EasyOCR, which can use the GPU when PyTorch is installed with CUDA.

The notes are saved as Markdown into an Obsidian vault. Obsidian is optional; without it, notes go to an ANOTAR folder in Documents. A built-in file viewer lets you browse and review notes inside the app, and a settings page holds the API keys for the model providers and the vault path.

A typical use is a scanned research paper. Upload the PDF and you get notes with headings, tables and equations, ready to open in Obsidian.

The app is built with Streamlit. The OCR, PDF parsing and note writing live in a separate utils package. The project is MIT licensed.
