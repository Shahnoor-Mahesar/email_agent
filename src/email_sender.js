const nodemailer = require('nodemailer');
const { logger } = require('./config');

class EmailSender {
  constructor(config) {
    this.transporter = nodemailer.createTransport({
      host: config.smtpServer,
      port: config.smtpPort,
      secure: config.smtpPort === 465,
      auth: {
        user: config.emailAddress,
        pass: config.emailPassword
      }
    });
  }

  async sendReply(to, subject, reply) {
    try {
      const mailOptions = {
        from: this.transporter.options.auth.user,
        to,
        subject: `Re: ${subject}`,
        text: reply
      };

      await this.transporter.sendMail(mailOptions);
      logger.info(`Sent reply to ${to} with subject: Re: ${subject}`);
    } catch (error) {
      logger.error(`Error sending reply to ${to}: ${error.message}`);
      throw error;
    }
  }
}

module.exports = EmailSender;