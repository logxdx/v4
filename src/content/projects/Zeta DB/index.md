---
title: "Zeta DB"
description: "Multimodal vector database for text-to-image and image-to-image search."
date: "April 2025"
repoURL: "https://github.com/logxdx/Zeta-DB"
# demoURL: ""
---

Unlock the true potential of your data with **Zeta DB**, a powerful, Python-based vector database designed to bridge the gap between vision and language. <br> Whether you are building _intelligent image search engines_, _content recommendation systems_, or _AI-driven asset managers_, Zeta DB provides the semantic backbone you need.

---

### Why Zeta DB?

Traditional databases search by keywords whereas **Zeta DB** searches by _meaning_. By leveraging state-of-the-art **CLIP models** (like `jina-clip-v2`), **Zeta DB** transforms both images and text into high-dimensional vectors, enabling you to find exactly what you're looking for based on context, not just metadata.

### Key Features

- **Multimodal Power**: Seamlessly generate, store, and query embeddings for both images and text in a unified space.
- **Blazing Fast Search**: Built on top of **LanceDB**, ensuring scalable and efficient nearest neighbor search performance.
- **Persistent & Reliable**: Your index is automatically saved to disk, ensuring your data is safe and ready for instant retrieval.
- **Fully Configurable**: Tailor the experience to your needs. Swap models, adjust embedding dimensions, and manage storage paths effortlessly via a central configuration.
- **Smart Indexing**: Includes built-in duplicate prevention and vector normalization to keep your database clean and your results accurate.

### The Tech Stack

Zeta DB combines the simplicity of Python with the raw power of modern AI infrastructure:

- **Embedding Engine**: Jina AI CLIP models (1024-dim full-size embeddings).
- **Vector Indexing**: LanceDB for high-performance on-disk storage.
- **Interface**: Gradio-ready entry point for immediate interaction.
