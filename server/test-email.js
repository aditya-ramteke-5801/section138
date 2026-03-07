/**
 * Email Configuration Test Utility
 * 
 * Usage: node test-email.js
 * 
 * Tests your SMTP configuration by:
 * 1. Validating environment variables
 * 2. Attempting to connect to SMTP server
 * 3. Sending a test email
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const nodemailer = require('nodemailer');

async function testEmailConfig() {
  console.log('🔍 Email Configuration Test\n');

  // Check required variables
  const required = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    console.log('❌ Missing Environment Variables:');
    missing.forEach(key => console.log(`   - ${key}`));
    console.log('\nPlease configure these in .env file');
    process.exit(1);
  }

  console.log('✅ All required environment variables found:\n');
  console.log(`   SMTP_HOST: ${process.env.SMTP_HOST}`);
  console.log(`   SMTP_PORT: ${process.env.SMTP_PORT}`);
  console.log(`   SMTP_USER: ${process.env.SMTP_USER}`);
  console.log(`   SMTP_FROM: ${process.env.SMTP_FROM}`);
  console.log(`   SMTP_PASS: [hidden]\n`);

  // Create transporter
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT),
    secure: parseInt(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  // Verify configuration
  console.log('🔗 Testing SMTP Connection...\n');
  try {
    await transporter.verify();
    console.log('✅ SMTP connection verified!\n');
  } catch (err) {
    console.log('❌ SMTP connection failed:');
    console.log(`   ${err.message}\n`);
    console.log('Common issues:');
    console.log('   - Wrong SMTP credentials');
    console.log('   - Gmail: Did you use an App Password (not your regular password)?');
    console.log('   - Gmail: Is 2-factor authentication enabled?');
    console.log('   - Port blocked by firewall (try 587 instead of 465)');
    process.exit(1);
  }

  // Send test email
  const testEmail = process.env.SMTP_USER || 'test@example.com';
  console.log(`📧 Sending test email to: ${testEmail}\n`);

  try {
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: testEmail,
      subject: '[Legal Case Picker] Email Configuration Test',
      html: `
        <h2>✅ Email Configuration Test Successful</h2>
        <p>Your SMTP configuration is working correctly!</p>
        <p><strong>Test Details:</strong></p>
        <ul>
          <li>From: ${process.env.SMTP_FROM}</li>
          <li>SMTP Host: ${process.env.SMTP_HOST}</li>
          <li>Timestamp: ${new Date().toISOString()}</li>
        </ul>
        <p>You can now start sending legal notices via email.</p>
      `,
      text: `Email configuration test successful!\nYou can now start sending legal notices via email.`,
    });

    console.log('✅ Test email sent successfully!');
    console.log(`\nMessage ID: ${info.messageId}`);
    console.log(`Response: ${info.response}\n`);
    console.log('🎉 Your email configuration is ready to use!\n');
    console.log('Next steps:');
    console.log('  1. Check your inbox (and spam folder) for the test email');
    console.log('  2. Start the server: npm run dev');
    console.log('  3. Send a legal notice email from the dashboard\n');

  } catch (err) {
    console.log('❌ Failed to send test email:');
    console.log(`   ${err.message}\n`);
    process.exit(1);
  }
}

testEmailConfig().catch(err => {
  console.error('❌ Unexpected error:', err);
  process.exit(1);
});
