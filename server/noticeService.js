const OpenAI = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function getToneBucket(dpd) {
  if (dpd >= 545) return { tone: 'severe', instruction: 'Maximum severity. Every consequence emphasised. No soft language. The borrower has demonstrated clear intent to defraud. Immediate legal proceedings will be initiated without further notice.' };
  if (dpd >= 365) return { tone: 'strict', instruction: 'Aggressive tone. "You have demonstrated clear intent to defraud..." / "immediate legal proceedings will be initiated..." Reference evasion and broken commitments harshly.' };
  if (dpd >= 180) return { tone: 'moderate', instruction: 'Direct and stern. "Despite repeated attempts to contact you..." / "you have wilfully avoided..." Make it clear that patience has run out.' };
  return { tone: 'soft', instruction: 'Firm but measured. Language like "we urge you to settle" / "we trust this is an oversight". Professional but clearly warns of consequences.' };
}

function getConsequenceEmphasis(caseData) {
  const hints = [];
  const enach = (caseData['E-Nach Enabled'] || '').toString().toLowerCase();
  if (enach === 'no' || enach === 'false' || enach === '0') {
    hints.push('NACH/cheque likely failed — lead with Section 138 (imprisonment up to 2 years + fine).');
  }
  const pos = parseFloat(caseData['Amount Pending'] || caseData['POS'] || 0);
  if (pos > 100000) {
    hints.push('High outstanding amount (>₹1L) — emphasise asset attachment, salary attachment, and bank account freezing.');
  }
  const disposition = (caseData['Latest Disposition'] || '').toLowerCase();
  if (disposition.includes('ringing') || disposition.includes('not reachable') || disposition.includes('switched off') || disposition.includes('no answer')) {
    hints.push('Borrower was unreachable — reference evasion as evidence of intent to defraud.');
  }
  if (disposition.includes('promise') || disposition.includes('ptp')) {
    hints.push('Borrower promised to pay but did not — reference broken commitments.');
  }
  return hints;
}

