const Imap = require('imap');
const { simpleParser } = require('mailparser');
const { logger } = require('./config');

class EmailReader {
  constructor(config) {
    this.config = config;
    this.imap = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.imap = new Imap({
        user: this.config.emailAddress,
        password: this.config.emailPassword,
        host: this.config.imapServer,
        port: this.config.imapPort,
        tls: true,
        connTimeout: 10000, // 10-second connection timeout
        authTimeout: 10000 // 10-second authentication timeout
      });

      const timeout = setTimeout(() => {
        const err = new Error('IMAP connection timed out after 10 seconds');
        logger.error(err.message);
        reject(err);
      }, 10000);

      this.imap.once('ready', () => {
        clearTimeout(timeout);
        this.imap.openBox('INBOX', false, (err) => {
          if (err) {
            logger.error(`IMAP openBox error: ${err.message}`);
            reject(err);
          } else {
            logger.info('Connected to IMAP server');
            resolve();
          }
        });
      });

      this.imap.once('error', (err) => {
        clearTimeout(timeout);
        logger.error(`IMAP connection error: ${err.message}`);
        reject(err);
      });

      this.imap.connect();
    });
  }

  async fetchUnreadEmails() {
    try {
      const emails = [];
      const now = new Date();
      const timeThreshold = new Date(now.getTime() - 60 * 1000); // 60 seconds ago
      logger.info(`Fetching emails received after ${timeThreshold.toISOString()}`);

      const results = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          const err = new Error('IMAP search timed out after 10 seconds');
          logger.error(err.message);
          reject(err);
        }, 10000); // 10-second timeout

        this.imap.search(['UNSEEN'], (err, results) => {
          clearTimeout(timeout);
          if (err) {
            logger.error(`IMAP search error: ${err.message}`);
            reject(err);
          } else {
            logger.info(`Found ${results.length} unread email IDs`);
            resolve(results);
          }
        });
      });

      for (const uid of results) {
        const msg = await new Promise((resolve, reject) => {
          const f = this.imap.fetch(uid, { bodies: '' });
          f.on('message', (msg) => {
            let buffer = '';
            msg.on('body', (stream) => {
              stream.on('data', (chunk) => buffer += chunk.toString('utf8'));
              stream.on('end', () => {
                logger.info(`Fetched email with UID ${uid}`);
                resolve(buffer);
              });
            });
          });
          f.once('error', (err) => {
            logger.error(`Fetch error for UID ${uid}: ${err.message}`);
            reject(err);
          });
        });

        const parsed = await simpleParser(msg);
        const emailDate = parsed.date ? new Date(parsed.date) : new Date(0); // Fallback if date is missing

        // Filter emails received within the last 60 seconds
        if (emailDate >= timeThreshold) {
          emails.push({
            messageId: uid,
            from: parsed.from.value[0].address,
            subject: parsed.subject || '',
            body: parsed.text || '',
            date: emailDate
          });
          logger.info(`Included email from ${parsed.from.value[0].address} (Date: ${emailDate.toISOString()})`);
        } else {
          logger.info(`Skipped email from ${parsed.from.value[0].address} (Date: ${emailDate.toISOString()}, too old)`);
        }
      }

      logger.info(`Fetched ${emails.length} unread emails received within the last 60 seconds`);
      return emails;
    } catch (error) {
      logger.error(`Error fetching emails: ${error.message}`);
      throw error;
    }
  }

  markAsRead(messageId) {
    try {
      this.imap.addFlags(messageId, '\\Seen', (err) => {
        if (err) {
          logger.error(`Error marking email ${messageId} as read: ${err.message}`);
          throw err;
        }
        logger.info(`Marked email ${messageId} as read`);
      });
    } catch (error) {
      logger.error(`Error marking email: ${error.message}`);
      throw error;
    }
  }

  disconnect() {
    if (this.imap) {
      this.imap.end();
      logger.info('Disconnected from IMAP server');
    }
  }
}

module.exports = EmailReader;