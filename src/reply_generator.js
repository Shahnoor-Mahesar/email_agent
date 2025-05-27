const OpenAI = require('openai');
const { logger, responseLogger, getConfig } = require('./config');

class ReplyGenerator {
  constructor(apiKey) {
    this.openai = new OpenAI({ apiKey });
    this.config = getConfig();
  }

  async generateReply(email) {
    try {
      const bodyLower = email.body.toLowerCase();
      const hasSensitiveKeyword = this.config.sensitiveKeywords.some(keyword => bodyLower.includes(keyword.toLowerCase()));

      if (hasSensitiveKeyword) {
        const keywordsFound = this.config.sensitiveKeywords.filter(keyword => bodyLower.includes(keyword.toLowerCase()));
        logger.info(`Sensitive keywords detected in email from ${email.from}: ${keywordsFound.join(', ')}. Flagging for manual review.`);
        return { reply: null, needsManualReview: true, keywords: keywordsFound };
      }

      const isOrderStatus = this.config.orderStatusKeywords.some(keyword => bodyLower.includes(keyword.toLowerCase())) && !bodyLower.includes('stornieren');
      const isFAQ = this.config.faqKeywords.some(keyword => bodyLower.includes(keyword.toLowerCase()));
      const isThankYou = this.config.thankYouKeywords.some(keyword => bodyLower.includes(keyword.toLowerCase()));

      let prompt;
      const isGerman = email.language === 'german';
      const senderName = email.senderName || (isGerman ? 'Kunde' : 'Customer');
      const signOff = isGerman ? 'Mandy vom Ceres Kundenservice' : 'Mandy from Ceres Customer Service';
      const discountMessage = isGerman
        ? 'Entschuldigung für etwaige Unannehmlichkeiten. Verwenden Sie den Code SORRY10 für 10% Rabatt auf Ihren nächsten Einkauf.'
        : 'Sorry for any inconvenience. Use code SORRY10 for 10% off your next purchase.';

      if (isOrderStatus) {
        prompt = isGerman
          ? `Erstelle eine höfliche, professionelle Antwort auf Deutsch für eine Bestellstatus-Anfrage. Beginne mit "Sehr geehrte/r ${senderName}". Sage, dass die Bestellung unterwegs ist, ohne ein genaues Datum zu nennen. Füge diesen Rabattcode hinzu: "${discountMessage}". Unterschreibe mit "${signOff}". Antworte nur auf den Inhalt der E-Mail: "${email.body}".`
          : `Create a polite, professional response in English for an order status query. Begin with "Dear ${senderName}". Say the order is on its way, without specifying a date. Include this discount code: "${discountMessage}". Sign off with "${signOff}". Respond only to the email content: "${email.body}".`;
      } else if (isFAQ) {
        prompt = isGerman
          ? `Erstelle eine höfliche, professionelle Antwort auf Deutsch für eine FAQ-Anfrage (z.B. Größe, Lieferzeit). Beginne mit "Sehr geehrte/r ${senderName}". Beantworte die Frage kurz und klar basierend auf dem E-Mail-Text: "${email.body}". Füge diesen Rabattcode hinzu: "${discountMessage}". Unterschreibe mit "${signOff}".`
          : `Create a polite, professional response in English for an FAQ query (e.g., sizing, delivery time). Begin with "Dear ${senderName}". Answer the question briefly and clearly based on the email text: "${email.body}". Include this discount code: "${discountMessage}". Sign off with "${signOff}".`;
      } else if (isThankYou) {
        prompt = isGerman
          ? `Erstelle eine freundliche Antwort auf Deutsch für eine Dankes-E-Mail. Beginne mit "Sehr geehrte/r ${senderName}". Danke dem Kunden für die Nachricht. Füge diesen Rabattcode hinzu: "${discountMessage}". Unterschreibe mit "${signOff}". Antworte nur auf den Inhalt der E-Mail: "${email.body}".`
          : `Create a friendly response in English for a thank-you email. Begin with "Dear ${senderName}". Thank the customer for their message. Include this discount code: "${discountMessage}". Sign off with "${signOff}". Respond only to the email content: "${email.body}".`;
      } else {
        prompt = isGerman
          ? `Erstelle eine höfliche, neutrale Antwort auf Deutsch für eine allgemeine E-Mail. Beginne mit "Sehr geehrte/r ${senderName}". Beantworte die E-Mail kurz und professionell basierend auf dem Text: "${email.body}". Füge diesen Rabattcode hinzu: "${discountMessage}". Unterschreibe mit "${signOff}".`
          : `Create a polite, neutral response in English for a general email. Begin with "Dear ${senderName}". Respond briefly and professionally based on the email text: "${email.body}". Include this discount code: "${discountMessage}". Sign off with "${signOff}".`;
      }

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: `You are a polite and professional customer service assistant. Respond in ${isGerman ? 'German' : 'English'} and avoid including the email subject in the response body.` },
          { role: 'user', content: prompt }
        ],
        max_tokens: 200
      });

      const reply = response.choices[0].message.content.trim();
      logger.info(`Generated reply for email from ${email.from} in ${isGerman ? 'German' : 'English'}: ${reply}`);
      responseLogger.info({ email: { from: email.from, subject: email.subject, body: email.body, language: email.language }, reply });

      return { reply, needsManualReview: false };
    } catch (error) {
      logger.error(`Error generating reply for email from ${email.from}: ${error.message}`);
      throw error;
    }
  }
}

module.exports = ReplyGenerator;