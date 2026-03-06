// HTML template for legal notice PDF generation
// Handles Quill editor classes (ql-align-center, ql-align-right)

function getNoticeHtml(notice) {
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

  .signed-stamp {
    margin-top: 30px;
    padding: 12px 20px;
    border: 2px solid #333;
    display: inline-block;
    font-weight: bold;
    text-align: center;
  }
</style>
</head>
<body>
  <div class="header">
    <h1>Law Offices</h1>
    <p>Advocates & Legal Consultants</p>
  </div>

  <div class="notice-content">
    ${notice.notice_content}
  </div>

  ${notice.status === 'signed' ? `
  <div class="signed-stamp">
    <p>SIGNED & APPROVED</p>
    <p>${notice.signed_by || 'Advocate'}</p>
    <p>${notice.signed_at ? new Date(notice.signed_at).toLocaleDateString('en-IN') : ''}</p>
  </div>
  ` : ''}
</body>
</html>`;
}

module.exports = { getNoticeHtml };
