import fixturez from "fixturez";
import * as github from "@actions/github";
import * as githubExec from "@actions/exec";
import fs from "fs-extra";
import path from "path";
import writeChangeset from "@changesets/write";
import { Changeset } from "@changesets/types";
import { runVersion, runPublish } from "./run";

jest.mock("@actions/github", () => ({
  context: {
    repo: {
      owner: "changesets",
      repo: "action",
    },
    ref: "refs/heads/some-branch",
    sha: "xeac7",
  },
}));
jest.mock("@actions/github/lib/utils", () => ({
  GitHub: {
    plugin: () => {
      // function necessary to be used as constructor
      return function () {
        return {
          rest: mockedGithubMethods,
        };
      };
    },
  },
  getOctokitOptions: jest.fn(),
}));
jest.mock("./gitUtils");

let mockedExecResponse: Awaited<ReturnType<typeof githubExec.getExecOutput>> = {
  exitCode: 1,
  stderr: "",
  stdout: "",
};

jest
  .spyOn(githubExec, "getExecOutput")
  .mockImplementation(() => Promise.resolve(mockedExecResponse));

let mockedGithubMethods = {
  search: {
    issuesAndPullRequests: jest.fn(),
  },
  pulls: {
    create: jest.fn(),
  },
  repos: {
    createRelease: jest.fn(),
  },
};

let f = fixturez(__dirname);

