---
name: Payment QR semantics
description: Distinguishing amount-specific UPI payment QRs from user-uploaded fixed QR images.
---

Treat a generated QR from a validated UPI ID as amount-specific. Treat an uploaded QR image as fixed and opaque: show the intended amount separately and tell the seller to confirm the recipient and amount in the customer's payment app. Do not claim the uploaded image encodes the current bill amount.

**Why:** A fixed QR image cannot be safely rewritten or inspected as part of normal billing, while an explicit UPI payment URI can include the current amount and recipient. Claiming otherwise could cause the seller to collect the wrong amount or send payment to the wrong account.

**How to apply:** Keep the distinction visible in checkout and generated bills, especially when saved payment options are switched during collection. Preserve the account used for a recorded payment rather than retroactively substituting whichever option is now active.