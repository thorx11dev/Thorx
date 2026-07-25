---
name: Fast Replit import bootstrap
description: Replit imports should use an idempotent startup bootstrap that skips ready dependencies/schema work and keeps founder/auth QA opt-in.
---

The default import path is intentionally lightweight: startup checks only a few core tables, initializes a fresh managed PostgreSQL database when needed, and skips schema work on an initialized database.

**Why:** Re-running npm install, Drizzle pushes, full auth QA, and screenshots on every import wastes time/quota and can trigger non-interactive migration conflicts.

**How to apply:** Keep founder provisioning and authentication regression as explicit opt-in commands requiring user intent/credentials; never invent founder credentials or run them during normal startup.