async function generateNoticeContent(caseData) {
  const dpd = parseInt(caseData['DPD']) || 0;
  const { tone, instruction: toneInstruction } = getToneBucket(dpd);
  const emphasisHints = getConsequenceEmphasis(caseData);

  const totalOutstanding = caseData['Amount Pending'] || caseData['POS'] || '0';
  const borrowerName = caseData['Name'] || 'Borrower';
  const loanNumber = caseData['Loan Number'] || '';
  const address = caseData['Primary Address'] || '';
  const pinCode = caseData['Pin Code'] || '';
  const phone = caseData['Phone'] || caseData['Mobile'] || '';
  const emi = caseData['EMI'] || '';
  const interestRate = caseData['Interest Rate'] || '';
  const state = caseData['State'] || '';
  const city = caseData['City'] || '';

  const referenceId = `LN-${loanNumber || Date.now()}-${new Date().getFullYear()}`;
  const noticeDate = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
  const outstandingFormatted = `₹${Number(totalOutstanding).toLocaleString('en-IN')}`;

  // Ask AI only for the prose sections — we build the structure in code
  const systemPrompt = `You are a legal notice drafting AI. Generate ONLY the following 4 sections as a JSON object. Each value must be an HTML string.

TONE INSTRUCTION: ${toneInstruction}

${emphasisHints.length > 0 ? 'EMPHASIS BASED ON CASE DATA:\n' + emphasisHints.map(h => '- ' + h).join('\n') : ''}

BORROWER DATA:
- Name: ${borrowerName}
- Total Outstanding: ${outstandingFormatted}
- DPD: ${dpd} days
- Lender: Slice (NorthStar Fintech Pvt. Ltd.)

Return a JSON object with these exact keys:
{
  "bodyParagraphs": "<p>Opening paragraph: Under instructions from our client Slice (NorthStar Fintech Pvt. Ltd.), an RBI-registered NBFC...</p><p>Loan background: borrower approached lender, assured repayment, loan disbursed...</p><p>Default allegation: borrower availed loan, failed to repay...</p><p>Outstanding demand: specific figures, demand payment...</p>",
  "consequences": "<li>Criminal complaint at nearest police station for cheating</li><li>Declare as wilful defaulter</li><li>Section 138 proceedings for cheque/NACH bounce — imprisonment up to 2 years</li><li>Arbitration proceedings and asset attachment</li><li>Salary and bank account attachment</li><li>CIBIL reporting — no future loans</li>",
  "deadline": "You are hereby called upon to pay all overdue amounts within 7 days...",
  "pocContact": "For further assistance, please contact our client's officer, Sonu Singh, at 9187525893 between 10 AM and 6 PM on any working day."
}

RULES:
- bodyParagraphs: Write 3-4 <p> tags. Personalise with borrower name, outstanding amount, DPD. Adjust tone per instructions.
- consequences: Write 6-8 <li> tags. Emphasise based on case data hints. Each consequence should be a complete sentence.
- deadline: One sentence with 7-day deadline.
- pocContact: One sentence with contact details.
- Use the EXACT outstanding amount: ${outstandingFormatted}
- Return valid JSON only, no markdown fences.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.3,
    max_tokens: 2000,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Generate notice sections for ${borrowerName}, loan ${loanNumber}, outstanding ${outstandingFormatted}, DPD ${dpd}.` }
    ]
  });

  const sections = JSON.parse(response.choices[0].message.content);

  // Build the full notice HTML with proper structure
  // ReactQuill only supports: p, br, strong, em, u, ol, ul, li, h1-h6, and class="ql-align-*"
  const content = `<p><strong>Ref. No:</strong> ${referenceId}</p>
<p class="ql-align-right"><strong>Dated:</strong> ${noticeDate}</p>
<p><br></p>
<p>To,</p>
<p><strong>${borrowerName}</strong></p>
<p>${address}${pinCode ? ', ' + pinCode : ''}</p>
<p>${phone}</p>
<p><br></p>
<p class="ql-align-center"><strong><u>SUB: LEGAL NOTICE FOR YOUR LOAN ACCOUNT: ${loanNumber}</u></strong></p>
<p class="ql-align-center">(By Hand/Digital mode)</p>
<p><br></p>
<p>Dear Sir/Madam,</p>
<p><br></p>
${sections.bodyParagraphs}
<p><br></p>
<p><strong>That in case you fail to comply with the present notice, our Client would be constrained to:</strong></p>
<ol>${sections.consequences}</ol>
<p><br></p>
<p><strong>${sections.deadline}</strong></p>
<p><br></p>
<p>${sections.pocContact}</p>
<p><br></p>
<p>NOTE: A copy of this notice is retained in our office for future necessary action.</p>
<p><br></p>
<p><br></p>
<p><strong>Unnati Vashisth</strong></p>
<p>(Advocate)</p>
<p><br></p>
<p>_______________________________________________</p>
<p><strong>NOTE:</strong> <em>Your loan account is in severe default. Continued non-payment has already resulted in serious adverse reporting to Credit Information Companies including CIBIL, leading to a substantial deterioration of your credit profile. This will severely restrict your ability to obtain any future loans, credit cards, employment-based financial verification, or banking facilities.</em></p>`.trim();

  return {
    content,
    tone,
    referenceId,
  };
}

async function aiEditNotice(currentContent, prompt) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.3,
    max_tokens: 3000,
    messages: [
      {
        role: 'system',
        content: `You are a legal notice editing assistant. The user will provide an instruction to modify a legal notice. Apply the requested change to the notice content. Preserve ALL other content exactly as is, including any manual edits. Only modify what the user asked to change. Return the FULL updated notice as HTML (no <html>/<head>/<body> wrapper tags, just the notice content HTML).`
      },
      {
        role: 'user',
        content: `CURRENT NOTICE CONTENT:\n${currentContent}\n\nINSTRUCTION: ${prompt}\n\nReturn the full updated notice HTML.`
      }
    ]
  });

  return response.choices[0].message.content;
}

async function generateEmailBody(noticeContent, borrowerName, totalOutstanding, loanNumber) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.3,
    max_tokens: 500,
    messages: [
      {
        role: 'system',
        content: `Generate a short, professional email body (4-6 lines max) summarising the key points of a legal notice. Include: outstanding amount, payment deadline (7 days), primary consequence, and contact details. This is NOT the full notice — just a covering email. The full notice is attached as PDF. Do not use HTML — plain text only.`
      },
      {
        role: 'user',
        content: `Borrower: ${borrowerName}\nLoan Account: ${loanNumber}\nOutstanding: ₹${Number(totalOutstanding).toLocaleString('en-IN')}\n\nNotice content summary:\n${noticeContent.substring(0, 1000)}`
      }
    ]
  });

  return response.choices[0].message.content;
}

async function generateEmailSubject(loanNumber) {
  return `Legal Notice — Loan Account ${loanNumber} — Immediate Action Required`;
}

module.exports = {
  generateNoticeContent,
  aiEditNotice,
  generateEmailBody,
  generateEmailSubject,
  getToneBucket,
};
