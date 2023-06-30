// Copyright (c) 2015, Jessica Lord All rights reserved.
// This code is licensed under BSD license (see https://github.com/jlord/offline-issues/blob/master/LICENSE.md for details)

const fs = require("fs").promises;
const axios = require("axios");
const PromiseThrottle = require("promise-throttle");
const writemarkdown = require("./writemarkdown.js");
const Bluebird = require("bluebird");

const githubApiBaseUrl = "https://api.github.com";
let headers = { "user-agent": "offline-issues module" };
let issueData = [];

var promiseThrottle = new PromiseThrottle({
  requestsPerSecond: 10,
  promiseImplementation: Promise,
});

let pagenum = 1;
let allIssues = [];

const parseRepo = async (options) => {
  options.repos = [];

  options._.forEach((val) => {
    const [ownerId, name] = val.split("/");
    let repo = {
      name,
      full_name: val,
      owner: {
        id: ownerId,
      },
      issue: {
        filter: {
          id: "all",
          state: options.state,
        },
      },
    };
    if (name.includes("#")) {
      let [repoName, issueId] = name.split("#");
      repo.name = repoName;
      repo.issue.filter.id = issueId;
    }
    options.repos.push(repo);
  });

  await Promise.all(options.repos.map(getIssues));
  return writeData(options);
};

const getIssues = async (repo) => {
  if (repo.issue.filter.id === "all") return theRequestLoop(repo);

  const url = `${githubApiBaseUrl}/repos/${repo.owner.id}/${repo.name}/issues/${repo.issue.filter.id}`;
  console.log("getIssues", url);

  try {
    const res = await promiseThrottle.add(() => axios(url, { headers }));
    loadIssue(res.data, repo);
  } catch (err) {
    throw new Error("Error in request for issue: " + err.message);
  }
};

const loadIssue = async (body, repo) => {
  var issue = {};

  issue.id = body.id;
  issue.url = body.html_url;
  issue.title = body.title;
  issue.created_by = body.user.login || body.head.user.login;
  issue.created_at = new Date(body.created_at).toLocaleDateString();
  issue.body = body.body;
  issue.state = body.state;
  issue.comments = [];
  issue.comments_url = body.comments_url;
  issue.milestone = body.milestone ? body.milestone.title : null;

  if (repo.issue.filter.id === "all") {
    issue.quicklink = repo.full_name + "#" + body.html_url.split("/").pop();
  } else issue.quicklink = repo.full_name;

  await getComments(issue, repo);
};

const getComments = async (issue, repo) => {
  var url = "";
  if (repo.issue.filter.id === "all") {
    url = issue.comments_url;
  } else {
    url = `${githubApiBaseUrl}/repos/${repo.owner.id}/${repo.name}/issues/${repo.issue.filter.id}/comments`;
  }
  console.log("getComments", url);

  try {
    const res = await promiseThrottle.add(() => axios(url, { headers }));

    issue.comments = res.data;
    issue.comments.forEach((comment) => {
      comment.created_at = new Date(comment.created_at).toLocaleDateString();
    });
    issueData.push(issue);
  } catch (err) {
    throw new Error(
      `Error in request for comments ${comment.url}: ${err.message}`
    );
  }
};

const writeData = async (options) => {
  var data = JSON.stringify(issueData, null, " ");
  var count = JSON.parse(data).length;
  console.log(`Exporting processing ${count} issues.`);

  try {
    await fs.writeFile("comments.json", data);
    await writemarkdown(options);
  } catch (err) {
    throw new Error("Error in writing data file: " + err.message);
  }
};

const theRequestLoop = async (repo) => {
  let query = "/issues?state=" + repo.issue.filter.state + "&page=";
  let limit = "&per_page=1000";
  let url = `${githubApiBaseUrl}/repos/${repo.owner.id}/${repo.name}${query}${pagenum}${limit}`;

  console.log("theRequestLoop", url);

  try {
    const res = await promiseThrottle.add(() => axios(url, { headers }));
    const body = res.data;
    if (body.message) throw new Error(body);
    if (body.length === 0) {
      await Bluebird.map(allIssues, (issue) => loadIssue(issue, repo), {
        concurrency: 10,
      });
      return;
    } else {
      if (body.message) throw new Error(body);
      body.forEach((issue) => {
        allIssues.push(issue);
      });
      pagenum++;
      return getIssues(repo);
    }
  } catch (err) {
    throw new Error("Error in request for issue: " + err.message);
  }
};

module.exports = async function ({ token, ...options }) {
  headers["Authorization"] = "token " + token;
  if (options._.length === 0) throw new Error("No repository given.");
  return parseRepo(options);
};
