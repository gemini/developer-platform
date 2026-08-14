import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

if (process.env.GITHUB_EVENT_NAME !== "pull_request") {
  console.log("Changeset enforcement applies to pull requests only");
  process.exit(0);
}

const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
const pullRequest = event.pull_request;

if (pullRequest.title === "Version Packages") {
  console.log("Version Packages pull request does not require a new Changeset");
  process.exit(0);
}

const changedFiles = execFileSync(
  "git",
  ["diff", "--name-only", `${pullRequest.base.sha}...${pullRequest.head.sha}`],
  { encoding: "utf8" },
)
  .trim()
  .split("\n")
  .filter(Boolean);

const sdkChanges = changedFiles.filter(
  (file) =>
    file.startsWith("packages/sdk-typescript/") &&
    !file.startsWith("packages/sdk-typescript/.changeset/"),
);
const changesets = changedFiles.filter(
  (file) =>
    /^packages\/sdk-typescript\/\.changeset\/[^/]+\.md$/.test(file) &&
    !file.endsWith("/README.md"),
);

if (sdkChanges.length > 0 && changesets.length === 0) {
  console.error(
    "SDK changes require a Changeset in packages/sdk-typescript/.changeset/*.md",
  );
  console.error(`Changed SDK files: ${sdkChanges.join(", ")}`);
  process.exit(1);
}

console.log(
  sdkChanges.length === 0
    ? "No release-worthy SDK changes detected"
    : `Changeset found for ${sdkChanges.length} SDK change(s)`,
);
