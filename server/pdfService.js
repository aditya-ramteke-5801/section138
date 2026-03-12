const puppeteer = require('puppeteer');
const { getNoticeHtml } = require('./noticeTemplate');

let browser = null;

async function getBrowser() {
  if (!browser) {
    const launchOptions = {
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process',
      ],
    };

    // On Render (Linux), use the installed Chromium via puppeteer
    // puppeteer automatically downloads Chromium during npm install
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }

    browser = await puppeteer.launch(launchOptions);
  }
  return browser;
}

async function generatePdf(notice) {
  const html = getNoticeHtml(notice);
  const b = await getBrowser();
  const page = await b.newPage();

  await page.setContent(html, {
    waitUntil: 'networkidle0',
    timeout: 60000,
  });

  const pdfBuffer = await page.pdf({
    format: 'A4',
    margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
    printBackground: true,
    timeout: 30000,
  });

  await page.close();
  return pdfBuffer;
}

async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

module.exports = { generatePdf, closeBrowser };
