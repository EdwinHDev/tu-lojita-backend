ALTER TABLE IF EXISTS chat_messages
ADD COLUMN IF NOT EXISTS "channelType" varchar(32) DEFAULT 'DIRECT';

CREATE INDEX IF NOT EXISTS idx_chat_messages_order_channel
ON chat_messages("orderId", "channelType");
