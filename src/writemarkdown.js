// Copyright (c) 2015, Jessica Lord All rights reserved.
// This code is licensed under BSD license (see https://github.com/jlord/offline-issues/blob/master/LICENSE.md for details)

const fs = require("fs").promises;
const path = require("path");

const handlebars = require("handlebars");
const mkdirp = require("mkdirp").sync;

async function writemarkdown(options) {
  let dest;
  if (options.destination) {
    dest = path.resolve(options.destination, "md");
  } else {
    dest = "md";
  }

  mkdirp(dest);

  let issues = await fs.readFile("comments.json", "utf8");
  issues = JSON.parse(issues);

  for (const issue of issues) {
    const filename = repoDetails(issue.url);
    const source = await fs.readFile(
      path.join(__dirname, "/templates/markdown.hbs"),
      "utf8"
    );

    // custom escape
    handlebars.registerHelper("title", function () {
      return new handlebars.SafeString(this.title);
    });

    handlebars.registerHelper("body", function () {
      return new handlebars.SafeString(this.body);
    });

    handlebars.registerHelper("comment_body", function () {
      return new handlebars.SafeString(this.body);
    });

    const template = handlebars.compile(source.toString());
    const result = template(issue);

    try {
      await fs.writeFile(path.join(dest, filename) + ".md", result);
    } catch (err) {
      throw new Error("Error writing md file: " + err.message);
    }
  }

  return "Wrote markdown files.";
}

function repoDetails(issue) {
  const a = issue.split("/");
  const filename = `${a[3]}-${a[4]}-${a[6]}`;
  return filename;
}

module.exports = writemarkdown;
