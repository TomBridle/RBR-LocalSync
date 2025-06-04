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
      const div = $(cols[1]).find('div');
      const onMouseOverAttr = div.attr('onmouseover');

      if (onMouseOverAttr) {
        // Extract inner HTML string from Tip(...)
        const tipContentMatch = onMouseOverAttr.match(/Tip\('(.*?)'\)/);
        if (!tipContentMatch || tipContentMatch.length < 2) return;

        const tooltipHTML = tipContentMatch[1]
          .replace(/\\"/g, '"')   // unescape quotes
          .replace(/\\'/g, "'")   // unescape single quotes
          .replace(/&lt;/g, '<')  // decode HTML
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"');

        const $tooltip = cheerio.load(tooltipHTML);
        const name = $tooltip('h2').text().trim();
        const idText = $tooltip('td:contains("ID:")').text().trim();
        const stageId = parseInt(idText.replace('ID:', '').trim());

        const countryText = $tooltip('td:contains("Country:")').next().text().trim();
        const surface = $tooltip('td:contains("Surface:")').next().text().trim();
        const lengthText = $tooltip('td:contains("Length:")').next().text().trim();
        const length = parseFloat(lengthText.replace(' km', '').trim());
        const author = $tooltip('td:contains("Author:")').next().text().trim();

        data.push({
          StageId: stageId,
          StageName: name,
          Country: countryText,
          Surface: surface,
          Length: length,
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
