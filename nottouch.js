const axios = require('axios');
const cheerio = require('cheerio');

const url = 'https://www.marketscreener.com/quote/stock/APPLE-INC-4849/finances/';

axios(url)
  .then(response => {
    const html = response.data;
    const $ = cheerio.load(html);
    
    const tables = ['valuationTable', 'iseTableA']; // List of tables to scrape
    
    for (let tableID of tables) {
      const table = $('#' + tableID);
      const tableRows = table.find('tr');
      
      tableRows.each(function () {
        const cells = $(this).find('th, td');
        let cellTexts = [];
        cells.each(function () {
          let cellText = $(this).text().trim();
          cellText = cellText.replace(/\s+/g, ' '); // replace multiple spaces with a single space
          cellText = cellText.replace(/,/g, '.'); // replace commas with periods
          cellText = cellText.replace(/(\d) (\d)/g, '$1,$2'); // replace spaces between digits with commas
          cellTexts.push(cellText);
        });
        console.log(cellTexts);
      });
    }
  })
  .catch(console.error);
