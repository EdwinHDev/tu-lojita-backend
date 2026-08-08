import {
  Injectable,
  Logger,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { envs } from 'src/config/envs';
import { AuthGoogleLoginDto } from './dto/auth-google-login.dto';
import { LoginDto } from './dto/login.dto';
import { AppOrigin } from './types/app-origin.enum';
import { GooglePayload } from './types';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from 'src/user/entities/user.entity';
import { UserRole } from 'src/user/types/user-role.enum';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { MailerService } from '@nestjs-modules/mailer';
import { getLoginAlertTemplate } from 'src/common/templates/email-templates';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger('AuthService');
  private readonly googleClient = new OAuth2Client(envs.googleClientId);
  private readonly activeBlockTokens = new Map<string, string>();
  private readonly adminPins = new Map<
    string,
    { pin: string; userId: string; expiresAt: number; attempts: number }
  >();

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly mailerService: MailerService,
  ) { }

  async seedAdmin() {
    // 2.3 Strict check to throw ForbiddenException immediately if process.env.NODE_ENV === 'production'
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException(
        'El seeding no está permitido en producción.',
      );
    }

    try {
      const email = 'tulojita2023@gmail.com';
      const existing = await this.userRepository.findOne({ where: { email } });
      if (!existing) {
        const admin = this.userRepository.create({
          email,
          firstName: 'Admin',
          lastName: 'Lojita',
          role: UserRole.ADMIN,
          isActive: true,
          password: 'admin123', // Automatically hashed in beforeInsert hook
        });
        await this.userRepository.save(admin);
        this.logger.log('Usuario administrador inicial creado exitosamente.');
        return { message: 'Administrador inicial creado exitosamente.' };
      }
      throw new BadRequestException('No puedes realizar esta acción.');
    } catch (error) {
      this.logger.error(
        `Error al sembrar el usuario administrador: ${(error as Error).message}`,
      );
      throw error;
    }
  }

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
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('El usuario está bloqueado o inactivo.');
    }
    const tokens = this.getTokens(userId);
    return tokens;
  }

  async login(loginDto: LoginDto, ip?: string, userAgent?: string) {
    const { email, password, appOrigin } = loginDto;

    const user = await this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('LOWER(user.email) = :email', {
        email: email.toLowerCase().trim(),
      })
      .getOne();

    if (!user || !user.isActive) {
      throw new UnauthorizedException(
        'Las credenciales ingresadas no son válidas.',
      );
    }

    if (!user.password) {
      throw new UnauthorizedException(
        'Este usuario está registrado con Google. Inicia sesión con Google.',
      );
    }

    const isPasswordValid = bcrypt.compareSync(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException(
        'Las credenciales ingresadas no son válidas.',
      );
    }

    if (appOrigin === AppOrigin.CLIENT) {
      if (user.role === UserRole.VENDOR || user.role === UserRole.COMPANY) {
        throw new ForbiddenException('No puedes iniciar sesión con esta cuenta.');
      }
    } else if (appOrigin === AppOrigin.SELLER) {
      if (user.role === UserRole.USER) {
        throw new ForbiddenException('No puedes iniciar sesión con esta cuenta.');
      }
      if (user.role === UserRole.COMPANY) {
        throw new ForbiddenException('No puedes iniciar sesión con esta cuenta.');
      }
    } else if (appOrigin === AppOrigin.BUSINESS) {
      if (user.role === UserRole.USER || user.role === UserRole.VENDOR) {
        throw new ForbiddenException('No puedes iniciar sesión con esta cuenta.');
      }
    } else if (appOrigin === AppOrigin.ADMIN) {
      if (user.role !== UserRole.ADMIN) {
        throw new ForbiddenException('No tienes permisos de administrador para iniciar sesión aquí.');
      }
    }

    if (user.role === 'ADMIN') {
      const pin = Math.floor(100000 + Math.random() * 900000).toString();
      this.adminPins.set(user.id, {
        pin,
        userId: user.id,
        expiresAt: Date.now() + 60000,
        attempts: 0,
      });

      const blockToken = crypto.randomUUID();
      this.activeBlockTokens.set(blockToken, user.id);
      setTimeout(() => {
        this.activeBlockTokens.delete(blockToken);
      }, 3600000);

      const baseUrl = envs.hostApi.endsWith('/v1')
        ? envs.hostApi
        : `${envs.hostApi}/v1`;
      const blockUrl = `${baseUrl}/auth/block-account?token=${blockToken}`;

      this.mailerService
        .sendMail({
          to: user.email,
          subject: 'Código de acceso (PIN) y alerta de seguridad - Tu Lojita',
          html: `
          <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 40px auto; padding: 30px; border: 1px solid #E2E8F0; border-radius: 12px; background-color: #FFFFFF;">
            <h2 style="color: #4F46E5; margin-top: 0; text-align: center;">Código de Verificación</h2>
            <p style="color: #475569; font-size: 16px; text-align: center; margin-bottom: 24px;">
              Usa el siguiente PIN de un único uso para completar tu inicio de sesión:
            </p>
            <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; padding: 16px; border-radius: 8px; text-align: center; margin-bottom: 24px;">
              <span style="font-size: 32px; font-weight: bold; color: #1E293B; letter-spacing: 4px;">${pin}</span>
            </div>
            <p style="color: #94A3B8; font-size: 13px; text-align: center; margin-bottom: 30px;">
              Este código es válido por 1 minuto. Por razones de seguridad, no lo compartas con nadie.
            </p>

            <div style="border-top: 1px solid #E2E8F0; padding-top: 24px; margin-top: 24px; text-align: center;">
              <h4 style="color: #DC2626; margin-top: 0; margin-bottom: 8px;">¿No has sido tú?</h4>
              <p style="color: #64748B; font-size: 14px; margin-bottom: 16px;">
                Si no estás intentando iniciar sesión en este momento, significa que alguien más conoce tus credenciales. Bloquea tu cuenta de inmediato para proteger tus datos.
              </p>
              <a href="${blockUrl}" style="display: inline-block; background-color: #DC2626; color: #FFFFFF; font-weight: bold; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px;">
                Bloquear mi cuenta de inmediato
              </a>
            </div>
          </div>
        `,
        })
        .catch((err) => {
          this.logger.error(
            'Error al enviar PIN de verificación por correo: ' + err.message,
          );
        });

      return {
        requirePin: true,
        userId: user.id,
      };
    }

    // Enviar correo de notificación
    try {
      const blockToken = crypto.randomUUID();
      this.activeBlockTokens.set(blockToken, user.id);
      setTimeout(() => {
        this.activeBlockTokens.delete(blockToken);
      }, 3600000);

      const baseUrl = envs.hostApi.endsWith('/v1')
        ? envs.hostApi
        : `${envs.hostApi}/v1`;
      const blockUrl = `${baseUrl}/auth/block-account?token=${blockToken}`;

      this.mailerService
        .sendMail({
          to: user.email,
          subject: 'Nuevo inicio de sesión en Tu Lojita',
          html: getLoginAlertTemplate(user.firstName, blockUrl, ip, userAgent),
        })
        .catch((err) => {
          this.logger.error(
            `Error al enviar correo de notificación: ${(err as Error).message}`,
          );
        });
    } catch (error) {
      this.logger.error(
        `Error al intentar enviar notificación de correo: ${(error as Error).message}`,
      );
    }

    // Quitamos datos sensibles
    const {
      confirm: _confirm,
      confirmToken: _confirmToken,
      password: _,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      googleId: _googleId,
      isActive: _isActive,
      ...restUser
    } = user;

    // Generamos los tokens
    const tokens = this.getTokens(user.id);

    // Retornamos el usuario y sus tokens
    return {
      user: restUser,
      ...tokens,
    };
  }

  async blockAccount(token: string) {
    try {
      const userId = this.activeBlockTokens.get(token);

      if (!userId) {
        return `
          <div style="font-family: Arial, sans-serif; text-align: center; margin-top: 50px;">
            <h2 style="color: #DC2626;">Error</h2>
            <p style="color: #4B5563;">El enlace no es válido o ya ha sido utilizado.</p>
          </div>
        `;
      }

      // Eliminar el token inmediatamente para que sea de un solo uso
      this.activeBlockTokens.delete(token);

      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (!user) {
        return `
          <div style="font-family: Arial, sans-serif; text-align: center; margin-top: 50px;">
            <h2 style="color: #DC2626;">Error</h2>
            <p style="color: #4B5563;">El usuario no existe o ha sido eliminado.</p>
          </div>
        `;
      }

      user.isActive = false;
      await this.userRepository.save(user);

      this.logger.log(
        `Usuario con ID ${userId} bloqueado mediante enlace de correo.`,
      );

      return `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 60px auto; padding: 40px; border: 1px solid #E2E8F0; border-radius: 12px; text-align: center; background-color: #FFFFFF; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <h2 style="color: #DC2626; margin-top: 0;">Cuenta Bloqueada</h2>
          <p style="color: #475569; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
            La cuenta asociada al correo <strong>${user.email}</strong> ha sido bloqueada correctamente por motivos de seguridad.
          </p>
          <div style="background-color: #FEF2F2; border: 1px solid #FEE2E2; padding: 12px; border-radius: 8px;">
            <p style="color: #991B1B; font-size: 14px; margin: 0;">
              Ningún usuario podrá acceder o renovar tokens en esta cuenta hasta que sea restaurada.
            </p>
          </div>
        </div>
      `;
    } catch (error) {
      return `
        <div style="font-family: Arial, sans-serif; text-align: center; margin-top: 50px;">
          <h2 style="color: #DC2626;">Error</h2>
          <p style="color: #4B5563;">Ha ocurrido un error al procesar el enlace.</p>
        </div>
      `;
    }
  }

  async checkGoogleAuth(authGoogleLoginDto: AuthGoogleLoginDto) {
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken: authGoogleLoginDto.token,
        audience: envs.googleClientId,
      });

      const payload = ticket.getPayload() as GooglePayload;
      let user = await this.userRepository.findOne({
        where: { email: payload.email },
        relations: ['company', 'store'],
      });

      if (!user) {
        let newRole = UserRole.USER;
        if (authGoogleLoginDto.appOrigin === AppOrigin.SELLER) {
          newRole = UserRole.VENDOR;
        } else if (authGoogleLoginDto.appOrigin === AppOrigin.BUSINESS) {
          newRole = UserRole.COMPANY;
        }

        user = this.userRepository.create({
          email: payload.email,
          firstName: payload.given_name,
          lastName: payload.family_name,
          avatarUrl: payload.picture,
          googleId: payload.sub,
          role: newRole,
        });
        user = await this.userRepository.save(user);
        // Para usuarios nuevos, company y store serán null por defecto.
      } else {
        if (authGoogleLoginDto.appOrigin === AppOrigin.CLIENT) {
          if (user.role === UserRole.VENDOR || user.role === UserRole.COMPANY) {
            throw new ForbiddenException('No puedes iniciar sesión con esta cuenta.');
          }
        } else if (authGoogleLoginDto.appOrigin === AppOrigin.SELLER) {
          if (user.role === UserRole.USER) {
            throw new ForbiddenException('No puedes iniciar sesión con esta cuenta.');
          }
          if (user.role === UserRole.COMPANY) {
            throw new ForbiddenException('No puedes iniciar sesión con esta cuenta.');
          }
        } else if (authGoogleLoginDto.appOrigin === AppOrigin.BUSINESS) {
          if (user.role === UserRole.USER) {
            throw new ForbiddenException('No puedes iniciar sesión con esta cuenta.');
          }
          if (user.role === UserRole.VENDOR) {
            // Upgrade to COMPANY
            user.role = UserRole.COMPANY;
            user = await this.userRepository.save(user);
          }
        }
      }

      // Quitamos datos sensibles
      const {
        confirm: _confirm,
        confirmToken: _confirmToken,
        password: _password,
        createdAt: _createdAt,
        updatedAt: _updatedAt,
        googleId: _googleId,
        isActive: _isActive,
        ...restUser
      } = user;

      // Generamos los tokens
      const tokens = this.getTokens(user.id);

      // Retornamos el usuario y sus tokens
      return {
        user: restUser,
        ...tokens,
      };
    } catch (error) {
      if (error instanceof ForbiddenException || error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.error(
        `Error verifying Google token: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw new UnauthorizedException(
        'El token de Google no es válido o ha expirado.',
      );
    }
  }

  async verifyPin(userId: string, pin: string) {
    const pinData = this.adminPins.get(userId);

    if (!pinData) {
      throw new UnauthorizedException('El PIN no es válido o ha expirado.');
    }

    if (pinData.pin !== pin) {
      pinData.attempts += 1;
      this.adminPins.set(userId, pinData);

      if (pinData.attempts >= 3) {
        this.adminPins.delete(userId);
        const user = await this.userRepository.findOne({
          where: { id: userId },
        });
        if (user) {
          user.isActive = false;
          await this.userRepository.save(user);
        }
        throw new UnauthorizedException(
          'Tu cuenta ha sido bloqueada por seguridad tras superar los 3 intentos fallidos con el PIN.',
        );
      }

      throw new UnauthorizedException(
        `El PIN ingresado es incorrecto. Intentos restantes: ${3 - pinData.attempts}.`,
      );
    }

    if (Date.now() > pinData.expiresAt) {
      this.adminPins.delete(userId);
      throw new UnauthorizedException('El PIN ha expirado.');
    }

    // Remueve el pin del mapa para que sea de un único uso
    this.adminPins.delete(userId);

    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['company', 'store'],
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException(
        'El usuario no es válido o está inactivo.',
      );
    }

    const {
      confirm: _confirm,
      confirmToken: _confirmToken,
      password: _password,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      googleId: _googleId,
      isActive: _isActive,
      ...restUser
    } = user;

    const tokens = this.getTokens(user.id);

    return {
      user: restUser,
      ...tokens,
    };
  }
}
