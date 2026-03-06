const puppeteer = require('puppeteer');
const { getNoticeHtml } = require('./noticeTemplate');

let browser = null;

async function getBrowser() {
  if (!browser) {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }
  return browser;
}

async function generatePdf(notice) {
  const html = getNoticeHtml(notice);
  const b = await getBrowser();
  const page = await b.newPage();

  await page.setContent(html, { waitUntil: 'networkidle0' });

  const pdfBuffer = await page.pdf({
    format: 'A4',
    margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
    printBackground: true,
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
