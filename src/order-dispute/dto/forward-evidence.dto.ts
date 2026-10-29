import { IsEnum, IsNotEmpty, IsUUID } from 'class-validator';
import { ChatChannelType } from 'src/notification/entities/chat-message.entity';

export class ForwardEvidenceDto {
  @IsUUID()
  @IsNotEmpty()
  messageId: string;

  @IsEnum(ChatChannelType)
  @IsNotEmpty()
  targetChannel: ChatChannelType;
}
