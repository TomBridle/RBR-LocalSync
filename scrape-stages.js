// npm i puppeteer html-entities
const puppeteer = require("puppeteer");
const { decode } = require("html-entities");
// npm i puppeteer html-entities cheerio

const cheerio = require("cheerio");

(async () => {
  const url = "https://www.rallysimfans.hu/rbr/stages.php?lista=3&rendez=stage_id";

  // Toggle this to visually debug if nothing is found
  const HEADLESS = true; // set to false if you still get 0 results

  const browser = await puppeteer.launch({
    headless: HEADLESS,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
    ],
  });
  const page = await browser.newPage();

  // Mimic a real browser
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
  );
  await page.setExtraHTTPHeaders({
    "Accept-Language": "en-GB,en;q=0.9",
    Referer: "https://www.rallysimfans.hu/",
  });
  await page.setViewport({ width: 1366, height: 900 });

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

  // Wait until any element with the Tip('...') tooltip exists
  try {
    await page.waitForFunction(
      () =>
        document.querySelectorAll('div[onmouseover^="Tip(\'"], a[onmouseover^="Tip(\'"]').length > 0,
      { timeout: 15000 }
    );
  } catch {
    console.warn("⚠️ No tooltip carriers found yet after initial load. Trying a short extra delay...");
    await page.waitForTimeout(2500);
  }

  // Collect every onmouseover payload that starts with Tip('...')
  const onmoList = await page.$$eval(
    'div[onmouseover^="Tip(\'"], a[onmouseover^="Tip(\'"]',
    (els) => els.map((el) => el.getAttribute("onmouseover") || "")
  );

  if (!onmoList.length) {
    console.error("❌ Still found 0 tooltip elements. Try setting HEADLESS=false to debug visually.");
    await browser.close();
    return;
  }

  const results = [];

  for (const onmo of onmoList) {
    const m = onmo && onmo.match(/Tip\(\s*'([\s\S]*?)'\s*\)/);
    if (!m) continue;

    // Unescape JS-escaped quotes then decode HTML entities (&lt; etc.)
    let raw = m[1].replace(/\\"/g, '"').replace(/\\'/g, "'");
    const tooltipHTML = decode(raw);

    // Parse with cheerio for robust label -> value extraction
    const $ = cheerio.load(tooltipHTML);

    const name = $('h2').first().text().trim();

    const getNext = (label) => {
      const tds = $('td').toArray();
      const lab = tds.find((td) => $(td).text().trim().startsWith(label));
      if (!lab) return '';
      const next = $(lab).next('td');
      return next.length ? next.text().trim() : '';
    };

    // ID can be in the next cell or inline like "ID: 123" in one cell
    let idText = getNext('ID:');
    if (!idText) {
      const inline = $('td').toArray().map((td) => $(td).text()).join(' ');
      const mm = inline.match(/ID:\s*(\d+)/);
      idText = mm ? mm[1] : '';
    }

    const country = getNext('Country:');
    const surface = getNext('Surface:');
    const lengthText = getNext('Length:');
    const author = getNext('Author:');

    const length = parseFloat((lengthText || '').replace(',', '.').replace(/[^0-9.]/g, ''));

    // Some tooltips might be for things that aren't stages; require a name and ID
    if (name && idText) {
      results.push({
        StageId: parseInt(idText, 10),
        StageName: name,
        Country: country || '',
        Surface: surface || '',
        Length: Number.isFinite(length) ? length : null,
        Author: author || '',
      });
    }
  }

  // Deduplicate by StageId just in case
  const unique = Object.values(
    results.reduce((acc, r) => {
      acc[r.StageId] = acc[r.StageId] || r;
      return acc;
    }, {})
  );

  console.log(`✅ Found ${unique.length} stages`);
  console.log(JSON.stringify(unique, null, 2));

  await browser.close();
})();