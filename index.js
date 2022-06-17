#! /usr/bin/env node

const { Octokit } = require("@octokit/rest");
const globy = require("globy");
const fs = require("fs-extra");
const path = require("path");

const githubPAT = process.env.GITHUB_PAT;
let octokit = null;

if (!githubPAT) {
  printInstructions();
  process.exit();
}

try {
  octokit = new Octokit({
    auth: githubPAT,
  });
} catch (e) {
  console.log(e);
  process.exit();
}

const getCurrentCommit = async (repo, org, branch) => {
  const { data: refData } = await octokit.rest.git.getRef({
    owner: org,
    repo: repo.data.name,
    ref: `heads/${branch}`,
  });

  const commitSha = refData.object.sha;

  const { data: commitData } = await octokit.rest.git.getCommit({
    owner: org,
    repo: repo.data.name,
    commit_sha: commitSha,
  });

  return {
    commitSha,
    treeSha: commitData.tree.sha,
  };
};

async function setBranchToCommit(repo, org, branch, commitSha) {
  octokit.rest.git.updateRef({
    owner: org,
    repo: repo.data.name,
    ref: `heads/${branch}`,
    sha: commitSha,
  });
}

async function getCommits(repoName, owner, branchName) {
  return await octokit.rest.repos.listCommits({
    owner: owner,
    repo: repoName,
    sha: branchName,
  });
}

async function getBlobsData(folder, repo, org) {
  const globOptions = {
    dot: true,
    nocase: false,
    nofollow: false,
  };
  const filesPaths = globy.glob(`${folder}/**/*.*`, globOptions);
  const blobs = await Promise.all(filesPaths.map(createBlobForFile(repo, org)));
  const blobsPaths = filesPaths.map((fullPath) =>
    path.relative(folder, fullPath)
  );

  return {
    blobs,
    blobsPaths,
  };
}

async function createTree(repo, org, blobs, paths, parentTreeSha) {
  const tree = blobs.map(({ sha }, index) => ({
    path: paths[index],
    mode: "100644",
    type: "blob",
    sha,
  }));

  const response = await octokit.rest.git.createTree({
    owner: org,
    repo: repo.data.name,
    base_tree: parentTreeSha,
    tree,
  });
  return response.data;
}

async function createCommit(
  repo,
  org,
  message,
  currentTreeSha,
  currentCommitSha
) {
  return await octokit.rest.git.createCommit({
    owner: org,
    repo: repo.data.name,
    message,
    tree: currentTreeSha,
    parents: [currentCommitSha],
  });
}

async function uploadToRepo(folder, repo, org) {
  const { blobs, blobsPaths } = await getBlobsData(folder, repo, org);
  let branch = null;
  let currentCommit = null;
  try {
    branch = await octokit.rest.repos.getBranch({
      owner: org,
      repo: repo.data.name,
      branch: folder,
    });
  } catch (e) {
    console.log("BRANCH");
    console.log(e);
  }

  if (!branch) {
    currentCommit = await getCurrentCommit(repo, org, "main");
    octokit.rest.git.createRef({
      owner: org,
      repo: repo.data.name,
      ref: `refs/heads/${folder}`,
      sha: currentCommit.commitSha,
    });
  } else {
    currentCommit = await getCurrentCommit(repo, org, folder);
  }

  const newTree = await createTree(
    repo,
    org,
    blobs,
    blobsPaths,
    currentCommit.treeSha
  );
  const commitMessage = `My commit message`;
  const newCommit = await createCommit(
    repo,
    org,
    commitMessage,
    newTree.sha,
    currentCommit.commitSha
  );
  await setBranchToCommit(repo, org, folder, newCommit.data.sha);
}
async function getRepo(name, owner) {
  try {
    // owner can be both a user or an organisation
    return await octokit.rest.repos.get({
      owner: owner,
      repo: name,
    });
  } catch (error) {
    return error;
  }
}

async function doesRepoExist(name, owner) {
  const repo = await getRepo(name, owner);
  return repo.status === 200;
}