const linkNodeModules = async (cwd: string) => {
  await fs.symlink(
    path.join(__dirname, "..", "node_modules"),
    path.join(cwd, "node_modules")
  );
};
const writeChangesets = (changesets: Changeset[], cwd: string) => {
  return Promise.all(changesets.map((commit) => writeChangeset(commit, cwd)));
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("version", () => {
  it("creates simple PR", async () => {
    let cwd = f.copy("simple-project");
    linkNodeModules(cwd);

    mockedGithubMethods.search.issuesAndPullRequests.mockImplementationOnce(
      () => ({ data: { items: [] } })
    );

    mockedGithubMethods.pulls.create.mockImplementationOnce(() => ({
      data: { number: 123 },
    }));

    await writeChangesets(
      [
        {
          releases: [
            {
              name: "simple-project-pkg-a",
              type: "minor",
            },
            {
              name: "simple-project-pkg-b",
              type: "minor",
            },
          ],
          summary: "Awesome feature",
        },
      ],
      cwd
    );

    await runVersion({
      githubToken: "@@GITHUB_TOKEN",
      cwd,
    });

    expect(mockedGithubMethods.pulls.create.mock.calls[0]).toMatchSnapshot();
  });

  it("only includes bumped packages in the PR body", async () => {
    let cwd = f.copy("simple-project");
    linkNodeModules(cwd);

    mockedGithubMethods.search.issuesAndPullRequests.mockImplementationOnce(
      () => ({ data: { items: [] } })
    );

    mockedGithubMethods.pulls.create.mockImplementationOnce(() => ({
      data: { number: 123 },
    }));

    await writeChangesets(
      [
        {
          releases: [
            {
              name: "simple-project-pkg-a",
              type: "minor",
            },
          ],
          summary: "Awesome feature",
        },
      ],
      cwd
    );

    await runVersion({
      githubToken: "@@GITHUB_TOKEN",
      cwd,
    });

    expect(mockedGithubMethods.pulls.create.mock.calls[0]).toMatchSnapshot();
  });

  it("doesn't include ignored package that got a dependency update in the PR body", async () => {
    let cwd = f.copy("ignored-package");
    linkNodeModules(cwd);

    mockedGithubMethods.search.issuesAndPullRequests.mockImplementationOnce(
      () => ({ data: { items: [] } })
    );

    mockedGithubMethods.pulls.create.mockImplementationOnce(() => ({
      data: { number: 123 },
    }));

    await writeChangesets(
      [
        {
          releases: [
            {
              name: "ignored-package-pkg-b",
              type: "minor",
            },
          ],
          summary: "Awesome feature",
        },
      ],
      cwd
    );

    await runVersion({
      githubToken: "@@GITHUB_TOKEN",
      cwd,
    });

    expect(mockedGithubMethods.pulls.create.mock.calls[0]).toMatchSnapshot();
  });

  it("does not include changelog entries if full message exceeds size limit", async () => {
    let cwd = f.copy("simple-project");
    linkNodeModules(cwd);

    mockedGithubMethods.search.issuesAndPullRequests.mockImplementationOnce(
      () => ({ data: { items: [] } })
    );

    mockedGithubMethods.pulls.create.mockImplementationOnce(() => ({
      data: { number: 123 },
    }));

    await writeChangesets(
      [
        {
          releases: [
            {
              name: "simple-project-pkg-a",
              type: "minor",
            },
          ],
          summary: `# Non manus superum

## Nec cornibus aequa numinis multo onerosior adde

Lorem markdownum undas consumpserat malas, nec est lupus; memorant gentisque ab
limine auctore. Eatque et promptu deficit, quam videtur aequa est **faciat**,
locus. Potentia deus habebat pia quam qui coniuge frater, tibi habent fertque
viribus. E et cognoscere arcus, lacus aut sic pro crimina fuit tum **auxilium**
dictis, qua, in.

In modo. Nomen illa membra.

> Corpora gratissima parens montibus tum coeperat qua remulus caelum Helenamque?
> Non poenae modulatur Amathunta in concita superi, procerum pariter rapto cornu
> munera. Perrhaebum parvo manus contingere, morari, spes per totiens ut
> dividite proculcat facit, visa.

Adspicit sequitur diffamatamque superi Phoebo qua quin lammina utque: per? Exit
decus aut hac inpia, seducta mirantia extremo. Vidi pedes vetus. Saturnius
fluminis divesque vulnere aquis parce lapsis rabie si visa fulmineis.
`,
        },
      ],
      cwd
    );

    await runVersion({
      githubToken: "@@GITHUB_TOKEN",
      cwd,
      prBodyMaxCharacters: 1000,
    });

    expect(mockedGithubMethods.pulls.create.mock.calls[0]).toMatchSnapshot();
    expect(mockedGithubMethods.pulls.create.mock.calls[0][0].body).toMatch(
      /The changelog information of each package has been omitted from this message/
    );
  });

  it("does not include any release information if a message with simplified release info exceeds size limit", async () => {
    let cwd = f.copy("simple-project");
    linkNodeModules(cwd);

    mockedGithubMethods.search.issuesAndPullRequests.mockImplementationOnce(
      () => ({ data: { items: [] } })
    );

    mockedGithubMethods.pulls.create.mockImplementationOnce(() => ({
      data: { number: 123 },
    }));

    await writeChangesets(
      [
        {
          releases: [
            {
              name: "simple-project-pkg-a",
              type: "minor",
            },
          ],
          summary: `# Non manus superum

## Nec cornibus aequa numinis multo onerosior adde

Lorem markdownum undas consumpserat malas, nec est lupus; memorant gentisque ab
limine auctore. Eatque et promptu deficit, quam videtur aequa est **faciat**,
locus. Potentia deus habebat pia quam qui coniuge frater, tibi habent fertque
viribus. E et cognoscere arcus, lacus aut sic pro crimina fuit tum **auxilium**
dictis, qua, in.

In modo. Nomen illa membra.

> Corpora gratissima parens montibus tum coeperat qua remulus caelum Helenamque?
> Non poenae modulatur Amathunta in concita superi, procerum pariter rapto cornu
> munera. Perrhaebum parvo manus contingere, morari, spes per totiens ut
> dividite proculcat facit, visa.

Adspicit sequitur diffamatamque superi Phoebo qua quin lammina utque: per? Exit
decus aut hac inpia, seducta mirantia extremo. Vidi pedes vetus. Saturnius
fluminis divesque vulnere aquis parce lapsis rabie si visa fulmineis.
`,
        },
      ],
      cwd
    );

    await runVersion({
      githubToken: "@@GITHUB_TOKEN",
      cwd,
      prBodyMaxCharacters: 500,
    });

    expect(mockedGithubMethods.pulls.create.mock.calls[0]).toMatchSnapshot();
    expect(mockedGithubMethods.pulls.create.mock.calls[0][0].body).toMatch(
      /All release information have been omitted from this message, as the content exceeds the size limit/
    );
  });

  it("should include provided assets in github release notes", async () => {
    let cwd = f.copy("simple-project");
    linkNodeModules(cwd);

    mockedGithubMethods.search.issuesAndPullRequests.mockImplementationOnce(
      () => ({ data: { items: [] } })
    );

    mockedGithubMethods.pulls.create.mockImplementationOnce(() => ({
      data: { number: 123 },
    }));

    await writeChangesets(
      [
        {
          releases: [
            {
              name: "simple-project-pkg-c",
              type: "minor",
            },
          ],
          summary: "I have assets",
        },
      ],
      cwd
    );

    await runVersion({
      githubToken: "@@GITHUB_TOKEN",
      githubReleaseAssets: ["packages/pkg-c/*.ts"],
      cwd,
    });

    expect(mockedGithubMethods.pulls.create.mock.calls[0][0].body)
      .toMatchInlineSnapshot(`
      "This PR was opened by the [Changesets release](https://github.com/changesets/action) GitHub action. When you're ready to do a release, you can merge this and publish to npm yourself or [setup this action to publish automatically](https://github.com/changesets/action#with-publishing). If you're not ready to do a release yet, that's fine, whenever you add more changesets to some-branch, this PR will be updated.


      # Releases
      ## simple-project-pkg-c@1.1.0

      ### Minor Changes

      -   I have assets

      # GitHub Release Assets

      1. \`packages/pkg-c/*.ts\`
      "
    `);
  });
});

describe("publish", () => {
  it("should create a github release per each package by default", async () => {
    let cwd = f.copy("simple-project-published");
    linkNodeModules(cwd);

    // Fake a publish command result
    mockedExecResponse = {
      exitCode: 0,
      stderr: "",
      stdout: [
        `🦋  New tag: simple-project-pkg-a@0.0.1`,
        `🦋  New tag: simple-project-pkg-b@0.0.1`,
      ].join("\n"),
    };

    // Fake a CHANGELOG.md files

    const response = await runPublish({
      githubToken: "@@GITHUB_TOKEN",
      createGithubReleases: true,
      script: "npm run release",
      githubReleaseAssets: [],
      cwd,
    });

    expect(response.published).toBeTruthy();
    response.published && expect(response.publishedPackages.length).toBe(2);
    expect(mockedGithubMethods.repos.createRelease.mock.calls.length).toBe(2);
    expect(mockedGithubMethods.repos.createRelease.mock.calls[0][0].name).toBe(
      "simple-project-pkg-a@0.0.1"
    );
    expect(mockedGithubMethods.repos.createRelease.mock.calls[1][0].name).toBe(
      "simple-project-pkg-b@0.0.1"
    );
  });

  it("should create a github release for a single (root) package by default", async () => {
    let cwd = f.copy("simple-single-package-published");
    linkNodeModules(cwd);

    // Fake a publish command result
    mockedExecResponse = {
      exitCode: 0,
      stderr: "",
      stdout: [`🦋  New tag:  v1.0.0`].join("\n"),
    };

    // Fake a CHANGELOG.md files

    const response = await runPublish({
      githubToken: "@@GITHUB_TOKEN",
      createGithubReleases: true,
      script: "npm run release",
      githubReleaseAssets: [],
      cwd,
    });

    expect(response.published).toBeTruthy();
    response.published && expect(response.publishedPackages.length).toBe(1);

    expect(mockedGithubMethods.repos.createRelease.mock.calls.length).toBe(1);
    expect(mockedGithubMethods.repos.createRelease.mock.calls[0][0].name).toBe(
      "v1.0.0"
    );
    expect(mockedGithubMethods.repos.createRelease.mock.calls[0][0].body).toBe(
      `### Patch Changes

-   259a9e8: fixed critical bug
`
    );
  });

  it("should create an aggregated github release when createGithubReleases: aggreate is set", async () => {
    let cwd = f.copy("simple-project-published");
    linkNodeModules(cwd);

    // Fake a publish command result
    mockedExecResponse = {
      exitCode: 0,
      stderr: "",
      stdout: [
        `🦋  New tag: simple-project-pkg-a@0.0.1`,
        `🦋  New tag: simple-project-pkg-b@0.0.1`,
      ].join("\n"),
    };

    const response = await runPublish({
      githubToken: "@@GITHUB_TOKEN",
      createGithubReleases: "aggregate",
      script: "npm run release",
      githubReleaseName: "", // make sure empty string is treat as undefined parameter
      githubReleaseAssets: [],
      cwd,
    });

    expect(response.published).toBeTruthy();
    response.published && expect(response.publishedPackages.length).toBe(2);
    expect(mockedGithubMethods.repos.createRelease.mock.calls.length).toBe(1);
    const params = mockedGithubMethods.repos.createRelease.mock.calls[0][0];

    expect(params.name).toEqual(expect.stringContaining("Release "));
    expect(params.body).toContain(`## simple-project-pkg-a@0.0.1`);
    expect(params.body).toContain(`## simple-project-pkg-b@0.0.1`);
    expect(params.body).toContain(`change something in a`);
    expect(params.body).toContain(`change something in b`);
  });

  it("should allow to customize release title with createGithubReleases: aggreate", async () => {
    let cwd = f.copy("simple-project-published");
    linkNodeModules(cwd);

    // Fake a publish command result
    mockedExecResponse = {
      exitCode: 0,
      stderr: "",
      stdout: [
        `🦋  New tag: simple-project-pkg-a@0.0.1`,
        `🦋  New tag: simple-project-pkg-b@0.0.1`,
      ].join("\n"),
    };

    const response = await runPublish({
      githubToken: "@@GITHUB_TOKEN",
      createGithubReleases: "aggregate",
      script: "npm run release",
      githubReleaseName: `My Test Release`,
      githubTagName: `mytag`,
      githubReleaseAssets: [],
      cwd,
    });

    console.log("response", response);

    expect(response.published).toBeTruthy();
    response.published && expect(response.publishedPackages.length).toBe(2);
    expect(mockedGithubMethods.repos.createRelease.mock.calls.length).toBe(1);
    const params = mockedGithubMethods.repos.createRelease.mock.calls[0][0];

    expect(params.name).toBe("My Test Release");
    expect(params.body).toContain(`## simple-project-pkg-a@0.0.1`);
    expect(params.body).toContain(`## simple-project-pkg-b@0.0.1`);
    expect(params.body).toContain(`change something in a`);
    expect(params.body).toContain(`change something in b`);
  });
});
