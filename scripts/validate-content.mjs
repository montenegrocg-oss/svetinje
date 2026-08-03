#!/usr/bin/env node

import { validateRepository, formatIssues } from "./content-validation.mjs";

const errors = await validateRepository(process.cwd());
if (errors.length > 0) {
  console.error(`Content validation failed with ${errors.length} error(s):`);
  console.error(formatIssues(errors));
  process.exitCode = 1;
} else {
  console.log("Content validation passed (0 content records; publication lock enabled)." );
}
