// Points git at the repo's own hooks directory, so the commit convention is
// checked for everyone who runs `npm install` rather than for whoever
// remembered to copy a script into .git/hooks.
//
// Silent no-op outside a git work tree (a tarball install, CI checkouts that
// skip hooks): this must never fail an install.

import { execFileSync } from "node:child_process";

try {
  execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
    stdio: "ignore",
  });
  execFileSync("git", ["config", "core.hooksPath", ".githooks"], {
    stdio: "ignore",
  });
} catch {
  // Not a git checkout, or git is unavailable — nothing to install.
}
