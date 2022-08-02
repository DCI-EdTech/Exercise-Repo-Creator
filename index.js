#! /usr/bin/env node

const { Octokit } = require("@octokit/rest");
const globy = require("globy");
const fs = require("fs-extra");
const path = require("path");
const { isText, isBinary, getEncoding } = require("istextorbinary");
const { get } = require("http");
const { exit } = require("process");

const githubPAT = process.env.GITHUB_PAT;
let octokit = null;
let isPrivate = true;

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
  const paths = globy.glob(`${folder}/**/*`, globOptions);
  // filter out directories
  const filesPaths = paths.filter((path) => fs.lstatSync(path).isFile());
  console.log("filesPaths", filesPaths);
  const exerciseFiles = globy.glob(`./*`, globOptions);
  // console.log("exercise files", exerciseFiles);
  // filesPaths.push("README.md");
  const blobs = await Promise.all(filesPaths.map(createBlobForFile(repo, org)));
  const blobsPaths = filesPaths.map((fullPath) => {
    /**
     * It seems that createTree doesn't work well with the relative path ../README.md
     *
     * So instead of passing the path relative to the folder "main" or "solution"
     * I'm just passing it from the main folder
     */

    if (fullPath === "README.md") {
      return path.relative("./", fullPath);
    } else {
      return path.relative(folder, fullPath);
    }
  });
  console.log("blobspath", blobsPaths);

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

  let response = null;
  try {
    response = await octokit.rest.git.createTree({
      owner: org,
      repo: repo.data.name,
      base_tree: parentTreeSha,
      tree,
    });
  } catch (e) {
    console.log(e);
  }
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
  console.log(`Checking if the branch ${folder} exists...`);
  try {
    branch = await octokit.rest.repos.getBranch({
      owner: org,
      repo: repo.data.name,
      branch: folder,
    });
  } catch (e) {
    console.log(`\nThe branch ${folder} does not exist.`);
    console.log(`Creating the branch ${folder}.`);
    // console.log(e);
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
  const commitMessage = `Update branch`;
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
  console.log(`Checking if repo ${owner}/${name} exists...`);
  try {
    // owner can be both a user or an organisation
    return await octokit.rest.repos.get({
      owner: owner,
      repo: name,
    });
  } catch (e) {
    console.log(`Repo ${owner}/${name} does not exist.`);
    return e;
  }
}

async function doesRepoExist(name, owner) {
  const repo = await getRepo(name, owner);
  return repo.status === 200;
}

async function updateRepo(name, org) {
  console.log("Update repo");
  return await octokit.rest.repos.update({
    owner: org,
    repo: name,
    auto_init: true,
    private: isPrivate,
    is_template: true,
  });
}

async function createRepo(name, org) {
  const repoExists = await doesRepoExist(name, org);
  if (!repoExists) {
    console.log(`Creating repositories ${name}...`);
    return await octokit.rest.repos.createInOrg({
      org: org,
      name: name,
      auto_init: true,
      is_template: true,
      private: isPrivate,
    });
  }
  console.log(`The repository ${name} exists already, updating it now...`);
  return await updateRepo(name, org);
}

async function getToDoColumnId(issue, owner) {
  const projects = await octokit.rest.projects.listForOrg({
    org: owner,
  });
  console.log("projects", projects);
  console.log("issue", issue);
  
  const project = projects.data.find(
    (project) => project.name.toLowerCase() === issue.projectName.toLowerCase()
  );
  const projectColumns = await octokit.rest.projects.listColumns({
    project_id: project.id,
  });

  const column = projectColumns.data.find(
    (column) =>
      column.name.trim().toLowerCase() === issue.columnName.toLowerCase()
  );
  return column.id;
}

async function createIssue(issue, repo, owner) {
  console.log(`create issue ${issue.title}`);
  const existingIssues = await octokit.rest.issues.listForRepo({
    owner: owner,
    repo: repo.data.name,
  });
  let codeBuddyIssue = existingIssues.data.find(
    (existingIssue) => existingIssue.title === issue.title
  );
  if (!codeBuddyIssue) {
    const todoColumnId = await getToDoColumnId(issue, owner);
    codeBuddyIssue = await octokit.rest.issues.create({
      owner: owner,
      repo: repo.data.name,
      title: issue.title,
      body: issue.body,
    });
    await octokit.rest.projects.createCard({
      column_id: todoColumnId,
      content_id: codeBuddyIssue.data.id,
      content_type: "Issue",
    });
  }
}

