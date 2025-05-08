const Imap = require('imap');
const { simpleParser } = require('mailparser');
const OpenAI = require('openai');
const { logger } = require('./config');

class EmailReader {
  constructor(config) {
    this.config = config;
    this.imap = null;
    this.retryCount = 0;
    this.maxRetries = 3;
    this.connected = false;
    this.openai = new OpenAI({ apiKey: config.openaiApiKey });
  }

  async connect() {
    if (this.connected) {
      logger.info('Already connected to IMAP server');
      return;
    }

    return new Promise((resolve, reject) => {
      const attemptConnection = () => {
        this.imap = new Imap({
          user: this.config.emailAddress,
          password: this.config.emailPassword,
          host: this.config.imapServer,
          port: this.config.imapPort,
          tls: true,
          connTimeout: 10000,
          authTimeout: 10000
        });

        const timeout = setTimeout(() => {
          const err = new Error('IMAP connection timed out after 10 seconds');
          logger.error(err.message);
          this.imap.destroy();
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
              this.connected = true;
              this.retryCount = 0;
              resolve();
            }
          });
        });

        this.imap.once('error', (err) => {
          clearTimeout(timeout);
          logger.error(`IMAP connection error: ${err.message}`);
          if (this.retryCount < this.maxRetries) {
            this.retryCount++;
            logger.info(`Retrying connection (attempt ${this.retryCount + 1}/${this.maxRetries})`);
            setTimeout(attemptConnection, 5000);
          } else {
            reject(err);
          }
        });

        this.imap.connect();
      };

      attemptConnection();
    });
  }

  async detectLanguage(text) {
    try {
      // Dynamically import franc
      const francModule = await import('franc');
      const franc = francModule.franc;
      const francAll = francModule.francAll;

      // Strip quoted/forwarded content
      const quoteIndex = text.indexOf('>') !== -1 ? text.indexOf('>') : text.length;
      const mainBody = text.substring(0, quoteIndex).trim();

      if (!mainBody) {
        logger.info('Empty main body, defaulting to English');
        return 'english';
      }

      // Use franc for initial detection with whitelist
      const francResult = franc(mainBody, { whitelist: ['deu', 'eng'], minLength: 3 });

      // Get confidence scores with francAll
      const francResults = francAll(mainBody, { whitelist: ['deu', 'eng'], minLength: 3 });
      const francConfidence = francResults.find(lang => lang[0] === francResult)?.[1] || 0;

      if (francConfidence >= 0.9 && francResult === 'deu') {
        logger.info(`Franc detected German (confidence: ${francConfidence})`);
        return 'german';
      } else if (francConfidence >= 0.9 && francResult === 'eng') {
        logger.info(`Franc detected English (confidence: ${francConfidence})`);
        return 'english';
      } else {
        logger.info(`Franc detection ambiguous (language: ${francResult}, confidence: ${francConfidence}), falling back to OpenAI`);

        // Fallback to OpenAI
        const response = await this.openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: 'You are a language detection assistant. Determine if the following text is primarily in German or English. Respond with only "german" or "english".' },
            { role: 'user', content: mainBody }
          ],
          max_tokens: 10
        });

        const language = response.choices[0].message.content.trim().toLowerCase();
        logger.info(`OpenAI detected language: ${language}`);
        return language === 'german' ? 'german' : 'english';
      }
    } catch (error) {
      logger.error(`Error detecting language: ${error.message}, defaulting to English`);
      return 'english';
    }
  }

  async fetchUnreadEmails() {
    try {
      const emails = [];
      logger.info('Fetching most recent unread email');

      const results = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          const err = new Error('IMAP search timed out after 10 seconds');
          logger.error(err.message);
          reject(err);
        }, 10000);

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

      // Process only the most recent email (highest UID)
      if (results.length > 0) {
        const uid = Math.max(...results); // Get the highest UID (most recent)
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
        const emailDate = parsed.date ? new Date(parsed.date) : new Date(0);
        const body = parsed.text || '';
        const language = await this.detectLanguage(body);
        const senderName = parsed.from.value[0].name?.trim() || parsed.from.value[0].address.split('@')[0];

        // Strip quoted content for main body
        const quoteIndex = body.indexOf('>') !== -1 ? body.indexOf('>') : body.length;
        const mainBody = body.substring(0, quoteIndex).trim();

        const email = {
          messageId: uid,
          from: parsed.from.value[0].address,
          senderName,
          subject: parsed.subject || '',
          body: mainBody,
          fullBody: body,
          date: emailDate,
          language
        };

        logger.info(`Selected email from ${email.from} (Name: ${email.senderName}, Date: ${email.date.toISOString()}, UID: ${email.messageId}, Language: ${email.language})`);
        return [email];
      } else {
        logger.info('No unread emails found');
        return [];
      }
    } catch (error) {
      logger.error(`Error fetching emails: ${error.message}`);
      throw error;
    }
  }

  markAsRead(messageId) {
    return new Promise((resolve, reject) => {
      try {
        this.imap.addFlags(messageId, '\\Seen', (err) => {
          if (err) {
            logger.error(`Error marking email ${messageId} as read: ${err.message}`);
            reject(err);
          } else {
            logger.info(`Marked email ${messageId} as read`);
            resolve();
          }
        });
      } catch (error) {
        logger.error(`Error marking email: ${error.message}`);
        reject(error);
      }
    });
  }

  async reconnectIfNeeded() {
    if (!this.imap || this.imap.state === 'disconnected') {
      logger.info('IMAP connection lost, reconnecting');
      this.connected = false;
      await this.connect();
    }
  }

  disconnect() {
    if (this.imap && this.connected) {
      this.imap.end();
      this.connected = false;
      logger.info('Disconnected from IMAP server');
    }
  }
}

module.exports = EmailReader;