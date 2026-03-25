import { createParamDecorator, ExecutionContext, InternalServerErrorException } from '@nestjs/common';

export const GetUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {

    // Extraemos la request
    const req = ctx.switchToHttp().getRequest();
    const user = req.user;

    // Si no hay usuario, significa que olvidamos poner el @UseGuards() en la ruta
    if (!user) {
      throw new InternalServerErrorException('Usuario no encontrado (¿Olvidaste el AuthGuard?)');
    }

    // Si pedimos un campo específico (ej: @GetUser('id')), lo retornamos. 
    // Si no pasamos nada (ej: @GetUser()), retornamos todo el usuario.
    return (!data) ? user : user[data];
  }
);