const axios = require('axios');
const cheerio = require('cheerio');

async function scrapeStages() {
  const url = 'https://www.rallysimfans.hu/rbr/stages.php?lista=3&rendez=stage_id';

  try {
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);

    const tables = $('table');
    const stageTable = tables.eq(25); // Table #26 (0-based index)

    const rows = stageTable.find('tr').slice(1); // skip header
    const data = [];

    rows.each((_, row) => {
      const cols = $(row).find('td');
      if (cols.length >= 6) {
        const stageId = $(cols[0]).text().trim();
        const name = $(cols[1]).text().trim();
        const length = $(cols[2]).text().trim().replace(' km', '');
        const surface = $(cols[4]).text().trim();
        const author = $(cols[5]).text().trim();
        const folder = cols.length > 6 ? $(cols[6]).text().trim() : '';

        data.push({
          StageId: parseInt(stageId),
          StageName: name,
          Length: length,
          Surface: surface,
          Author: author
        });
      }
    });

    console.log(`✅ Found ${data.length} stages`);
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('❌ Failed to scrape stage data:', err.message);
  }
}

scrapeStages();
