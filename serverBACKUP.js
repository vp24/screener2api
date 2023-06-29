const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const apiKey = "AIzaSyARwDLgkZBMtI-mFiVjzuZiRsnacuqpEsE";
const searchEngineId = "d4523b55004334059";

app.post("/search", async (req, res) => {
  try {
    const { query } = req.body;
    const result = await getFirstLinkFromGoogleSearch(query);
    res.status(200).json({ message: "Success", result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

async function getFirstLinkFromGoogleSearch(query) {
  const searchQuery = `${query} marketscreener`;

  const response = await axios.get(
    "https://www.googleapis.com/customsearch/v1",
    {
      params: {
        q: searchQuery,
        cx: searchEngineId,
        key: apiKey,
      },
    }
  );

  const searchResults = response.data.items;
  const firstLink = searchResults.find((result) =>
    result.link.includes("marketscreener.com")
  ).link;

  const scrapeLink = `${firstLink}finances/`;

  return scrapeLink;
}

app.get("/api/scrape", async (req, res) => {
    try {
      const { query } = req.query;
      const scrapeLink = query
        ? query
        : "https://www.marketscreener.com/quote/stock/KELLOGG-COMPANY-13226/finances/";
  
      const response = await axios.get(scrapeLink);
      const html = response.data;
      const $ = cheerio.load(html);
  
      const tables = ["valuationTable", "iseTableA", "bsTable"]; // Added "bsTable"
      const pr10Elements = $(".pr-10");
      let pr10Texts = [];
      pr10Elements.each(function () {
        const text = $(this).text().trim();
        if (text !== '') {
          pr10Texts.push(text);
        }
      });
      const scrapedData = [];
  
      for (let i = 0; i < tables.length; i++) {
        const tableID = tables[i];
        const table = $("#" + tableID);
        const tableRows = table.find("tr");
        const tableData = [];
  
        tableRows.each(function () {
          const cells = $(this).find("th, td");
          let cellTexts = cells
            .map(function () {
              let cellText = $(this).text().trim();
              cellText = cellText.replace(/capitalization/i, 'Mkt Cap');
              cellText = cellText.replace(/\s+/g, " ");
              cellText = cellText.replace(/,/g, ".");
              cellText = cellText.replace(/(\d) (\d)/g, "$1,$2");
              return cellText;
            })
            .get();
  
          cellTexts = cellTexts.map(text => text === 'Capitalization' ? 'Mkt Cap' : text);
  
          tableData.push(cellTexts);
        });
  
        scrapedData.push({
          tableID,
          tableData,
          pr10Text: pr10Texts[i],
        });
      }
  
      res.json(scrapedData);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });
  

app.get("/api/yahoo", async (req, res) => {
  try {
    const { query } = req.query;
    const yahooData = await getYahooStuff(query);
    res.json(yahooData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

async function getYahooStuff(query) {
  const sym = query.toLowerCase();

  const url = `https://finance.yahoo.com/quote/${sym}/analysis/`;
  const response = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    },
  });
  const $ = cheerio.load(response.data);

  const elements = $('.Ta\\(end\\)');

  const extractedText = [];
  elements.each((index, element) => {
    const text = $(element).text().trim();
    extractedText.push(text);
  });

  const numElementsToRemoveFirst = 72;
  const numElementsToKeepEpsTrend = 24;
  const numElementsToKeepGrowthEstimates = 24;

  const epsTrend = extractedText.slice(numElementsToRemoveFirst, numElementsToRemoveFirst + numElementsToKeepEpsTrend);
  let growthEstimates = extractedText.slice(-numElementsToKeepGrowthEstimates);

  growthEstimates = growthEstimates.filter(value => value !== 'N/A');

  return { epsTrend, growthEstimates };
}

const port = 3001;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
