#!/usr/bin/env node

import { validateRepositoryWithSummary, formatIssues } from "./content-validation.mjs";

const { errors, counts, publicationLocked } = await validateRepositoryWithSummary(process.cwd());
const summary = [
  `${counts.places} place record(s)`,
  `${counts.narratives} narrative(s)`,
  `${counts.sources} source record(s)`,
  `${counts.practical} practical record(s)`,
  `${counts.media} media record(s)`,
  `${counts.news} news record(s)`,
  `${counts.routes} route record(s)`,
  `${counts.routeNarratives} route narrative(s)`,
  `${counts.routeTracks} route track(s)`,
  `${counts.calendarDays} calendar day(s)`,
  `${counts.scriptureCorpora} Scripture corpus file(s)`,
  `${counts.lectionaryMaps} lectionary map(s)`,
].join(", ");
if (errors.length > 0) {
  console.error(`Content validation failed with ${errors.length} error(s):`);
  console.error(`Validated: ${summary}.`);
  console.error(formatIssues(errors));
  process.exitCode = 1;
} else {
  console.log(`Content validation passed. Validated: ${summary}. Publication lock ${publicationLocked ? "enabled" : "disabled"}.`);
}
