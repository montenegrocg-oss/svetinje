# Svetinje.me content directory

This directory is reserved for future, researched editorial content. It currently contains no sacred-place records.

Planned structure:

    content/
      places/
        {place-id}/
          place.yaml
          narratives/
            sr.md
            ru.md
            en.md
      sources/
        {source-id}.yaml
      practical/
        {place-id}/
          {practical-id}.yaml
      media/
        {media-id}.yaml

Rules:

- Do not create empty locale files or placeholder content records.
- Do not invent names, IDs, slugs, dates, coordinates, schedules, contacts, sources, claims, or media.
- Serbian Cyrillic is the source language.
- Large original media files must remain outside Git.
- Draft and research records are never public merely because they exist.
- Public publication is locked by validation/publication-policy.json until all required reviewers are assigned and every applicable review is complete.

Local validation:

    pnpm install --frozen-lockfile
    pnpm run check

To validate content without running tests:

    pnpm run validate:content

The validator reads schemas/, validation/publication-policy.json, and this content/ tree. It returns a non-zero exit code for schema, path, reference, uniqueness, freshness, or publication-gate errors.
