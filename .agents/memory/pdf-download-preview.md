---
name: PDF downloads in the preview browser
description: How to verify generated PDFs when the browser tester does not report a download event.
---

In the BUYME preview browser, an automated click on both a PDF library's save action and a native Blob URL download link produced no browser download event. The tester could fetch the same Blob URL, confirm the `application/pdf` MIME type and PDF signature, and extract the correct line items and totals from the resulting file.

**Why:** A missing download event in this preview did not mean the PDF generator failed; the generated files were valid. The cause of the event behavior was not established.

**How to apply:** For future PDF changes, check the generated Blob bytes and document contents in addition to the browser download event. Keep a direct Open PDF option so a user can access the document if their browser blocks a download. Do not claim that the browser download itself was verified unless it was.