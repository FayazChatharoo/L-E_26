# AGENTS.md

Work only in this local repository.

Rules:
- Never create a new project scaffold unless explicitly asked.
- Keep the current Webflow + Netlify setup.
- No Vite, no bundler, no dev server unless explicitly requested.
- Before finishing a task:
  - run the relevant checks
  - summarize modified files
  - create a git commit
- Commit message format:
  - feat: ...
  - fix: ...
  - chore: ...

Before starting any task:
1. Read PROJECT_CONTEXT.md
2. Read the current codebase
3. Understand the Webflow + Netlify environment

Rules:
- Do not introduce Vite or bundlers
- Keep compatibility with Webflow
- Scripts must work from scripts/app.js

Project documentation

Before modifying the hero system, read:

docs/plan.md
PROJECT_CONTEXT.md