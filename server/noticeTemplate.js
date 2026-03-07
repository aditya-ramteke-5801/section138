// HTML template for legal notice PDF generation
// Handles Quill editor classes (ql-align-center, ql-align-right)

const path = require('path');
const fs = require('fs');

function getNoticeHtml(notice) {
  let noticeContent = notice.notice_content || '';
  // Embed lawyer signature image as base64 so PDF can render it (Puppeteer has no base URL)
  if (noticeContent.includes('lawyer_signature.png')) {
    const sigPath = path.resolve(__dirname, '..', '..', 'lawyer_signature.png');
    try {
      if (fs.existsSync(sigPath)) {
        const sigBase64 = fs.readFileSync(sigPath).toString('base64');
        const dataUrl = `data:image/png;base64,${sigBase64}`;
        // Replace any img src pointing to lawyer_signature.png (relative or absolute URL)
        noticeContent = noticeContent.replace(
          /src="[^"]*lawyer_signature\.png[^"]*"/gi,
          `src="${dataUrl}"`
        );
      }
    } catch (e) {
      // leave img as-is if file missing or read fails
    }
  }
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  body {
    font-family: 'Times New Roman', Times, serif;
    font-size: 13px;
    line-height: 1.8;
    color: #000;
    margin: 0;
    padding: 40px 60px;
  }

  .header {
    text-align: center;
    border-bottom: 2px solid #000;
    padding-bottom: 15px;
    margin-bottom: 25px;
  }

  .header h1 {
    font-size: 20px;
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 2px;
  }

  .header p {
    margin: 2px 0;
    font-size: 11px;
  }

  .notice-content p {
    margin: 4px 0;
  }

  .notice-content ol {
    margin: 10px 0 10px 20px;
  }

  .notice-content ol li {
    margin-bottom: 8px;
    text-align: justify;
  }

  /* Quill alignment classes */
  .ql-align-center { text-align: center; }
  .ql-align-right { text-align: right; }
  .ql-align-justify { text-align: justify; }
  .ql-align-left { text-align: left; }
</style>
</head>
<body>
  <div class="header">
    <h1>Law Offices</h1>
    <p>Advocates & Legal Consultants</p>
  </div>

  <div class="notice-content">
    ${noticeContent}
  </div>
</body>
</html>`;
}

module.exports = { getNoticeHtml };
