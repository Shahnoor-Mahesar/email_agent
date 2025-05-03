const EmailReader = require('./email_reader');
const ReplyGenerator = require('./reply_generator');
const EmailSender = require('./email_sender');
const { getConfig, logger } = require('./config');

async function main() {
  try {
    // Load configuration
    const config = getConfig();

    // Initialize components
    const emailReader = new EmailReader(config);
    const replyGenerator = new ReplyGenerator(config.openaiApiKey);
    const emailSender = new EmailSender(config);

    // Connect to IMAP server
    await emailReader.connect();

    // Fetch unread emails (filtered to last 60 seconds)
    const emails = await emailReader.fetchUnreadEmails();

    // Process each email
    for (const email of emails) {
      try {
        // Generate reply
        const reply = await replyGenerator.generateReply(email);

        // Log reply instead of sending (for testing)
        logger.info(`Preview reply to ${email.from} (Subject: ${email.subject}, Date: ${email.date.toISOString()}): ${reply}`);

        // Uncomment the following lines to enable sending after testing
        // await emailSender.sendReply(email.from, email.subject, reply);
        // emailReader.markAsRead(email.messageId);
      } catch (error) {
        logger.error(`Error processing email from ${email.from}: ${error.message}`);
        continue;
      }
    }

    logger.info(`Processed ${emails.length} emails in this cycle`);
    emailReader.disconnect();
  } catch (error) {
    logger.error(`Main loop error: ${error.message}`);
    throw error;
  }
}

async function run() {
  while (true) {
    try {
      logger.info('Starting mail bot cycle');
      await main();
      logger.info('Cycle complete, sleeping for 60 seconds');
      await new Promise(resolve => setTimeout(resolve, 60 * 1000));
    } catch (error) {
      logger.error(`Bot crashed: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000)); // Wait 5 minutes
    }
  }
}

run();