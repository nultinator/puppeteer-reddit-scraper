const puppeteer = require("puppeteer");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const csvParse = require("csv-parse");
const fs = require("fs");

const API_KEY = "YOUR-SUPER-SECRET-API-KEY";


async function writeToCsv(data, outputFile) {
    if (!data || data.length === 0) {
        throw new Error("No data to write!");
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
    } catch (e) {
        throw new Error("Failed to write to csv");
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
                        try {
                            await writeToCsv([articleData], `./${feed}.csv`);
                            namesSeen.push(articleData.name);
                        } catch {
                            throw new Error("failed to write csv file:", articleData);
                        }
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
        
        try {
            await page.goto(getScrapeOpsUrl(r_url), {timeout: 30000});
            const commentData = await page.$eval("pre", pre => pre.textContent);
            if (!commentData) {
                throw new Error(`No comment data found: ${fileName}`);
            }
            const comments = JSON.parse(commentData);
            
            const commentsList = comments[1].data.children;

            if (commentsList.length === 0) {
                return;
            }

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
            await page.screenshot({path: `ERROR-${fileName}.png`});
            console.log(`Error fetching comments for ${fileName}, retries left: ${retries - tries}`);
            tries++;
        } finally {
            await page.close();
        }
    }
    if (!success) {
        console.log(`Max retries exceeded for: ${postObject.permalink}`);
        return;
    }
    return;
}

async function processPosts(browser, inputFile, concurrencyLimit, location="us", retries=3) {
    const posts = await readCsv(inputFile);

    while (posts.length > 0) {
        const currentBatch = posts.splice(0, concurrencyLimit);
        const tasks = currentBatch.map(post => processPost(browser, post, location, retries));

        try {
            await Promise.all(tasks);
        } catch (e) {
            console.log("Failed to process batch");
        }

    }

}

async function main() {
    const FEEDS = ["news"];
    const RETRIES = 4;
    const BATCH_SIZE = 100;
    const concurrencyLimit = 20;

    AGGREGATED_FEEDS = [];

    const browser = await puppeteer.launch();
    for (const feed of FEEDS) {
        await getPosts(browser, feed, limit=BATCH_SIZE, RETRIES);
        AGGREGATED_FEEDS.push(`${feed}.csv`);
    }

    for (const individualFile of AGGREGATED_FEEDS) {
        await processPosts(browser, individualFile,concurrencyLimit, RETRIES);
    }
    await browser.close();
}

main();