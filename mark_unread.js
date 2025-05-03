const Imap = require('imap');
const { simpleParser } = require('mailparser');
const dotenv = require('dotenv');
const winston = require('winston');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '.env') });

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => `${timestamp} - ${level.toUpperCase()} - ${message}`)
  ),
  transports: [
    new winston.transports.File({ filename: path.join(__dirname, 'logs', 'mailbot.log') })
  ]
});

// Validate environment variables
const config = {
  emailAddress: process.env.EMAIL_ADDRESS,
  emailPassword: process.env.EMAIL_PASSWORD,
  imapServer: process.env.IMAP_SERVER,
  imapPort: parseInt(process.env.IMAP_PORT, 10)
};

for (const [key, value] of Object.entries(config)) {
  if (!value) {
    logger.error(`Missing environment variable: ${key}`);
    process.exit(1);
  }
}

async function markUnreadAsRead() {
  const imap = new Imap({
    user: config.emailAddress,
    password: config.emailPassword,
    host: config.imapServer,
    port: config.imapPort,
    tls: true
  });

  try {
    // Connect to IMAP server
    await new Promise((resolve, reject) => {
      imap.once('ready', resolve);
      imap.once('error', reject);
      imap.connect();
    });

    // Open INBOX
    await new Promise((resolve, reject) => {
      imap.openBox('INBOX', false, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    logger.info('Connected to IMAP server');

    // Search for unread emails
    const results = await new Promise((resolve, reject) => {
      imap.search(['UNSEEN'], (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });
    logger.info(`Found ${results.length} unread email IDs`);

    // Process emails in batches
    const batchSize = 100;
    for (let i = 0; i < results.length; i += batchSize) {
      const batch = results.slice(i, i + batchSize);
      for (const uid of batch) {
        try {
          // Fetch email to get sender info (for logging)
          const msg = await new Promise((resolve, reject) => {
            const f = imap.fetch(uid, { bodies: '' });
            let buffer = '';
            f.on('message', (msg) => {
              msg.on('body', (stream) => {
                stream.on('data', (chunk) => buffer += chunk.toString('utf8'));
                stream.on('end', () => resolve(buffer));
              });
            });
            f.once('error', reject);
          });

          const parsed = await simpleParser(msg);
          const from = parsed.from?.value[0]?.address || 'unknown';

          // Mark as read
          await new Promise((resolve, reject) => {
            imap.addFlags(uid, '\\Seen', (err) => {
              if (err) reject(err);
              else resolve();
            });
          });
          logger.info(`Marked email from ${from} (UID: ${uid}) as read`);
        } catch (error) {
          logger.error(`Error marking email ${uid} as read: ${error.message}`);
          continue;
        }
      }
      logger.info(`Processed batch of ${batch.length} emails (total processed: ${Math.min(i + batch.length, results.length)})`);
    }

    logger.info(`Marked ${results.length} emails as read`);
  } catch (error) {
    logger.error(`Error: ${error.message}`);
    throw error;
  } finally {
    imap.end();
    logger.info('Disconnected from IMAP server');
  }
}

markUnreadAsRead().catch((error) => {
  logger.error(`Script failed: ${error.message}`);
  process.exit(1);
}).then(() => {
  logger.info('Script completed successfully');
  process.exit(0);
});