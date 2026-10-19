import { receptionistEngine } from '../engine.js';

export class WhatsAppChannelAdapter {
  /**
   * Handles inbound WhatsApp text or media messages
   */
  async handleInboundMessage({ fromNumber, message, mediaAttachment = null, customerName }) {
    const response = await receptionistEngine.processMessage({
      phone: fromNumber || '+18005550199',
      message: message || '',
      channel: 'WHATSAPP',
      mediaAttachment,
      customerName
    });

    return {
      text: response.text,
      toolCalls: response.toolCalls,
      triageStatus: response.triageStatus,
      leadSummary: response.leadSummary
    };
  }

  /**
   * Twilio WhatsApp Webhook parser
   */
  async handleTwilioWhatsAppWebhook(body) {
    const fromNumber = body.From?.replace('whatsapp:', '');
    const message = body.Body || '';
    const numMedia = parseInt(body.NumMedia || '0', 10);
    
    let mediaAttachment = null;
    if (numMedia > 0) {
      mediaAttachment = {
        url: body.MediaUrl0,
        contentType: body.MediaContentType0,
        type: 'photo',
        description: 'Customer WhatsApp photo upload'
      };
    }

    const res = await this.handleInboundMessage({
      fromNumber,
      message,
      mediaAttachment
    });

    // Return Twilio Messaging Response XML
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${this._escapeXml(res.text)}</Message>
</Response>`;
  }

  /**
   * Meta Cloud API Webhook parser
   */
  async handleMetaCloudWebhook(body) {
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const msg = value?.messages?.[0];

    if (!msg) return { status: 'no_message' };

    const fromNumber = msg.from;
    const messageText = msg.text?.body || '';
    let mediaAttachment = null;

    if (msg.type === 'image') {
      mediaAttachment = {
        id: msg.image?.id,
        type: 'photo',
        description: 'WhatsApp Image sent by user'
      };
    }

    const res = await this.handleInboundMessage({
      fromNumber,
      message: messageText,
      mediaAttachment
    });

    return {
      recipient: fromNumber,
      response: res.text
    };
  }

  _escapeXml(unsafe) {
    return unsafe.replace(/[<>&'"]/g, c => {
      switch (c) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '&': return '&amp;';
        case '\'': return '&apos;';
        case '"': return '&quot;';
      }
    });
  }
}

export const whatsappChannel = new WhatsAppChannelAdapter();
