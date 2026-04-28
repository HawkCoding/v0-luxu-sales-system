---
name: grill-me
description: Interview the user relentlessly about a plan or design until reaching shared understanding, resolving each branch of the decision tree. Use when the user wants to stress-test a plan, get grilled on their design, or mentions "grill me".
---

# Grill Me

Interview the user about a plan, design, architecture, workflow, or decision until there is shared understanding and the unresolved branches are closed.

## Workflow

1. Restate the current plan or design in one concise paragraph. Name any assumptions.
2. Identify the next highest-leverage unresolved decision.
3. If the answer can be discovered from the codebase, inspect the codebase instead of asking the user.
4. Ask exactly one question at a time.
5. For every question, include a recommended answer and a brief reason.
6. After the user answers, update the shared understanding, resolve dependent decisions, and choose the next question.
7. Continue until the plan is coherent, implementation-ready, and no major branch of the decision tree remains unresolved.

## Question Style

Use direct, specific questions. Prefer questions that force a concrete choice over broad prompts.

Good:

- "Should quotes expire strictly after 14 calendar days, or at the end of the 14th day in the customer's timezone? Recommended: end of the 14th day in the business timezone, because it is easier to explain and audit."
- "Should managers be able to override the default 25% deposit per job? Recommended: yes, with an audit log entry and required reason."

Avoid:

- Asking several questions at once.
- Asking the user for information already available in the repository.
- Accepting vague answers without narrowing them into an implementation decision.

## Output Pattern

For each turn, use this shape:

```markdown
Current understanding: <one or two sentences>

Question: <one concrete question>

Recommended answer: <recommended choice and why>
```

When the design is complete, provide a concise summary of the resolved decisions and any remaining risks.
