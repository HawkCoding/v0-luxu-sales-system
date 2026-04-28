---
name: ubiquitous-language
description: Extract a DDD-style ubiquitous language glossary from the current conversation, flagging ambiguities and proposing canonical terms. Saves to UBIQUITOUS_LANGUAGE.md. Use when the user wants to define domain terms, build a glossary, harden terminology, create a ubiquitous language, or mentions "domain model" or "DDD".
---

# Ubiquitous Language

Extract and formalize domain terminology from the current conversation into a consistent glossary, saved to a local file.

Do the extraction directly. Do not spawn model subagents for this skill.

## Process

1. Scan the current conversation for domain-relevant nouns, verbs, and concepts.
2. If `UBIQUITOUS_LANGUAGE.md` already exists, read it before writing.
3. Identify terminology problems:
   - Same word used for different concepts.
   - Different words used for the same concept.
   - Vague or overloaded terms.
4. Propose canonical, opinionated term choices.
5. Write or rewrite `UBIQUITOUS_LANGUAGE.md` in the working directory using the format below.
6. Output a concise inline summary in the conversation.

## Output Format

Write `UBIQUITOUS_LANGUAGE.md` with this structure:

```md
# Ubiquitous Language

## Order lifecycle

| Term        | Definition                                              | Aliases to avoid      |
| ----------- | ------------------------------------------------------- | --------------------- |
| **Order**   | A customer's request to purchase one or more items      | Purchase, transaction |
| **Invoice** | A request for payment sent to a customer after delivery | Bill, payment request |

## People

| Term         | Definition                                  | Aliases to avoid       |
| ------------ | ------------------------------------------- | ---------------------- |
| **Customer** | A person or organization that places orders | Client, buyer, account |
| **User**     | An authentication identity in the system    | Login, account         |

## Relationships

- An **Invoice** belongs to exactly one **Customer**.
- An **Order** produces one or more **Invoices**.

## Example Dialogue

> **Dev:** "When a **Customer** places an **Order**, do we create the **Invoice** immediately?"
> **Domain expert:** "No. An **Invoice** is only generated once a **Fulfillment** is confirmed. A single **Order** can produce multiple **Invoices** if items ship in separate **Shipments**."
> **Dev:** "So if a **Shipment** is cancelled before dispatch, no **Invoice** exists for it?"
> **Domain expert:** "Exactly. The **Invoice** lifecycle is tied to the **Fulfillment**, not the **Order**."

## Flagged Ambiguities

- "account" was used to mean both **Customer** and **User**. These are distinct concepts: a **Customer** places orders, while a **User** is an authentication identity that may or may not represent a **Customer**.
```

## Rules

- Be opinionated. When multiple words exist for the same concept, pick the best one and list the others as aliases to avoid.
- Flag conflicts explicitly. If a term is ambiguous, call it out in `Flagged Ambiguities` with a clear recommendation.
- Only include terms relevant for domain experts.
- Skip names of modules, classes, APIs, files, or implementation details unless they carry domain meaning.
- Keep definitions tight. Use one sentence max. Define what the term is, not what it does.
- Show relationships. Use bold term names and express cardinality where obvious.
- Only include domain terms. Skip generic programming concepts unless they have domain-specific meaning.
- Group terms into multiple tables when natural clusters emerge, such as lifecycle, actors, pricing, fulfilment, or finance.
- If all terms belong to one cohesive domain, use one table rather than forcing groupings.
- Write a short example dialogue of 3 to 5 exchanges between a developer and a domain expert. Use it to clarify boundaries between related concepts and show terms being used precisely.

## Re-running

When invoked again in the same project:

1. Read the existing `UBIQUITOUS_LANGUAGE.md`.
2. Incorporate new terms from subsequent discussion.
3. Update definitions if understanding has evolved.
4. Re-flag new or resolved ambiguities.
5. Rewrite the example dialogue to incorporate the most important current terms.
