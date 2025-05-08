const EmailReader = require('./email_reader');
const ReplyGenerator = require('./reply_generator');
const EmailSender = require('./email_sender');
const { getConfig, logger } = require('./config');
const fs = require('fs').promises;
const path = require('path');

async function main() {
  const config = getConfig();
  const emailReader = new EmailReader(config);
  const replyGenerator = new ReplyGenerator(config.openaiApiKey);
  const emailSender = new EmailSender(config);
  
  let emailQueue = [];

  try {
    await emailReader.connect();

    while (true) {
      try {
        // Fetch emails only if the queue is empty
        if (emailQueue.length === 0) {
          logger.info('Fetching unread emails from server');
          emailQueue = await emailReader.fetchUnreadEmails();
          // Sort emails by date (most recent first)
          emailQueue.sort((a, b) => b.date - a.date);
          logger.info(`Loaded ${emailQueue.length} unread emails into queue`);
          
          // If still no emails, wait before trying again
          if (emailQueue.length === 0) {
            logger.info('No unread emails in queue, waiting 120 seconds before fetching again');
            await new Promise(resolve => setTimeout(resolve, 120000));
            continue; // Skip the rest of the loop and start over
          }
        }

        // Process the most recent email from the queue
        const email = emailQueue.shift(); // Remove the most recent email
        logger.info(`Processing email from ${email.from} (UID: ${email.messageId})`);

        const { reply, needsManualReview, keywords } = await replyGenerator.generateReply(email);

        if (needsManualReview) {
          logger.info(`Email from ${email.from} flagged for manual review due to keywords: ${keywords.join(', ')}`);
          const reviewData = {
            timestamp: new Date().toISOString(),
            from: email.from,
            senderName: email.senderName,
            subject: email.subject,
            body: email.body,
            keywords,
            draftReply: 'No reply generated'
          };
          const reviewsFile = path.join(__dirname, 'manual_reviews.json');
          let reviews = [];
          try {
            const data = await fs.readFile(reviewsFile, 'utf8');
            reviews = JSON.parse(data);
          } catch (error) {
            if (error.code !== 'ENOENT') throw error;
          }
          reviews.push(reviewData);
          await fs.writeFile(reviewsFile, JSON.stringify(reviews, null, 2));
          logger.info(`Flagged email from ${email.from} saved to manual_reviews.json`);
        } else if (reply) {
          logger.info(`Generated reply for ${email.from}: ${reply}`);
          // Uncomment to enable sending
          // await emailSender.sendReply(email.from, `Re: ${email.subject}`, reply);
        }

        // Mark email as read
        await emailReader.markAsRead(email.messageId);

      } catch (error) {
        logger.error(`Error in processing loop: ${error.message}`);
        await emailReader.reconnectIfNeeded();
      }
    }
  } catch (error) {
    logger.error(`Fatal error: ${error.message}`);
  } finally {
    emailReader.disconnect();
  }
}

main().catch(error => logger.error(`Main process error: ${error.message}`));