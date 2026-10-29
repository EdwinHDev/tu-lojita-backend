import {
  Injectable,
  Logger,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
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
import {
  getLoginAlertTemplate,
  getRegistrationOtpTemplate,
  getPasswordResetOtpTemplate,
} from 'src/common/templates/email-templates';
import { RequestRegistrationOtpDto } from './dto/request-registration-otp.dto';
import { VerifyRegistrationOtpDto } from './dto/verify-registration-otp.dto';
import { ResendRegistrationOtpDto } from './dto/resend-registration-otp.dto';
import { CreateAdminDto } from './dto/create-admin.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RequestForgotPasswordOtpDto } from './dto/request-forgot-password-otp.dto';
import { VerifyForgotPasswordOtpDto } from './dto/verify-forgot-password-otp.dto';
import { ResendForgotPasswordOtpDto } from './dto/resend-forgot-password-otp.dto';
import { ResetForgotPasswordDto } from './dto/reset-forgot-password.dto';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { CompanyCollaborator } from 'src/company/entities/company-collaborator.entity';
import {
  CollaboratorLoginDto,
  ChangeCollaboratorPasswordDto,
} from 'src/company/dto/collaborator-auth.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger('AuthService');
  private readonly googleClient = new OAuth2Client(envs.googleClientId);
  private readonly activeBlockTokens = new Map<string, string>();
  private readonly collaboratorLoginAttempts = new Map<
    string,
    { attempts: number; blockedUntil: number }
  >();
  private readonly adminPins = new Map<
    string,
    { pin: string; userId: string; expiresAt: number; attempts: number }
  >();

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(CompanyCollaborator)
    private readonly collaboratorRepository: Repository<CompanyCollaborator>,
    private readonly jwtService: JwtService,
    private readonly mailerService: MailerService,
  ) {}

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
        expiresIn: '30d', // Tiempo de vida extendido para sesiones móviles
      }),
      refreshToken: this.jwtService.sign(payload, {
        secret: envs.jwtRefreshSecret,
        expiresIn: '90d', // Tiempo de vida largo para sesiones móviles
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
      .leftJoinAndSelect('user.company', 'company')
      .leftJoinAndSelect('company.subcategory', 'companySubcategory')
      .leftJoinAndSelect('companySubcategory.category', 'companyCategory')
      .leftJoinAndSelect('user.store', 'store')
      .where('LOWER(user.email) = :email', {
        email: email.toLowerCase().trim(),
      })
      .getOne();

    if (!user) {
      throw new UnauthorizedException(
        'Las credenciales ingresadas no son válidas.',
      );
    }

    if (!user.isActive) {
      const reasonMsg = user.accountSuspensionReason
        ? ` Motivo: ${user.accountSuspensionReason}`
        : '';
      throw new ForbiddenException({
        statusCode: 403,
        code: 'ACCOUNT_BANNED',
        message: `Tu cuenta ha sido cancelada o suspendida permanentemente.${reasonMsg}`,
        reason: user.accountSuspensionReason || undefined,
      });
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

    // Validar suspensión temporal por fraude
    if (user.accountSuspendedUntil) {
      const now = new Date();
      if (new Date(user.accountSuspendedUntil) <= now) {
        user.accountSuspendedUntil = null;
        user.accountSuspensionReason = null;
        await this.userRepository.save(user);
      }
      // NOTA: Si sigue suspendido (> now), NO lanzamos ForbiddenException aquí.
      // Se emiten tokens y se retorna el usuario con accountSuspendedUntil para
      // permitir acceso a AccountSuspendedScreen y gestión de apelación / soporte.
    }

    if (appOrigin === AppOrigin.CLIENT) {
      if (user.role === UserRole.VENDOR || user.role === UserRole.COMPANY) {
        throw new ForbiddenException(
          'No puedes iniciar sesión con esta cuenta.',
        );
      }
    } else if (appOrigin === AppOrigin.SELLER) {
      if (user.role === UserRole.USER) {
        throw new ForbiddenException(
          'No puedes iniciar sesión con esta cuenta.',
        );
      }
      if (user.role === UserRole.COMPANY) {
        throw new ForbiddenException(
          'No puedes iniciar sesión con esta cuenta.',
        );
      }
    } else if (appOrigin === AppOrigin.BUSINESS) {
      if (user.role === UserRole.USER || user.role === UserRole.VENDOR) {
        throw new ForbiddenException(
          'No puedes iniciar sesión con esta cuenta.',
        );
      }
    } else if (appOrigin === AppOrigin.ADMIN) {
      if (user.role !== UserRole.ADMIN) {
        throw new ForbiddenException(
          'No tienes permisos de administrador para iniciar sesión aquí.',
        );
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
        relations: [
          'company',
          'company.subcategory',
          'company.subcategory.category',
          'store',
        ],
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
        if (!user.isActive) {
          const reasonMsg = user.accountSuspensionReason
            ? ` Motivo: ${user.accountSuspensionReason}`
            : '';
          throw new ForbiddenException({
            statusCode: 403,
            code: 'ACCOUNT_BANNED',
            message: `Tu cuenta ha sido cancelada o suspendida permanentemente.${reasonMsg}`,
            reason: user.accountSuspensionReason || undefined,
          });
        }

        if (authGoogleLoginDto.appOrigin === AppOrigin.CLIENT) {
          if (user.role === UserRole.VENDOR || user.role === UserRole.COMPANY) {
            throw new ForbiddenException(
              'No puedes iniciar sesión con esta cuenta.',
            );
          }
        } else if (authGoogleLoginDto.appOrigin === AppOrigin.SELLER) {
          if (user.role === UserRole.USER) {
            throw new ForbiddenException(
              'No puedes iniciar sesión con esta cuenta.',
            );
          }
          if (user.role === UserRole.COMPANY) {
            throw new ForbiddenException(
              'No puedes iniciar sesión con esta cuenta.',
            );
          }
        } else if (authGoogleLoginDto.appOrigin === AppOrigin.BUSINESS) {
          if (user.role === UserRole.USER) {
            throw new ForbiddenException(
              'No puedes iniciar sesión con esta cuenta.',
            );
          }
          if (user.role === UserRole.VENDOR) {
            // Upgrade to COMPANY
            user.role = UserRole.COMPANY;
            user = await this.userRepository.save(user);
          }
        }
      }

      // Validar suspensión temporal por fraude
      if (user.accountSuspendedUntil) {
        const now = new Date();
        if (new Date(user.accountSuspendedUntil) <= now) {
          user.accountSuspendedUntil = null;
          user.accountSuspensionReason = null;
          await this.userRepository.save(user);
        }
      }

      // Quitamos datos sensibles
      const {
        confirm: _confirm,
        confirmToken: _confirmToken,
        password: _password,
        createdAt: _createdAt,
        updatedAt: _updatedAt,
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
      if (
        error instanceof ForbiddenException ||
        error instanceof UnauthorizedException
      ) {
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
      relations: [
        'company',
        'company.subcategory',
        'company.subcategory.category',
        'store',
      ],
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
      isActive: _isActive,
      ...restUser
    } = user;

    const tokens = this.getTokens(user.id);

    return {
      user: restUser,
      ...tokens,
    };
  }

  async requestRegistrationOtp(dto: RequestRegistrationOtpDto) {
    const email = dto.email.toLowerCase().trim();

    // 1. Validar que el correo no esté ya registrado en la base de datos
    const existingUser = await this.userRepository.findOne({
      where: { email },
    });

    if (existingUser) {
      throw new BadRequestException(
        'El correo electrónico ya está registrado.',
      );
    }

    // 2. Generar código OTP numérico de 6 dígitos
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = bcrypt.hashSync(otp, 10);

    // 3. Crear token de pre-registro firmado (10 minutos de vigencia)
    const payload = {
      type: 'REGISTRATION_OTP',
      email,
      firstName: dto.firstName,
      lastName: dto.lastName || null,
      password: dto.password,
      appOrigin: dto.appOrigin,
      phone: dto.phone || null,
      identification: dto.identification || null,
      birthDate: dto.birthDate || null,
      otpHash,
      issuedAt: Date.now(),
    };

    const registrationToken = this.jwtService.sign(payload, {
      secret: envs.jwtSecret,
      expiresIn: '10m',
    });

    // 4. Enviar correo electrónico con el código OTP
    try {
      await this.mailerService.sendMail({
        to: email,
        subject: 'Código de verificación de tu cuenta - Tu Lojita',
        text: `Hola ${dto.firstName},\n\nTu código de verificación para registrarte en Tu Lojita es: ${otp}\n\nEste código vence en 10 minutos.\nSi no solicitaste este código, puedes ignorar este mensaje.\n\nTu Lojita`,
        html: getRegistrationOtpTemplate(otp, dto.firstName),
      });
    } catch (error) {
      this.logger.error(
        `Error enviando correo OTP a ${email}: ${(error as Error).message}`,
      );
      throw new BadRequestException(
        'No se pudo enviar el correo de verificación. Por favor verifica tu dirección de correo.',
      );
    }

    // 5. Retornar confirmación (La base de datos NO se toca)
    return {
      message: 'Código de verificación enviado al correo electrónico.',
      registrationToken,
      expiresIn: 600,
    };
  }

  async verifyRegistrationOtp(dto: VerifyRegistrationOtpDto) {
    let payload: any;
    try {
      payload = this.jwtService.verify(dto.registrationToken, {
        secret: envs.jwtSecret,
      });
    } catch (error) {
      throw new BadRequestException(
        'El código o la sesión de verificación ha expirado. Por favor intenta registrarte de nuevo.',
      );
    }

    if (payload.type !== 'REGISTRATION_OTP') {
      throw new BadRequestException('Token de verificación inválido.');
    }

    // Validar el código OTP
    const isOtpValid = bcrypt.compareSync(dto.otp.trim(), payload.otpHash);
    if (!isOtpValid) {
      throw new BadRequestException(
        'El código de verificación ingresado es incorrecto.',
      );
    }

    // Doble verificación: comprobar que el correo no fue registrado mientras tanto
    const existingUser = await this.userRepository.findOne({
      where: { email: payload.email },
    });
    if (existingUser) {
      throw new BadRequestException(
        'El correo electrónico ya está registrado.',
      );
    }

    // Asignar rol según el origen de la aplicación
    let role = UserRole.USER;
    if (payload.appOrigin === AppOrigin.SELLER) role = UserRole.VENDOR;
    if (payload.appOrigin === AppOrigin.BUSINESS) role = UserRole.COMPANY;

    // Crear y guardar el usuario en PostgreSQL
    const user = this.userRepository.create({
      email: payload.email,
      firstName: payload.firstName,
      lastName: payload.lastName,
      password: payload.password, // El hook BeforeInsert() se encarga de hashearlo
      role,
      phone: payload.phone,
      identification: payload.identification,
      birthDate: payload.birthDate ? new Date(payload.birthDate) : undefined,
      isActive: true,
      confirm: true,
    });

    const savedUser = await this.userRepository.save(user);

    // Cargar relaciones
    const fullUser = await this.userRepository.findOne({
      where: { id: savedUser.id },
      relations: [
        'company',
        'company.subcategory',
        'company.subcategory.category',
        'store',
      ],
    });

    const {
      confirm: _confirm,
      confirmToken: _confirmToken,
      password: _password,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      isActive: _isActive,
      ...restUser
    } = fullUser || savedUser;

    const tokens = this.getTokens(savedUser.id);

    return {
      user: restUser,
      ...tokens,
    };
  }

  async resendRegistrationOtp(dto: ResendRegistrationOtpDto) {
    let payload: any;
    try {
      payload = this.jwtService.verify(dto.registrationToken, {
        secret: envs.jwtSecret,
        ignoreExpiration: true,
      });
    } catch (error) {
      throw new BadRequestException('Token de registro inválido.');
    }

    if (payload.type !== 'REGISTRATION_OTP') {
      throw new BadRequestException('Token de registro inválido.');
    }

    // Cooldown de 60 segundos
    const now = Date.now();
    if (payload.issuedAt && now - payload.issuedAt < 60000) {
      const remainingSeconds = Math.ceil(
        (60000 - (now - payload.issuedAt)) / 1000,
      );
      throw new BadRequestException(
        `Debes esperar ${remainingSeconds} segundos antes de solicitar un nuevo código.`,
      );
    }

    // Generar nuevo código OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = bcrypt.hashSync(otp, 10);

    const updatedPayload = {
      ...payload,
      otpHash,
      issuedAt: now,
    };
    delete updatedPayload.exp;
    delete updatedPayload.iat;

    const newRegistrationToken = this.jwtService.sign(updatedPayload, {
      secret: envs.jwtSecret,
      expiresIn: '10m',
    });

    try {
      await this.mailerService.sendMail({
        to: payload.email,
        subject: 'Nuevo código de verificación de tu cuenta - Tu Lojita',
        text: `Hola ${payload.firstName},\n\nTu nuevo código de verificación para Tu Lojita es: ${otp}\n\nEste código vence en 10 minutos.\n\nTu Lojita`,
        html: getRegistrationOtpTemplate(otp, payload.firstName),
      });
    } catch (error) {
      this.logger.error(
        `Error reenviando OTP a ${payload.email}: ${(error as Error).message}`,
      );
      throw new BadRequestException(
        'No se pudo enviar el correo de verificación.',
      );
    }

    return {
      message: 'Nuevo código de verificación enviado al correo electrónico.',
      registrationToken: newRegistrationToken,
      expiresIn: 600,
    };
  }

  async createAdmin(dto: CreateAdminDto) {
    const email = dto.email.toLowerCase().trim();

    // 1. Validar unicidad del correo electrónico
    const existing = await this.userRepository.findOne({
      where: { email },
    });

    if (existing) {
      throw new BadRequestException(
        'El correo electrónico ya está registrado.',
      );
    }

    // 2. Crear el nuevo administrador
    const newAdmin = this.userRepository.create({
      email,
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      password: dto.password,
      role: UserRole.ADMIN,
      isActive: true,
      confirm: true,
    });

    const savedAdmin = await this.userRepository.save(newAdmin);
    this.logger.log(`Nuevo administrador creado exitosamente: ${email}`);

    const { password: _, ...cleanAdmin } = savedAdmin;
    return {
      message: 'Administrador creado exitosamente.',
      user: cleanAdmin,
    };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.userRepository
      .createQueryBuilder('user')
      .where('user.id = :id', { id: userId })
      .addSelect('user.password')
      .getOne();

    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado.');
    }

    if (!user.password) {
      throw new BadRequestException(
        'Esta cuenta está vinculada a Google y no utiliza contraseña.',
      );
    }

    const isCurrentValid = bcrypt.compareSync(dto.currentPassword, user.password);
    if (!isCurrentValid) {
      throw new BadRequestException('La contraseña actual es incorrecta.');
    }

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException(
        'La nueva contraseña debe ser diferente a la contraseña actual.',
      );
    }

    const hashedNewPassword = bcrypt.hashSync(dto.newPassword, 10);
    await this.userRepository.update({ id: user.id }, { password: hashedNewPassword });

    this.logger.log(`Contraseña actualizada exitosamente para usuario: ${user.email}`);

    return {
      message: 'Contraseña actualizada exitosamente.',
    };
  }

  async requestForgotPasswordOtp(dto: RequestForgotPasswordOtpDto) {
    const email = dto.email.toLowerCase().trim();

    const user = await this.userRepository
      .createQueryBuilder('user')
      .where('LOWER(user.email) = :email', { email })
      .addSelect('user.password')
      .getOne();

    // Silent/generic handling for non-existent users to prevent enumeration
    if (!user) {
      this.logger.warn(
        `Solicitud de recuperación de contraseña para correo no registrado: ${email}`,
      );
      return {
        message:
          'Si el correo electrónico está registrado, recibirás un código de recuperación.',
        expiresIn: 600,
      };
    }

    if (!user.isActive) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'ACCOUNT_BANNED',
        message:
          'Tu cuenta ha sido cancelada o suspendida. No es posible recuperar la contraseña.',
      });
    }

    if (!user.password) {
      throw new BadRequestException(
        'Esta cuenta está vinculada a Google y no utiliza contraseña. Por favor inicia sesión con Google.',
      );
    }

    // Generar código OTP numérico de 6 dígitos
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = bcrypt.hashSync(otp, 10);

    const payload = {
      type: 'PASSWORD_RESET_OTP',
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
      otpHash,
      issuedAt: Date.now(),
    };

    const recoveryToken = this.jwtService.sign(payload, {
      secret: envs.jwtSecret,
      expiresIn: '10m',
    });

    try {
      await this.mailerService.sendMail({
        to: user.email,
        subject: 'Código de recuperación de contraseña - Tu Lojita',
        text: `Hola ${user.firstName},\n\nTu código para restablecer tu contraseña en Tu Lojita es: ${otp}\n\nEste código vence en 10 minutos.\nSi no solicitaste este cambio, puedes ignorar este mensaje.\n\nTu Lojita`,
        html: getPasswordResetOtpTemplate(otp, user.firstName),
      });
    } catch (error) {
      this.logger.error(
        `Error enviando correo de recuperación a ${email}: ${(error as Error).message}`,
      );
      throw new BadRequestException(
        'No se pudo enviar el correo de recuperación. Por favor intenta más tarde.',
      );
    }

    this.logger.log(`Código de recuperación enviado exitosamente a: ${email}`);
    return {
      message: 'Código de recuperación enviado al correo electrónico.',
      recoveryToken,
      expiresIn: 600,
    };
  }

  async verifyForgotPasswordOtp(dto: VerifyForgotPasswordOtpDto) {
    let payload: any;
    try {
      payload = this.jwtService.verify(dto.recoveryToken, {
        secret: envs.jwtSecret,
      });
    } catch (error) {
      throw new BadRequestException(
        'El código o la sesión de recuperación ha expirado. Por favor solicita un nuevo código.',
      );
    }

    if (payload.type !== 'PASSWORD_RESET_OTP') {
      throw new BadRequestException('Token de recuperación inválido.');
    }

    const isOtpValid = bcrypt.compareSync(dto.otp.trim(), payload.otpHash);
    if (!isOtpValid) {
      throw new BadRequestException(
        'El código de verificación ingresado es incorrecto.',
      );
    }

    // Generar token de sesión de restablecimiento temporal (5 minutos)
    const sessionPayload = {
      type: 'PASSWORD_RESET_AUTHORIZED',
      userId: payload.userId,
      email: payload.email,
      issuedAt: Date.now(),
    };

    const resetSessionToken = this.jwtService.sign(sessionPayload, {
      secret: envs.jwtSecret,
      expiresIn: '5m',
    });

    return {
      message: 'Código verificado exitosamente.',
      resetSessionToken,
      email: payload.email,
    };
  }

  async resendForgotPasswordOtp(dto: ResendForgotPasswordOtpDto) {
    let payload: any;
    try {
      payload = this.jwtService.verify(dto.recoveryToken, {
        secret: envs.jwtSecret,
        ignoreExpiration: true,
      });
    } catch (error) {
      throw new BadRequestException('Token de recuperación inválido.');
    }

    if (payload.type !== 'PASSWORD_RESET_OTP') {
      throw new BadRequestException('Token de recuperación inválido.');
    }

    // Cooldown de 60 segundos
    const elapsed = Date.now() - (payload.issuedAt || 0);
    if (elapsed < 60000) {
      const remaining = Math.ceil((60000 - elapsed) / 1000);
      throw new BadRequestException(
        `Por favor espera ${remaining} segundos antes de solicitar un nuevo código.`,
      );
    }

    const user = await this.userRepository.findOne({
      where: { id: payload.userId },
    });

    if (!user || !user.isActive) {
      throw new BadRequestException('Usuario no válido o cuenta inactiva.');
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = bcrypt.hashSync(otp, 10);

    const newPayload = {
      type: 'PASSWORD_RESET_OTP',
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
      otpHash,
      issuedAt: Date.now(),
    };

    const newRecoveryToken = this.jwtService.sign(newPayload, {
      secret: envs.jwtSecret,
      expiresIn: '10m',
    });

    try {
      await this.mailerService.sendMail({
        to: user.email,
        subject: 'Nuevo código de recuperación de contraseña - Tu Lojita',
        text: `Hola ${user.firstName},\n\nTu nuevo código para restablecer tu contraseña en Tu Lojita es: ${otp}\n\nEste código vence en 10 minutos.\n\nTu Lojita`,
        html: getPasswordResetOtpTemplate(otp, user.firstName),
      });
    } catch (error) {
      this.logger.error(
        `Error reenviando correo de recuperación a ${user.email}: ${(error as Error).message}`,
      );
      throw new BadRequestException(
        'No se pudo reenviar el correo de recuperación.',
      );
    }

    this.logger.log(`Código de recuperación reenviado a: ${user.email}`);
    return {
      message: 'Nuevo código de recuperación enviado.',
      recoveryToken: newRecoveryToken,
      expiresIn: 600,
    };
  }

  async resetPasswordWithToken(dto: ResetForgotPasswordDto) {
    let payload: any;
    try {
      payload = this.jwtService.verify(dto.resetSessionToken, {
        secret: envs.jwtSecret,
      });
    } catch (error) {
      throw new BadRequestException(
        'La sesión de restablecimiento ha expirado. Por favor solicita un nuevo código.',
      );
    }

    if (payload.type !== 'PASSWORD_RESET_AUTHORIZED') {
      throw new BadRequestException('Token de sesión no autorizado.');
    }

    if (!dto.newPassword || dto.newPassword.length < 6) {
      throw new BadRequestException(
        'La nueva contraseña debe tener al menos 6 caracteres.',
      );
    }

    const user = await this.userRepository.findOne({
      where: { id: payload.userId },
    });

    if (!user || !user.isActive) {
      throw new BadRequestException('Usuario no encontrado o cuenta inactiva.');
    }

    const hashedNewPassword = bcrypt.hashSync(dto.newPassword, 10);
    await this.userRepository.update(
      { id: user.id },
      { password: hashedNewPassword },
    );

    this.logger.log(`Contraseña restablecida exitosamente para: ${user.email}`);

    return {
      message:
        'Contraseña restablecida exitosamente. Ya puedes iniciar sesión con tu nueva contraseña.',
    };
  }

  private getCollaboratorTokens(collaboratorId: string, tokenVersion: number) {
    const payload = {
      sub: collaboratorId,
      actorType: 'COLLABORATOR',
      tokenVersion,
    };

    return {
      accessToken: this.jwtService.sign(payload, {
        secret: envs.jwtSecret,
        expiresIn: '30d',
      }),
      refreshToken: this.jwtService.sign(payload, {
        secret: envs.jwtRefreshSecret,
        expiresIn: '90d',
      }),
    };
  }

  async loginCollaborator(loginDto: CollaboratorLoginDto) {
    const accessId = loginDto.accessId.trim();

    // 1. Rate limiting contra fuerza bruta por ID de acceso (máximo 5 intentos fallidos en 15 minutos)
    const rateRecord = this.collaboratorLoginAttempts.get(accessId);
    const now = Date.now();
    if (rateRecord && rateRecord.blockedUntil > now) {
      const waitMinutes = Math.ceil((rateRecord.blockedUntil - now) / 60000);
      throw new ForbiddenException({
        statusCode: 403,
        code: 'COLLABORATOR_RATE_LIMITED',
        message: `Demasiados intentos fallidos. Tu acceso está temporalmente bloqueado por ${waitMinutes} minuto(s).`,
      });
    }

    // 2. Buscar colaborador con contraseña
    const collaborator = await this.collaboratorRepository
      .createQueryBuilder('collab')
      .addSelect('collab.password')
      .leftJoinAndSelect('collab.company', 'company')
      .leftJoinAndSelect('collab.role', 'role')
      .leftJoinAndSelect('role.permissions', 'permissions')
      .leftJoinAndSelect('collab.stores', 'stores')
      .where('collab.accessId = :accessId', { accessId })
      .getOne();

    if (!collaborator) {
      this.recordFailedCollaboratorAttempt(accessId);
      throw new UnauthorizedException(
        'Las credenciales ingresadas no son válidas.',
      );
    }

    if (!collaborator.isActive) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'COLLABORATOR_DEACTIVATED',
        message: 'Tu cuenta de colaborador ha sido desactivada por la empresa.',
      });
    }

    const isPasswordValid = bcrypt.compareSync(
      loginDto.password,
      collaborator.password,
    );
    if (!isPasswordValid) {
      this.recordFailedCollaboratorAttempt(accessId);
      throw new UnauthorizedException(
        'Las credenciales ingresadas no son válidas.',
      );
    }

    // Éxito: limpiar intentos fallidos
    this.collaboratorLoginAttempts.delete(accessId);

    // 3. Generar tokens
    const tokens = this.getCollaboratorTokens(
      collaborator.id,
      collaborator.tokenVersion,
    );

    const permissions =
      collaborator.role?.permissions?.map((p) => p.permission) || [];
    const allowedBranchIds = collaborator.hasFullBranchAccess
      ? []
      : (collaborator.stores || []).map((s) => s.id);

    return {
      collaborator: {
        id: collaborator.id,
        accessId: collaborator.accessId,
        firstName: collaborator.firstName,
        lastName: collaborator.lastName,
        fullName: collaborator.fullName,
        identification: collaborator.identification,
        phone: collaborator.phone,
        company: {
          id: collaborator.company?.id,
          name: collaborator.company?.name,
          rif: collaborator.company?.rif,
          logo: collaborator.company?.logo,
        },
        role: {
          id: collaborator.role?.id,
          name: collaborator.role?.name,
        },
        permissions,
        hasFullBranchAccess: collaborator.hasFullBranchAccess,
        allowedBranchIds,
        stores: (collaborator.stores || []).map((s) => ({
          id: s.id,
          name: s.name,
          branchName: s.branchName,
        })),
      },
      ...tokens,
    };
  }

  private recordFailedCollaboratorAttempt(accessId: string) {
    const now = Date.now();
    const record = this.collaboratorLoginAttempts.get(accessId) || {
      attempts: 0,
      blockedUntil: 0,
    };
    record.attempts += 1;
    if (record.attempts >= 5) {
      record.blockedUntil = now + 15 * 60 * 1000; // 15 minutos de bloqueo
    }
    this.collaboratorLoginAttempts.set(accessId, record);
  }

  async changeCollaboratorPassword(
    collaboratorId: string,
    dto: ChangeCollaboratorPasswordDto,
  ) {
    const collaborator = await this.collaboratorRepository
      .createQueryBuilder('collab')
      .addSelect('collab.password')
      .where('collab.id = :id', { id: collaboratorId })
      .getOne();

    if (!collaborator || !collaborator.isActive) {
      throw new NotFoundException('Colaborador no encontrado o inactivo');
    }

    const isMatch = bcrypt.compareSync(
      dto.currentPassword,
      collaborator.password,
    );
    if (!isMatch) {
      throw new UnauthorizedException(
        'La contraseña actual ingresada es incorrecta.',
      );
    }

    collaborator.password = dto.newPassword; // Hasheado en @BeforeUpdate
    collaborator.tokenVersion += 1;
    await this.collaboratorRepository.save(collaborator);

    return {
      message: 'Contraseña actualizada exitosamente.',
    };
  }
}
