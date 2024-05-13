const puppeteer = require("puppeteer");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const csvParse = require("csv-parse");
const fs = require("fs");

const API_KEY = "YOUR-SUPER-SECRET-API-KEY";
const DEFAULT_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";


async function getPosts(browser, feed, limit=10, retries=3) {
    let tries = 0;
    let success = false;

    while (tries <= retries && !success) {
        const page = await browser.newPage();
        const namesSeen = [];
        try {
            const url = `https://www.reddit.com/r/${feed}.json?limit=${limit}`;
            await page.setUserAgent(DEFAULT_USER_AGENT);
            await page.goto(url);
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
                        console.log(articleData);
                        namesSeen.push(articleData.name);
                    }
                }
            }
        } catch (e) {
            await page.screenshot({path: "error.png"});
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
    const BATCH_SIZE = 10;

    AGGREGATED_FEEDS = [];

    const browser = await puppeteer.launch();
    for (const feed of FEEDS) {
        await getPosts(browser, feed, limit=BATCH_SIZE, retries=RETRIES);
        AGGREGATED_FEEDS.push(`${feed}.csv`);
    }

    await browser.close();
}

main();