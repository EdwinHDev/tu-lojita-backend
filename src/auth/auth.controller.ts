import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGoogleLoginDto } from './dto/auth-google-login.dto';
import { AuthGuard } from '@nestjs/passport';
import { User } from 'src/user/entities/user.entity';
import { Request } from 'express';
import { Auth } from './decorators/auth.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  @Post('google')
  checkGoogleAuth(@Body() authGoogleLoginDto: AuthGoogleLoginDto) {
    return this.authService.checkGoogleAuth(authGoogleLoginDto);
  }

  @UseGuards(AuthGuard('jwt-refresh')) // <-- Usa la estrategia de refresh
  @Get('refresh')
  renewTokens(@Req() req: Request) {
    // Gracias al AuthGuard, NestJS ya validó el token y nos dejó el usuario en req.user
    const user = req.user as User;
    return this.authService.renewTokens(user.id);
  }

  @Auth() // Protege la ruta (Cualquier usuario logueado, sin importar el rol)
  @Get('check-status')
  checkAuthStatus(@Req() req: Request) {
    // Si el guard pasa, el usuario existe y su token es válido.
    // Retornamos el usuario (la contraseña ya está oculta por TypeORM)
    const user = req.user as User;
    return { user };
  }
}
