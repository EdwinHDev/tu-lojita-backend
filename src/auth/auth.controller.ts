import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Req,
  Query,
  Res,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGoogleLoginDto } from './dto/auth-google-login.dto';
import { LoginDto } from './dto/login.dto';
import { AuthGuard } from '@nestjs/passport';
import { User } from 'src/user/entities/user.entity';
import { Request, Response } from 'express';
import { Auth } from './decorators/auth.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('block-account')
  async blockAccount(@Query('token') token: string, @Res() res: Response) {
    const html = await this.authService.blockAccount(token);
    res.setHeader('Content-Type', 'text/html');
    return res.send(html);
  }

  @Post('seed')
  seedAdmin() {
    return this.authService.seedAdmin();
  }

  @Post('login')
  login(@Body() loginDto: LoginDto, @Req() req: Request) {
    const ip = req.ip || (req.headers['x-forwarded-for'] as string);
    const userAgent = req.headers['user-agent'];
    return this.authService.login(loginDto, ip, userAgent);
  }

  @Post('google')
  checkGoogleAuth(@Body() authGoogleLoginDto: AuthGoogleLoginDto) {
    return this.authService.checkGoogleAuth(authGoogleLoginDto);
  }

  @Post('verify-pin')
  verifyPin(@Body() body: { userId: string; pin: string }) {
    return this.authService.verifyPin(body.userId, body.pin);
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