function exerciseTitle() {
  const readme = fs.readFileSync("main/README.md", "utf8");
  const title = readme.match(/^#\s+.+/);
  return title[0].replace("#", "").trim();
}

async function createIssues(repo, owner) {
  const issues = [
    {
      title: "Review",
      body: `
## Checklist
- [ ] the name of the repo follows the naming convention MODULE-submodule-exercise-name-
- [ ] the instructions follow the [guidelines](https://digitalcareerinstitute.atlassian.net/wiki/spaces/WD/pages/69534288/Structured+Assignments)
- [ ]
@${owner}/curriculum-editors`,
      projectName: "Creating materials",
      columnName: "Needs review",
    },
    {
      title: "Add CodeBuddy",
      body: `@${owner}/curriculum-editors`,
      projectName: "Autograding Tests",
      columnName: "Pending",
    },
    {
      title: "Add to README.md",
      body: `
\`\`\`
#### ${exerciseTitle()} 

> **When**: <content box title>
>
> **Time**: <time to complete>
>
> **Link**: ${repo.data.html_url}/tree/main
>
> **Solution**: ${repo.data.html_url}/tree/solution

@${owner}/curriculum-editors
\`\`\`
      `,
      projectName: "Creating materials",
      columnName: "Needs review",
    },
  ];
  for (const issue of issues) {
    await createIssue(issue, repo, owner);
  }

}
async function protectBranch(repo, org) {
  console.log("Add branch protection rules...");
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
        permission: "push",
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
  const path = process.cwd().split("/");
  return path[path.length - 1];
}

function orgName() {
  return process.argv[2] || "";
}

const getFileContent = (filePath, encoding) =>
  fs.readFileSync(filePath, encoding);

function createBlobForFile(repo, org) {
  return async function (filePath) {
    const encoding = isBinary(filePath) ? "base64" : "utf8";
    const content = getFileContent(filePath, encoding);
    let blobData = null;
    try {
      blobData = await octokit.rest.git.createBlob({
        owner: org,
        repo: repo.data.name,
        content,
        /* 
          the fs.readFileSync used above seems to require "utf8" to be written without the dash,
          but the octokit function createBlob needs the dash 
        */
        encoding: encoding === "utf8" ? "utf-8" : encoding,
      });
    } catch (e) {
      console.log(e);
    }
    return blobData.data;
  };
}

async function start(repoName, org) {
  validateFolder(repoName);
  let repo = await createRepo(repoName, org);
  console.log("Repo created");
  await protectBranch(repo, org);
  console.log("Protected branch");
  await createIssues(repo, org);
  await addTeamPermissions(repo, org);
  const branchesToUpload = ["main", "solution"];
  console.log("before loop");
  for (const branch of branchesToUpload) {
    await uploadToRepo(branch, repo, org);
  }
}
const org = orgName();

isPrivate = process.argv[3] === "public" ? false : true;

// async function test() {
//   console.log(org);
//   let id = await getColumnId(org);
//   process.exit();
// }
// test();
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
  `
  );
}

/**
 *
 * Check if both folders "main" and "solution" exist
 */
function containsMainSolutionFolders() {
  return fs.existsSync("main") && fs.existsSync("solution");
}

function isRepoNameValid(repoName) {
  const modules = ["BDL", "UIB", "PB", "SPA", "BE"];
  const repoNameSplit = repoName.split("-");

  // does the folder name starts with a valid module shorthand?
  if (!modules.includes(repoNameSplit[0])) {
    return false;
  }

  // a repo name should contain at least 3 parts separated by dashes:
  // moduleName-subModuleName-exerciseName
  if (repoNameSplit.length < 3) {
    return false;
  }
  return true;
}

function validateFolder() {
  if (!containsMainSolutionFolders()) {
    console.log(`
The main folder should contain 2 folders named "main" and "solution".

Refer to the README file for further explanations.
`);
    process.exit();
  }

  if (!isRepoNameValid(repoName)) {
    console.log(`
The repo takes the name from the folder and the folder doesn't follow the right conventions.

`);
    process.exit();
  }
}
