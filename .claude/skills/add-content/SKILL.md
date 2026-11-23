---
name: add-content
description: Add or update a content item (experience, project, note, metric, achievement) through a short interview.
disable-model-invocation: true
argument-hint: experience|project|note|metric|achievement "title"
---
Add content: $ARGUMENTS

1. Delegate to the `content-editor` sub-agent with the type and title.
2. It asks the user for the facts it needs (at most 6 questions in one message), using the resume in
   `docs/private/resume.pdf` to pre-fill what it can.
3. It writes the file in the right `content/` folder with all shared fields (id, published, featured, order, updated),
   following the writing and disclosure rules.
4. Validate with `node apps/web/scripts/build-content.mjs --check`.
5. Show the final text to the user for approval. Do not commit unless the user asks.
