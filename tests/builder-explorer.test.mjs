import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  arcRepositoryEvidence,
  isArcRepository,
  isFixRelatedCommit,
  normalizeBuilderExplorerQuery,
  safePublicUrl,
} from "../src/lib/builder-explorer-core.ts";

test("builder queries distinguish public email, GitHub identity and project", () => {
  assert.deepEqual(normalizeBuilderExplorerQuery(" Builder@Example.com "), {
    kind: "email",
    normalized: "builder@example.com",
  });
  assert.deepEqual(normalizeBuilderExplorerQuery("@sanjeebdas1979"), {
    kind: "github",
    normalized: "@sanjeebdas1979",
    githubUsername: "sanjeebdas1979",
  });
  assert.deepEqual(
    normalizeBuilderExplorerQuery("https://github.com/sanjeebdas1979/predarc"),
    {
      kind: "project",
      normalized: "sanjeebdas1979/predarc",
      repository: {
        owner: "sanjeebdas1979",
        name: "predarc",
      },
    }
  );
  assert.deepEqual(normalizeBuilderExplorerQuery("Predarc"), {
    kind: "project",
    normalized: "Predarc",
  });
  assert.equal(normalizeBuilderExplorerQuery("x"), null);
  assert.equal(normalizeBuilderExplorerQuery("https://example.com/user"), null);
});

test("Arc repository evidence is explicit and avoids substring guesses", () => {
  const predarc = {
    name: "predarc",
    full_name: "sanjeebdas1979/predarc",
    description: "Forecasting and native USDC tools on Arc Mainnet",
    topics: ["arc", "prediction-market"],
  };

  assert.equal(isArcRepository(predarc), true);
  assert.deepEqual(arcRepositoryEvidence(predarc), [
    "Predarc project name",
    "arc mainnet",
    "native usdc",
    "Arc/Circle topic",
  ]);
  assert.equal(
    isArcRepository({
      name: "archive-viewer",
      description: "A general file archive utility",
      topics: [],
    }),
    false
  );
  assert.deepEqual(
    arcRepositoryEvidence({
      name: "arc-node",
      full_name: "circlefin/arc-node",
    }),
    ["Arc Node repository"]
  );
  assert.equal(
    isArcRepository({
      name: "arc-node",
      full_name: "unrelated-user/arc-node",
    }),
    false
  );
});

test("fix activity is a commit-message signal rather than an inferred role", () => {
  assert.equal(isFixRelatedCommit("Fix active prediction sync"), true);
  assert.equal(isFixRelatedCommit("hotfix: retry failed request"), true);
  assert.equal(isFixRelatedCommit("Add community market cards"), false);
});

test("public links are restricted to approved HTTPS hosts", () => {
  assert.equal(
    safePublicUrl("https://github.com/sanjeebdas1979/predarc", ["github.com"]),
    "https://github.com/sanjeebdas1979/predarc"
  );
  assert.equal(
    safePublicUrl("http://github.com/sanjeebdas1979/predarc", ["github.com"]),
    null
  );
  assert.equal(
    safePublicUrl("https://example.com/sanjeebdas1979", ["github.com"]),
    null
  );
});

test("Builder Explorer enforces origin and privacy boundaries before lookup", () => {
  const route = readFileSync(
    new URL("../src/app/api/builder-explorer/route.ts", import.meta.url),
    "utf8"
  );
  const client = readFileSync(
    new URL(
      "../src/app/components/builders/BuilderExplorerClient.tsx",
      import.meta.url
    ),
    "utf8"
  );
  const search = readFileSync(
    new URL(
      "../src/app/components/builders/BuilderExplorerSearch.tsx",
      import.meta.url
    ),
    "utf8"
  );

  assert.ok(
    route.indexOf("requestOriginAllowed(request)") <
      route.indexOf("resolveSearchOwner(query)")
  );
  assert.match(route, /emailReturned: false/);
  assert.match(route, /signedInPagesScraped: false/);
  assert.match(route, /profile\?\.email/);
  assert.doesNotMatch(route, /email:\s*cleanString\(profile/);
  assert.match(search, /No private data · No ranking/);
  assert.match(search, /Discover an Arc project/);
  assert.match(search, /Explore Project/);
  assert.match(client, /Discover/);
  assert.match(client, /Arc projects\./);
  assert.match(client, /Merged PRs/);
  assert.match(client, /Arc issues/);
  assert.match(client, /Arc contributions/);
  assert.match(route, /is:pull-request is:merged/);
  assert.match(route, /is:issue/);
  assert.match(route, /repo:\$\{repository\}/);
  assert.match(route, /publicArcContribution/);
  assert.match(route, /isArcRepository/);
  assert.match(route, /contributionSearchAvailable/);
  assert.doesNotMatch(client, /Community verification/);
  assert.doesNotMatch(client, /Unknown stays unknown/);
  assert.doesNotMatch(route, /communitySignals/);
});
