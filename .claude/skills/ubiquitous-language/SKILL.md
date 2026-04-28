---
name: ubiquitous-language
description: Extract a DDD-style ubiquitous language glossary from the current conversation, flagging ambiguities and proposing canonical terms. Saves to UBIQUITOUS_LANGUAGE.md. Use when the user wants to define domain terms, build a glossary, harden terminology, create a ubiquitous language, or mentions "domain model" or "DDD".
disable-model-invocation: true
---

# Ubiquitous Language

Follow the shared project skill at `skills/ubiquitous-language/SKILL.md`.

If this file is loaded directly, use these core rules:

- Extract domain terminology from the current conversation.
- Read `UBIQUITOUS_LANGUAGE.md` first if it already exists.
- Flag ambiguities, synonyms, vague terms, and overloaded terms.
- Pick canonical terms and list aliases to avoid.
- Save the glossary to `UBIQUITOUS_LANGUAGE.md` in the working directory.
- Include relationships and a short example dialogue.
- Output a concise inline summary after writing the file.
