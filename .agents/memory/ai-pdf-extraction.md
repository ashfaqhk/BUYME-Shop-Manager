---
name: AI PDF extraction
description: A tested Replit AI Integrations behavior for reading PDF documents without an intermediate file upload
---

The Replit OpenAI Responses proxy accepted an inline `input_file` with a base64 PDF data URL, and returned structured items from the PDF. The same endpoint accepted an inline `input_image` for a JPEG of the document.

**Why:** An apparent need for PDF rendering or the Files API can add complexity; the latter may not be available through AI Integrations, but inline document input worked in this environment.

**How to apply:** For small, short-lived documents, consider bounded inline Responses input before introducing client PDF rendering or persistent upload storage. Continue to verify limits, model support, and billing when changing providers or formats.