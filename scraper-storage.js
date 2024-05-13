const puppeteer = require("puppeteer");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const csvParse = require("csv-parse");
const fs = require("fs");

const API_KEY = "YOUR-SUPER-SECRET-API-KEY";
const DEFAULT_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";



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

async function readCsv(inputFile) {
    const results = [];
    const parser = fs.createReadStream(inputFile).pipe(csvParse.parse({
        columns: true,
        delimiter: ",",
        trim: true,
        skip_empty_lines: true
    }));

    for await (const record of parser) {
        results.push(record);
    }
    return results;
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

async function processPost(browser, postObject, location="us", retries=3) {
    let tries = 0;
    let success = false;
    
    const r_url = `https://www.reddit.com${postObject.permalink}.json`;

    const linkArray = postObject.permalink.split("/");
    const fileName = linkArray[linkArray.length-2].replace(" ", "-");

    while (tries <= retries && !success) {
        const page = await browser.newPage();

        const namesSeen = [];
        
        try {
            await page.setUserAgent(DEFAULT_USER_AGENT);
            await page.goto(r_url);
            const commentData = await page.$eval("pre", pre => pre.textContent);
            if (!commentData) {
                throw new Error(`No comment data found: ${fileName}`);
            }
            const comments = JSON.parse(commentData);

            
            const commentsList = comments[1].data.children;

            for (const comment of commentsList) {
                if (comment.kind !== "more") {
                    const data = comment.data;

                    const commentData = {
                        name: data.author,
                        body: data.body,
                        upvotes: data.ups
                    }
                    await writeToCsv([commentData], `${fileName}.csv`);
                    success = true;
                }
            }
        } catch (e) {
            await page.screenshot({path: "error.png"});
            console.log(`Error fetching comments for ${fileName}`);
            tries++;
        } finally {
            await page.close();
        }
    }
}

async function processPosts(browser, inputFile, location="us", retries=3) {
    const posts = await readCsv(inputFile);

    for (const post of posts) {
        await processPost(browser, post);
    }
}

async function main() {
    const FEEDS = ["news"];
    const RETRIES = 4;
    const BATCH_SIZE = 1;

    AGGREGATED_FEEDS = [];

    const browser = await puppeteer.launch();
    for (const feed of FEEDS) {
        await getPosts(browser, feed, limit=BATCH_SIZE, retries=RETRIES);
        AGGREGATED_FEEDS.push(`${feed}.csv`);
    }

    for (const individualFile of AGGREGATED_FEEDS) {
        await processPosts(browser, individualFile, retries=RETRIES);
    }
    await browser.close();
}

main();