const EmailReader = require('./email_reader');
const ReplyGenerator = require('./reply_generator');
const EmailSender = require('./email_sender');
const { getConfig, logger } = require('./config');
const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function promptForReply() {
  try {
    // Load configuration
    const config = getConfig();

    // Initialize components
    const emailReader = new EmailReader(config);
    const replyGenerator = new ReplyGenerator(config.openaiApiKey);
    const emailSender = new EmailSender(config);

    // Connect to IMAP server
    await emailReader.connect();

    // Fetch the most recent unread email
    const emails = await emailReader.fetchUnreadEmails();

    // Process the email (if any)
    if (emails.length > 0) {
      const email = emails[0];
      try {
        // Generate reply
        const { reply, needsManualReview, keywords } = await replyGenerator.generateReply(email);

        if (needsManualReview) {
          // Log for manual review
          const reviewEntry = {
            timestamp: new Date().toISOString(),
            from: email.from,
            senderName: email.senderName,
            subject: email.subject,
            body: email.body,
            keywords,
            draftReply: reply || 'No reply generated'
          };
          const reviewFile = path.join(__dirname, 'manual_reviews.json');
          let reviews = [];
          try {
            const data = await fs.readFile(reviewFile, 'utf8');
            reviews = JSON.parse(data);
          } catch (error) {
            if (error.code !== 'ENOENT') throw error;
          }
          reviews.push(reviewEntry);
          await fs.writeFile(reviewFile, JSON.stringify(reviews, null, 2));
          logger.info(`Flagged email from ${email.from} for manual review and saved to manual_reviews.json`);
          console.log(`Email from ${email.from} (${email.senderName}) flagged for manual review due to keywords: ${keywords.join(', ')}`);
          await emailReader.markAsRead(email.messageId);
        } else {
          console.log(`\nEmail from: ${email.from} (${email.senderName})`);
          console.log(`Subject: ${email.subject}`);
          console.log(`Body: ${email.body}`);
          console.log(`Proposed reply (Subject: Re: ${email.subject}): ${reply}`);
          const answer = await new Promise(resolve => {
            rl.question('Reply to this email? (y/n): ', resolve);
          });

          if (answer.toLowerCase() === 'y') {
            await emailSender.sendReply(email.from, email.subject, reply);
            await emailReader.markAsRead(email.messageId);
            console.log(`Reply sent to ${email.from} with subject: Re: ${email.subject}`);
          } else {
            console.log(`Skipped sending reply to ${email.from}`);
            await emailReader.markAsRead(email.messageId);
          }
        }
      } catch (error) {
        logger.error(`Error processing email from ${email.from}: ${error.message}`);
        console.log(`Error processing email: ${error.message}`);
      }
    } else {
      console.log('No unread emails to process');
    }

    emailReader.disconnect();
  } catch (error) {
    logger.error(`Test script error: ${error.message}`);
    console.log(`Error: ${error.message}`);
  } finally {
    rl.close();
  }
}

promptForReply().then(() => process.exit(0));