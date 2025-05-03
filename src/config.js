require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const winston = require('winston');
const validator = require('validator');

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => `${timestamp} - ${level.toUpperCase()} - ${message}`)
  ),
  transports: [
    new winston.transports.File({ filename: require('path').resolve(__dirname, '..', 'logs', 'mailbot.log') })
  ]
});

function getConfig() {
  try {
    const config = {
      openaiApiKey: process.env.OPENAI_API_KEY,
      emailAddress: process.env.EMAIL_ADDRESS,
      emailPassword: process.env.EMAIL_PASSWORD,
      imapServer: process.env.IMAP_SERVER,
      imapPort: parseInt(process.env.IMAP_PORT || '993', 10),
      smtpServer: process.env.SMTP_SERVER,
      smtpPort: parseInt(process.env.SMTP_PORT || '587', 10)
    };

    // Validate required fields
    for (const [key, value] of Object.entries(config)) {
      if (!value) {
        logger.error(`Missing configuration: ${key}`);
        throw new Error(`Missing configuration: ${key}`);
      }
    }

    // Validate email address
    if (!validator.isEmail(config.emailAddress)) {
      logger.error(`Invalid email address: ${config.emailAddress}`);
      throw new Error(`Invalid email address: ${config.emailAddress}`);
    }

    logger.info('Configuration loaded successfully');
    return config;
  } catch (error) {
    logger.error(`Configuration error: ${error.message}`);
    throw error;
  }
}

module.exports = { getConfig, logger };