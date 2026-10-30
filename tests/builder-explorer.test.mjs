import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  arcRepositoryEvidence,
  baseRepositoryEvidence,
  ecosystemRepositoryEvidence,
  ecosystemRepositoryNetworks,
  isArcRepository,
  isBaseRepository,
  isEcosystemRepository,
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

test("Base repository evidence is explicit and avoids generic base substrings", () => {
  const baseOrbit = {
    name: "base-orbit",
    full_name: "sanjeebdas1979/base-orbit",
    description: "An onchain game built on Base Mainnet",
    topics: ["base", "onchain-game"],
  };

  assert.equal(isBaseRepository(baseOrbit), true);
  assert.deepEqual(baseRepositoryEvidence(baseOrbit), [
    "Base project name",
    "base mainnet",
    "built on base",
    "Base topic",
  ]);
  assert.deepEqual(ecosystemRepositoryNetworks(baseOrbit), ["Base"]);
  assert.equal(isEcosystemRepository(baseOrbit), true);
  assert.equal(
    isBaseRepository({
      name: "database-tool",
      description: "A generic database utility",
      topics: [],
    }),
    false
  );
  assert.deepEqual(
    baseRepositoryEvidence({
      name: "base",
      full_name: "base/base",
    }),
    ["Base core repository", "Base project name"]
  );
});

test("Predarc can carry both Arc and Base network evidence", () => {
  const predarc = {
    name: "predarc",
    full_name: "sanjeebdas1979/predarc",
    description: "Forecasting on Arc Mainnet and Base Mainnet",
    topics: ["arc", "base"],
  };

  assert.deepEqual(ecosystemRepositoryNetworks(predarc), ["Arc", "Base"]);
  assert.ok(ecosystemRepositoryEvidence(predarc).includes("Arc/Circle topic"));
  assert.ok(ecosystemRepositoryEvidence(predarc).includes("Base topic"));
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
  const page = readFileSync(
    new URL("../src/app/builders/page.tsx", import.meta.url),
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
  assert.match(search, /Discover an Arc \/ Base project/);
  assert.match(search, /Explore Project/);
  assert.match(client, /Discover/);
  assert.match(client, /Arc \+ Base projects\./);
  assert.match(client, /Merged PRs/);
  assert.match(client, /Public issues/);
  assert.match(client, /Arc \+ Base contributions/);
  assert.match(page, /Arc \+ Base Project Explorer/);
  assert.match(route, /is:pull-request is:merged/);
  assert.match(route, /is:issue/);
  assert.match(route, /repo:\$\{repository\}/);
  assert.match(route, /publicEcosystemContribution/);
  assert.match(route, /isEcosystemRepository/);
  assert.match(route, /PUBLIC_ECOSYSTEM_CONTRIBUTION_REPOSITORIES/);
  assert.match(route, /projects: publicRepositories/);
  assert.match(route, /MAX_REPOSITORIES_PER_NETWORK/);
  assert.match(route, /includes\("Base"\)/);
  assert.match(route, /contributionSearchAvailable/);
  assert.doesNotMatch(client, /Community verification/);
  assert.doesNotMatch(client, /Unknown stays unknown/);
  assert.doesNotMatch(route, /communitySignals/);
});
