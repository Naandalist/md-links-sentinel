import fs from "fs";
import path from "path";
import https from "https";
import url from "url";

interface LinkCheckResult {
  url: string;
  status: number | "skipped" | "error";
  message?: string;
}

interface StatusCounts {
  "200": number;
  "404": number;
  error: number;
  skipped: number;
  other: number;
}

async function checkDeadLinksInMarkdownFile(filePath: string): Promise<void> {
  // Function to read markdown content from file
  function readMarkdownFile(filePath: string): string {
    try {
      return fs.readFileSync(filePath, "utf8");
    } catch (error) {
      console.error(`Error reading file: ${(error as Error).message}`);
      process.exit(1);
    }
  }

  // Function to extract links from md file
  function extractLinks(markdown: string): string[] {
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    const links: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = linkRegex.exec(markdown)) !== null) {
      links.push(match[2]);
    }
    return links;
  }

  // Function to resolve relative URL
  function resolveURL(base: string, relative: string): string {
    if (relative.startsWith("http://") || relative.startsWith("https://")) {
      return relative;
    }
    return url.resolve(base, relative);
  }

  // Function to check a single link
  function checkLink(linkURL: string): Promise<LinkCheckResult> {
    return new Promise((resolve) => {
      if (!linkURL.startsWith("http://") && !linkURL.startsWith("https://")) {
        resolve({
          url: linkURL,
          status: "skipped",
          message: "Not an HTTP/HTTPS URL",
        });
        return;
      }

      https
        .get(linkURL, (res) => {
          resolve({
            url: linkURL,
            status: res.statusCode ?? 0,
          });
        })
        .on("error", (e: Error) => {
          resolve({
            url: linkURL,
            status: "error",
            message: e.message,
          });
        });
    });
  }

  // Function to creating a progress bar
  function createProgressBar(
    current: number,
    total: number,
    width: number = 50
  ): string {
    const percentage = Math.round((current / total) * 100);
    const filledWidth = Math.round((width * current) / total);
    const bar = "=".repeat(filledWidth) + " ".repeat(width - filledWidth);
    return `[${bar}] ${percentage}%`;
  }

  // Function to log check link result
  function logLinkCheckResult(
    number: number,
    total: number,
    result: LinkCheckResult
  ): void {
    console.log(`\nLink ${number}/${total}: ${result.url}`);
    console.log(`Status: ${result.status}`);
    if (result.message) {
      console.log(`Message: ${result.message}`);
    }
    console.log(createProgressBar(number, total));
  }

  // Main function start here
  const markdown = readMarkdownFile(filePath);
  const fileDir = path.dirname(filePath);
  const baseURL = `file://${fileDir}/`;
  const links = extractLinks(markdown);
  const resolvedLinks = links.map((link) => resolveURL(baseURL, link));
  const totalLinks = resolvedLinks.length;

  console.log(`Starting to check ${totalLinks} links...\n`);

  const statusCounts: StatusCounts = {
    "200": 0,
    "404": 0,
    error: 0,
    skipped: 0,
    other: 0,
  };

  const notFoundLinks: string[] = [];

  for (let i = 0; i < resolvedLinks.length; i++) {
    const link = resolvedLinks[i];
    try {
      const result = await checkLink(link);

      // Update status count
      if (result.status === 200) {
        statusCounts["200"]++;
      } else if (result.status === 404) {
        statusCounts["404"]++;
        notFoundLinks.push(result.url);
      } else if (result.status === "error") {
        statusCounts.error++;
      } else if (result.status === "skipped") {
        statusCounts.skipped++;
      } else {
        statusCounts.other++;
      }

      // Log all results, including 200 status
      logLinkCheckResult(i + 1, totalLinks, result);
    } catch (error) {
      console.error("An error occurred:", error);
      statusCounts.error++;
    }
  }

  // Print summary
  console.log("\nSummary:");
  console.log(`Total links checked: ${totalLinks}`);
  console.log(`OK (200): ${statusCounts["200"]}`);
  console.log(`Not Found (404): ${statusCounts["404"]}`);
  console.log(`Errors: ${statusCounts.error}`);
  console.log(`Skipped: ${statusCounts.skipped}`);
  console.log(`Other status codes: ${statusCounts.other}`);

  // Print list of 404 links
  if (notFoundLinks.length > 0) {
    console.log("\nLinks returning 404 (Not Found):");
    notFoundLinks.forEach((link, index) => {
      console.log(`${index + 1}. ${link}`);
    });
  }
}

checkDeadLinksInMarkdownFile("file.md");
