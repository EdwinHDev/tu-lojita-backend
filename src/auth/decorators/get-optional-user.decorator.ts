import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const GetOptionalUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest();
    const user = req.user;
    if (!user) {
      return null;
    }
    return !data ? user : user[data];
  },
);
