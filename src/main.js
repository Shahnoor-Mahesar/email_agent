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

  try {
    await emailReader.connect();

    while (true) {
      try {
        // Fetch the most recent unread email
        logger.info('Fetching most recent unread email');
        const emails = await emailReader.fetchUnreadEmails();

        if (emails.length > 0) {
          const email = emails[0]; // Only one email is fetched
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
             await emailSender.sendReply(email.from, `Re: ${email.subject}`, reply);
          }

          // Mark email as read
          await emailReader.markAsRead(email.messageId);
        } else {
          logger.info('No unread emails found, waiting 120 seconds');
          await new Promise(resolve => setTimeout(resolve, 120000));
        }
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