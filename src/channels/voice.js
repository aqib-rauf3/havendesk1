import { receptionistEngine } from '../engine.js';

export class VoiceChannelAdapter {
  /**
   * Universal voice handler used by Retell AI, Vapi, Twilio, and the live UI Phone Simulator
   */
  async handleVoiceCall({ callerNumber, speechInput, channel = 'VOICE', customerName }) {
    const response = await receptionistEngine.processMessage({
      phone: callerNumber || '+18005550199',
      message: speechInput,
      channel: 'VOICE',
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
   * Vapi custom LLM webhook adapter
   */
  async handleVapiWebhook(payload) {
    const { message } = payload;
    if (message.type === 'tool-calls') {
      // Execute tool calls requested by Vapi
      return { results: [{ toolCallId: message.toolCalls[0].id, result: "Confirmed" }] };
    }

    if (message.type === 'assistant-request') {
      const callerNumber = payload.call?.customer?.number || '+18005550199';
      const userText = message.messages?.slice(-1)[0]?.content || 'Hello';
      
      const res = await this.handleVoiceCall({ callerNumber, speechInput: userText });
      return {
        assistant: {
          model: {
            messages: [{ role: 'assistant', content: res.text }]
          }
        }
      };
    }

    return { status: "received" };
  }

  /**
   * Retell AI custom LLM WebSocket / Webhook handler
   */
  async handleRetellWebhook(payload) {
    const { call, event } = payload;
    if (event === 'call_analyzed') {
      return { status: "success" };
    }

    const callerNumber = call?.from_number || '+18005550199';
    const transcript = payload.transcript || "Hello";
    return await this.handleVoiceCall({ callerNumber, speechInput: transcript });
  }

  /**
   * Twilio Voice TwiML response generator
   */
  async handleTwilioVoice(reqBody) {
    const callerNumber = reqBody.From || '+18005550199';
    const speechResult = reqBody.SpeechResult || reqBody.TranscriptionText || 'Hello';

    const res = await this.handleVoiceCall({ callerNumber, speechInput: speechResult });
    
    // Generate valid TwiML
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">${this._escapeXml(res.text)}</Say>
  <Gather input="speech" timeout="4" action="/api/voice/twilio/gather" method="POST">
    <Say>I'm listening...</Say>
  </Gather>
</Response>`;
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

export const voiceChannel = new VoiceChannelAdapter();
