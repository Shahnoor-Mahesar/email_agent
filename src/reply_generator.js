const OpenAI = require('openai');
const { logger } = require('./config');

class ReplyGenerator {
  constructor(apiKey) {
    try {
      this.client = new OpenAI({ apiKey });
      logger.info('Initialized OpenAI client');
    } catch (error) {
      logger.error(`Failed to initialize OpenAI client: ${error.message}`);
      throw error;
    }
  }

  async generateReply(email) {
    try {
      const prompt = `
You are an email assistant tasked with generating polite and context-aware replies.
The email details are:
From: ${email.from}
Subject: ${email.subject}
Content: ${email.body}

Generate a formal and concise reply that addresses the email's content. 
Keep the tone professional and avoid promising anything that cannot be delivered.
Do not include a signature or greeting unless specified.
`;

      const response = await this.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a professional email assistant.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 200,
        temperature: 0.7
      });

      const reply = response.choices[0].message.content.trim();
      logger.info(`Generated reply for email from ${email.from}`);
      return reply;
    } catch (error) {
      logger.error(`Error generating reply: ${error.message}`);
      throw error;
    }
  }
}

module.exports = ReplyGenerator;