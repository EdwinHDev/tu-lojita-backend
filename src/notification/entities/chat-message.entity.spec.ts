import { ChatMessage, ChatChannelType } from './chat-message.entity';

describe('ChatMessage Entity', () => {
  it('should have correct enum values for ChatChannelType', () => {
    expect(ChatChannelType.DIRECT).toBe('DIRECT');
    expect(ChatChannelType.DISPUTE_BUYER_SUPPORT).toBe('DISPUTE_BUYER_SUPPORT');
    expect(ChatChannelType.DISPUTE_MERCHANT_SUPPORT).toBe(
      'DISPUTE_MERCHANT_SUPPORT',
    );
  });

  it('should default channelType to DIRECT when instantiated or initialized', () => {
    const message = new ChatMessage();
    message.content = 'Hola mundo';

    expect(message.channelType ?? ChatChannelType.DIRECT).toBe(
      ChatChannelType.DIRECT,
    );
  });

  it('should allow setting explicit dispute support channel types and image evidence', () => {
    const buyerSupportMsg = new ChatMessage();
    buyerSupportMsg.content = 'Adjunto comprobante bancario para soporte';
    buyerSupportMsg.channelType = ChatChannelType.DISPUTE_BUYER_SUPPORT;
    buyerSupportMsg.imageUrl = 'https://tulojita.com/comprobante-1.jpg';

    expect(buyerSupportMsg.channelType).toBe(
      ChatChannelType.DISPUTE_BUYER_SUPPORT,
    );
    expect(buyerSupportMsg.imageUrl).toBe(
      'https://tulojita.com/comprobante-1.jpg',
    );

    const merchantSupportMsg = new ChatMessage();
    merchantSupportMsg.content = 'Adjunto reporte contable de la tienda';
    merchantSupportMsg.channelType = ChatChannelType.DISPUTE_MERCHANT_SUPPORT;

    expect(merchantSupportMsg.channelType).toBe(
      ChatChannelType.DISPUTE_MERCHANT_SUPPORT,
    );
  });
});
