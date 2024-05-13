const puppeteer = require("puppeteer");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const csvParse = require("csv-parse");
const fs = require("fs");

const API_KEY = "YOUR-SUPER-SECRET-API-KEY";


async function writeToCsv(data, outputFile) {
    if (!data || data.length === 0) {
        return;
    }
    const fileExists = fs.existsSync(outputFile);

    const headers = Object.keys(data[0]).map(key => ({id: key, title: key}))

    const csvWriter = createCsvWriter({
        path: outputFile,
        header: headers,
        append: fileExists
    });
    try {
        await csvWriter.writeRecords(data);
        console.log(`successfully wrote data to ${outputFile}`);
    } catch (e) {
        console.log(`failed to write to csv: ${e}`);
    }
}


function getScrapeOpsUrl(url, location="us") {
    const params = new URLSearchParams({
        api_key: API_KEY,
        url: url,
        country: location
    });
    return `https://proxy.scrapeops.io/v1/?${params.toString()}`;
}

async function getPosts(browser, feed, limit=10, retries=3) {
    let tries = 0;
    let success = false;

    while (tries <= retries && !success) {
        const page = await browser.newPage();
        const namesSeen = [];
        try {
            const url = `https://www.reddit.com/r/${feed}.json?limit=${limit}`;
            await page.goto(getScrapeOpsUrl(url));
            success = true;
            const jsonText = await page.$eval("pre", pre => pre.textContent);
            const resp = JSON.parse(jsonText);
            if (resp) {
                const children = resp.data.children;
                for (const child of children) {
                    data = child.data;
                    const articleData = {
                        name: data.title,
                        author: data.author,
                        permalink: data.permalink,
                        upvoteRatio: data.upvote_ratio
                    }
                    if (!namesSeen.includes(articleData.name)) {
                        await writeToCsv([articleData], `./${feed}.csv`);
                        namesSeen.push(articleData.name);
                    }
                }
            }
        } catch (e) {
            console.log(`ERROR: ${e}`);
            tries++;
        } finally {
            await page.close();
        }
    }
}


async function main() {
    const FEEDS = ["news"];
    const RETRIES = 4;
    const BATCH_SIZE = 100;

    AGGREGATED_FEEDS = [];

    const browser = await puppeteer.launch();
    for (const feed of FEEDS) {
        await getPosts(browser, feed, limit=BATCH_SIZE, retries=RETRIES);
        AGGREGATED_FEEDS.push(`${feed}.csv`);
    }

    await browser.close();
}

main();