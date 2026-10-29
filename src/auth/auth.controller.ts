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
import { RequestRegistrationOtpDto } from './dto/request-registration-otp.dto';
import { VerifyRegistrationOtpDto } from './dto/verify-registration-otp.dto';
import { ResendRegistrationOtpDto } from './dto/resend-registration-otp.dto';
import { CreateAdminDto } from './dto/create-admin.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RequestForgotPasswordOtpDto } from './dto/request-forgot-password-otp.dto';
import { VerifyForgotPasswordOtpDto } from './dto/verify-forgot-password-otp.dto';
import { ResendForgotPasswordOtpDto } from './dto/resend-forgot-password-otp.dto';
import { ResetForgotPasswordDto } from './dto/reset-forgot-password.dto';
import { AuthGuard } from '@nestjs/passport';
import { User } from 'src/user/entities/user.entity';
import { UserRole } from 'src/user/types/user-role.enum';
import { Request, Response } from 'express';
import {
  CollaboratorLoginDto,
  ChangeCollaboratorPasswordDto,
} from 'src/company/dto/collaborator-auth.dto';
import { Auth } from './decorators/auth.decorator';
import { GetUser } from './decorators/get-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('block-account')
  async blockAccount(@Query('token') token: string, @Res() res: Response) {
    const html = await this.authService.blockAccount(token);
    res.setHeader('Content-Type', 'text/html');
    return res.send(html);
  }

  @Post('collaborator-login')
  loginCollaborator(@Body() loginDto: CollaboratorLoginDto) {
    return this.authService.loginCollaborator(loginDto);
  }

  @Post('collaborator-change-password')
  @Auth()
  changeCollaboratorPassword(
    @Body() dto: ChangeCollaboratorPasswordDto,
    @GetUser() actor: any,
  ) {
    return this.authService.changeCollaboratorPassword(actor.id, dto);
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

  @Post('register/request-otp')
  requestRegistrationOtp(@Body() dto: RequestRegistrationOtpDto) {
    return this.authService.requestRegistrationOtp(dto);
  }

  @Post('register/verify-otp')
  verifyRegistrationOtp(@Body() dto: VerifyRegistrationOtpDto) {
    return this.authService.verifyRegistrationOtp(dto);
  }

  @Post('register/resend-otp')
  resendRegistrationOtp(@Body() dto: ResendRegistrationOtpDto) {
    return this.authService.resendRegistrationOtp(dto);
  }

  @Post('forgot-password/request-otp')
  requestForgotPasswordOtp(@Body() dto: RequestForgotPasswordOtpDto) {
    return this.authService.requestForgotPasswordOtp(dto);
  }

  @Post('forgot-password/verify-otp')
  verifyForgotPasswordOtp(@Body() dto: VerifyForgotPasswordOtpDto) {
    return this.authService.verifyForgotPasswordOtp(dto);
  }

  @Post('forgot-password/resend-otp')
  resendForgotPasswordOtp(@Body() dto: ResendForgotPasswordOtpDto) {
    return this.authService.resendForgotPasswordOtp(dto);
  }

  @Post('forgot-password/reset-password')
  resetPassword(@Body() dto: ResetForgotPasswordDto) {
    return this.authService.resetPasswordWithToken(dto);
  }

  @Auth() // Protege la ruta (Cualquier usuario logueado, sin importar el rol)
  @Get('check-status')
  checkAuthStatus(@Req() req: Request) {
    // Si el guard pasa, el usuario existe y su token es válido.
    // Retornamos el usuario (la contraseña ya está oculta por TypeORM)
    const user = req.user as User;
    return { user };
  }

  @Auth(UserRole.ADMIN)
  @Post('admin/create-admin')
  createAdmin(@Body() dto: CreateAdminDto) {
    return this.authService.createAdmin(dto);
  }

  @Auth()
  @Patch('change-password')
  changePassword(
    @GetUser('id') userId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(userId, dto);
  }
}
