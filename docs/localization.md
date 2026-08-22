# Localization foundation

Serbian Cyrillic (`sr`) is the canonical source locale. Place prose is stored only in locale narratives:

- `content/places/{place-id}/narratives/sr.md`
- `content/places/{place-id}/narratives/ru.md`
- `content/places/{place-id}/narratives/en.md`

Russian and English are static, reviewed editorial content. The public site and Admin Worker must not call runtime translation services, and automated editorial translation must never overwrite an existing locale file without an explicit reviewed action.

## Source revision convention

For `ru` and `en`, `source_revision` is the 40-character Git commit SHA returned as the branch HEAD in the same repository snapshot from which Admin loaded the Serbian narrative. A localized save is accepted only when its `expectedHeadSha` still equals that snapshot HEAD. Therefore the recorded revision identifies the commit containing the Serbian source that the editor saw; it is not an unverified current HEAD lookup.

When a Serbian translatable field changes, existing translations retain their prose and `source_revision`, while their `translation_status` becomes `outdated`. This metadata-only update is committed atomically with the Serbian change. Language-neutral changes, including coordinates, media order, monastery community classification, visibility, and route relationships, do not stale translations.

## Scripture and calendar

Scripture is not machine-translated through the place localization workflow. Future Russian and English Scripture must use separately approved language corpora with documented rights and provenance. Calendar interface strings and feast labels are a later localization task.
