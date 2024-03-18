const express = require("express");
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const axios = require("axios");
const cheerio = require("cheerio");
const cors = require("cors");

// App constants
const API_KEY = "AIzaSyARwDLgkZBMtI-mFiVjzuZiRsnacuqpEsE";
const SEARCH_ENGINE_ID = "d4523b55004334059";
const GOOGLE_API_URL = "https://www.googleapis.com/customsearch/v1";
const PORT = process.env.PORT || 3001;


// App initializations
const app = express();
app.use(cors());
app.use(express.json());

// MongoDB Connection
mongoose.connect('mongodb+srv://vp:klmklm24@cluster0.ijoz1wp.mongodb.net/', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

const userSchema = new mongoose.Schema({
  username: String,
  password: String,
});

const User = mongoose.model('User', userSchema);

// Authentication routes:

app.post('/signup', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Both username and password are required.' });
  }

  const existingUser = await User.findOne({ username });
  if (existingUser) {
    return res.status(400).json({ error: 'Username already exists. Choose a different one.' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  try {
    const newUser = new User({ username, password: hashedPassword });
    await newUser.save();
    console.log(`User ${username} registered successfully!`); // Backend confirmation
    res.status(201).json({ message: 'User registered successfully!' });
  } catch (err) {
    res.status(500).json({ error: 'Server error. Please try again later.' });
  }
});



app.post('/signin', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });

  if (!user) {
    return res.status(400).json({ error: 'Invalid username or password' });
  }

  const validPassword = await bcrypt.compare(password, user.password);

  if (!validPassword) {
    return res.status(400).json({ error: 'Invalid username or password' });
  }

  const token = jwt.sign({ id: user._id }, 'snekKey', { expiresIn: '2h' });
  res.json({ token });
});

// Functions
const getFirstLinkFromGoogleSearch = async (query) => {
  const response = await axios.get(GOOGLE_API_URL, {
    params: {
      q: `${query} marketscreener`,
      cx: SEARCH_ENGINE_ID,
      key: API_KEY,
    },
  });

  const firstLink = response.data.items.find((result) => result.link.includes("marketscreener.com")).link;
  return `${firstLink}finances/`;
};

// Routes
app.post("/search", async (req, res, next) => {
  const { query } = req.body;
  
  if (!query) {
    return res.status(400).json({ message: "Missing query parameter" });
  }
  
  try {
    const result = await getFirstLinkFromGoogleSearch(query);
    if (result) {
      return res.status(200).json({ message: "Success", result });
    } else {
      return res.status(404).json({ message: "No results found for the query" });
    }
  } catch (error) {
    next(error);
  }
});


app.get("/api/scrape", async (req, res, next) => {
    try {
      const { query } = req.query;

      if (!query) {
        return res.status(400).json({ error: 'No query provided' });
      }

      const scrapeLink = query;

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
  

app.get("/api/yahoo", async (req, res, next) => {
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

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Internal Server Error');
});

// Start server
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});