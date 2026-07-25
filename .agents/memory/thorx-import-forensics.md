---
name: THORX import forensics
description: Repository-content boundary required to keep repeated Replit imports efficient.
---

Keep the deployable THORX application repository separate from historical audits, prompt/task transcripts, screenshots, and other attached assets. Replit import documentation confirms that Agent scans project files and processes Markdown, so an archive-heavy repository creates avoidable context pressure even when the application source is healthy.

**Why:** The July 2026 investigation measured a moderate application source tree but a much larger tracked archive/instruction layer. Exact quota telemetry was unavailable, so the conclusion is based on measured repository content and documented import behavior rather than a claimed credit amount.

**How to apply:** Prefer a lean `thorx-app` repository plus a separate `thorx-docs-audits` archive. Keep only concise current setup guidance and runtime assets in the app repo; a shallow clone alone does not remove current-file context.