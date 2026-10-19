import { receptionistEngine } from '../engine.js';

export class WidgetChannelAdapter {
  /**
   * Handles website chat message from embeddable widget
   */
  async handleChatMessage({ sessionId, phone, message, customerName }) {
    const userPhone = phone || `web_${sessionId || 'guest'}`;
    const response = await receptionistEngine.processMessage({
      phone: userPhone,
      message,
      channel: 'WEB',
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
   * Returns current widget configuration for the active business
   */
  getWidgetConfig() {
    const profile = receptionistEngine.getActiveProfile();
    return {
      businessName: profile.businessName,
      tagline: profile.tagline,
      receptionistName: profile.receptionistPersona.name,
      greeting: profile.receptionistPersona.greeting,
      phone: profile.phone,
      whatsapp: profile.whatsapp,
      services: profile.services
    };
  }
}

export const widgetChannel = new WidgetChannelAdapter();
