const dotenv = require('dotenv');
const winston = require('winston');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const config = {
  openaiApiKey: process.env.OPENAI_API_KEY,
  emailAddress: process.env.EMAIL_ADDRESS,
  emailPassword: process.env.EMAIL_PASSWORD,
  imapServer: process.env.IMAP_SERVER,
  imapPort: parseInt(process.env.IMAP_PORT, 10),
  smtpServer: process.env.SMTP_SERVER,
  smtpPort: parseInt(process.env.SMTP_PORT, 10),
  sensitiveKeywords: [
    'storno', 'stornieren', 'kündigen', 'abbrechen', 'anwalt', 'polizei', 'klarna-verfahren', 'widerruf',
    'betrug', 'gericht', 'rückerstattung', 'beschwerde', 'streit'
  ],
  orderStatusKeywords: ['bestellung', 'lieferung', 'wann kommt', 'order status', 'delivery', 'when will'],
  faqKeywords: ['größe', 'grössen', 'lieferzeit', 'versand', 'size', 'sizing', 'delivery time', 'shipping'],
  thankYouKeywords: ['danke', 'vielen dank', 'thank you', 'thanks']
};

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => `${timestamp} - ${level.toUpperCase()} - ${message}`)
  ),
  transports: [
    new winston.transports.File({ filename: path.join(__dirname, '..', 'logs', 'mailbot.log') })
  ]
});

const responseLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: path.join(__dirname, '..', 'logs', 'responses.log') })
  ]
});

function getConfig() {
  for (const [key, value] of Object.entries(config)) {
    if (key !== 'sensitiveKeywords' && key !== 'orderStatusKeywords' && key !== 'faqKeywords' && key !== 'thankYouKeywords' && !value) {
      logger.error(`Missing environment variable for ${key}`);
      throw new Error(`Missing environment variable for ${key}`);
    }
  }
  return config;
}

module.exports = { getConfig, logger, responseLogger };