async function updateRepo(name, org) {
  return await octokit.rest.repos.update({
    owner: org,
    repo: name,
    auto_init: true,
    // private: true,
    is_template: true,
  });
}

async function createRepo(name, org) {
  const repoExists = await doesRepoExist(name, org);
  if (!repoExists) {
    return await octokit.rest.repos.createInOrg({
      org: org,
      name: name,
      auto_init: true,
      is_template: true,
      // private: true,
    });
  }
  return await updateRepo(name, org);
}

async function createIssue(repo, owner) {
  const issues = await octokit.rest.issues.listForRepo({
    owner: owner,
    repo: repo.data.name,
  });
  let codeBuddyIssue = issues.data.find(
    (issue) => issue.title === "Add CodeBuddy"
  );
  if (!codeBuddyIssue) {
    codeBuddyIssue = await octokit.rest.issues.create({
      owner: owner,
      repo: repo.data.name,
      title: "Add CodeBuddy",
      body: "I'm having a problem with this.",
    });
    await octokit.rest.projects.createCard({
      column_id: 18829045,
      content_id: codeBuddyIssue.data.id,
      content_type: "Issue",
    });
  }
  // https://api.github.com/projects/columns/{uniqueColumnId}/cards
  // Autograding Tests To do column: uniqueColumnId: 17098531
  // https://github.com/carlotrimarchi-test/test-public/projects/1#column-18828863
}
async function protectBranch(repo, org) {
  return await octokit.rest.repos.updateBranchProtection({
    owner: org,
    repo: repo.data.name,
    branch: "main",
    required_status_checks: null,
    enforce_admins: null,
    restrictions: null,
    required_pull_request_reviews: {
      required_approving_review_count: 3,
    },
  });
}

async function addTeamPermissions(repo, org) {
  const teams = ["curriculum-editors", "lecturers"];
  for (const team of teams) {
    try {
      await octokit.rest.teams.addOrUpdateRepoPermissionsInOrg({
        org: org,
        team_slug: team,
        owner: repo.data.owner.login,
        repo: repo.data.name,
        /**
         * TODO: is it possible that permission write works only on an Enterprise
         * GitHub account?
         *
         * I tested it on a test organization I created with my account and I get a "Validation failed" error
         *
         * - https://octokit.github.io/rest.js/v18#teams-add-or-update-repo-permissions-in-org
         * - https://docs.github.com/en/rest/teams#add-or-update-team-repository-permissions
         */

        // permission: "write",
      });
    } catch (e) {
      console.log(e);
    }
  }
}

async function getUser() {
  return await octokit.rest.users.getAuthenticated();
}

function currentFolder() {
  const path = __dirname.split("/");
  return path[path.length - 1];
}

function orgName() {
  return process.argv[2] || "carlotrimarchi-test";
}

const getFileAsUTF8 = (filePath) => fs.readFile(filePath, "utf8");

function createBlobForFile(repo, org) {
  return async function (filePath) {
    const content = await getFileAsUTF8(filePath);
    let blobData = null;
    try {
      blobData = await octokit.rest.git.createBlob({
        owner: org,
        repo: repo.data.name,
        content,
        encoding: "utf-8",
      });
    } catch (e) {
      console.log(e);
    }
    return blobData.data;
  };
}

async function start(repoName, org) {
  let repo = await createRepo(repoName, org);
  await protectBranch(repo, org);
  await createIssue(repo, org);
  await addTeamPermissions(repo, org);
  const branchesToUpload = ["main", "solution"];
  for (const branch of branchesToUpload) {
    await uploadToRepo(branch, repo, org);
  }
}
const org = orgName();
// the repository name comes from the folder we're in
const repoName = currentFolder();

start(repoName, org);

function printInstructions() {
  console.log(
  `In order to use this script you need a GitHub Personal Access Token:
  
https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token 

If your shell is bash or zsh, just run this command:

export GITHUB_PAT=123abc

Replace "123abc" with the correct GitHub token.

IMPORTANT:
If you want to store the token permanently, you can add the command above at the end of the file ~/.profile (Bash) or ~/.zprofile (zsh).

For further instructions refer to README file
  `);
}
