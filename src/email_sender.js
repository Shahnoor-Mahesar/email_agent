const nodemailer = require('nodemailer');
const { logger } = require('./config');

class EmailSender {
  constructor(config) {
    this.config = config;
    this.transporter = nodemailer.createTransport({
      host: this.config.smtpServer,
      port: this.config.smtpPort,
      secure: false,
      auth: {
        user: this.config.emailAddress,
        pass: this.config.emailPassword
      },
      tls: { ciphers: 'SSLv3' }
    });
  }

  async sendReply(toAddress, subject, body) {
    try {
      const mailOptions = {
        from: this.config.emailAddress,
        to: toAddress,
        subject: `Re: ${subject}`,
        text: body
      };

      await this.transporter.sendMail(mailOptions);
      logger.info(`Sent reply to ${toAddress}`);
    } catch (error) {
      logger.error(`Error sending email: ${error.message}`);
      throw error;
    }
  }
}

module.exports = EmailSender;