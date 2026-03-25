import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { envs } from 'src/config/envs';
import { AuthGoogleLoginDto } from './dto/auth-google-login.dto';
import { GooglePayload } from './types';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from 'src/user/entities/user.entity';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  private readonly logger = new Logger('AuthService');
  private readonly googleClient = new OAuth2Client(envs.googleClientId);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService
  ) { }

  // Método auxiliar para generar tokens
  private getTokens(userId: string) {
    const payload = { sub: userId };

    return {
      accessToken: this.jwtService.sign(payload, {
        secret: envs.jwtSecret,
        expiresIn: '15m', // Tiempo de vida corto
      }),
      refreshToken: this.jwtService.sign(payload, {
        secret: envs.jwtRefreshSecret,
        expiresIn: '7d', // Tiempo de vida largo
      }),
    };
  }

  async renewTokens(userId: string) {
    // Como el refresh token es válido, emitimos un nuevo par de tokens
    const tokens = this.getTokens(userId);
    return tokens;
  }

  async checkGoogleAuth(authGoogleLoginDto: AuthGoogleLoginDto) {
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken: authGoogleLoginDto.token,
        audience: envs.googleClientId,
      });

      const payload = ticket.getPayload() as GooglePayload;
      let user = await this.userRepository.findOneBy({ email: payload.email });

      if (!user) {
        user = this.userRepository.create({
          email: payload.email,
          firstName: payload.given_name,
          lastName: payload.family_name,
          avatarUrl: payload.picture,
          googleId: payload.sub,
        });
        await this.userRepository.save(user);
      }

      // Quitamos datos sensibles
      const { confirm, confirmToken, password, createdAt, updatedAt, googleId, isActive, role, ...restUser } = user;

      // Generamos los tokens
      const tokens = this.getTokens(user.id);

      // Retornamos el usuario y sus tokens
      return {
        user: restUser,
        ...tokens
      };

    } catch (error) {
      this.logger.error(`Error verifying Google token: ${error.message}`, error.stack);
      throw new UnauthorizedException('El token de Google no es válido o ha expirado.');
    }
  }
}
