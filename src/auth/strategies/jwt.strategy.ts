import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { Company } from '../../company/entities/company.entity';
import { CompanyCollaborator } from '../../company/entities/company-collaborator.entity';
import { UserRole } from '../../user/types/user-role.enum';
import { envs } from '../../config/envs';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(CompanyCollaborator)
    private readonly collaboratorRepository: Repository<CompanyCollaborator>,
  ) {
    super({
      // Extrae el token del header: Authorization: Bearer <token>
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false, // Rechaza tokens expirados automáticamente
      secretOrKey: envs.jwtSecret, // Usa tu secreto del access token
      passReqToCallback: true,
    });
  }

  // Si el token es válido y no ha expirado, Passport ejecuta este método
  async validate(
    req: any,
    payload: { sub: string; actorType?: string; tokenVersion?: number },
  ) {
    // Si el token pertenece a un colaborador de empresa
    if (payload.actorType === 'COLLABORATOR') {
      const collaborator = await this.collaboratorRepository.findOne({
        where: { id: payload.sub },
        relations: [
          'company',
          'company.subcategory',
          'company.subcategory.category',
          'role',
          'role.permissions',
          'stores',
        ],
      });

      if (!collaborator) {
        throw new UnauthorizedException('Colaborador no encontrado');
      }

      if (!collaborator.isActive) {
        throw new ForbiddenException({
          statusCode: 403,
          code: 'COLLABORATOR_DEACTIVATED',
          message: 'Tu cuenta de colaborador ha sido desactivada por la empresa.',
        });
      }

      if (
        payload.tokenVersion &&
        collaborator.tokenVersion !== payload.tokenVersion
      ) {
        throw new UnauthorizedException(
          'Tu sesión ha expirado o las credenciales fueron modificadas.',
        );
      }

      const permissions =
        collaborator.role?.permissions?.map((p) => p.permission) || [];
      const allowedBranchIds = collaborator.hasFullBranchAccess
        ? []
        : (collaborator.stores || []).map((s) => s.id);

      return {
        id: collaborator.id,
        actorType: 'COLLABORATOR',
        isCollaborator: true,
        firstName: collaborator.firstName,
        lastName: collaborator.lastName,
        fullName: `${collaborator.firstName} ${collaborator.lastName}`.trim(),
        accessId: collaborator.accessId,
        identification: collaborator.identification,
        phone: collaborator.phone,
        company: collaborator.company,
        role: UserRole.COMPANY,
        collaboratorRole: collaborator.role?.name,
        permissions,
        allowedBranchIds,
        hasFullBranchAccess: collaborator.hasFullBranchAccess,
        stores: collaborator.stores || [],
      };
    }

    const user = await this.userRepository.findOne({
      where: { id: payload.sub },
      relations: [
        'company',
        'company.subcategory',
        'company.subcategory.category',
        'store',
      ],
    });

    if (!user) {
      throw new UnauthorizedException('Token no válido');
    }

    // Fallback: Si no tiene la relación directa pero es dueño de una empresa, cargarla
    if (!user.company) {
      const ownedCompany = await this.companyRepository.findOne({
        where: { owner: { id: user.id } },
        relations: ['subcategory', 'subcategory.category'],
      });
      if (ownedCompany) {
        user.company = ownedCompany;
      }
    }

    const url = req?.originalUrl || req?.url || '';
    const isAllowedSuspendedRoute =
      url.includes('/suspension-appeal') ||
      url.includes('/auth/check-status') ||
      url.includes('/auth/refresh') ||
      url.includes('/platform-settings/public');

    // Validar usuario permanentemente suspendido
    if (!user.isActive) {
      if (!isAllowedSuspendedRoute) {
        const reasonMsg = user.accountSuspensionReason
          ? ` Motivo: ${user.accountSuspensionReason}`
          : '';
        throw new ForbiddenException({
          statusCode: 403,
          code: 'ACCOUNT_BANNED',
          message: `Tu cuenta ha sido suspendida permanentemente.${reasonMsg}`,
          isPermanent: true,
          reason:
            user.accountSuspensionReason ||
            'Suspensión permanente por infracción grave de normas.',
        });
      }
    }

    // Validar suspensión temporal
    if (user.accountSuspendedUntil) {
      const now = new Date();
      if (new Date(user.accountSuspendedUntil) > now) {
        if (!isAllowedSuspendedRoute) {
          const reasonMsg = user.accountSuspensionReason
            ? ` Motivo: ${user.accountSuspensionReason}`
            : '';
          throw new ForbiddenException({
            statusCode: 403,
            code: 'ACCOUNT_SUSPENDED',
            message: `Tu cuenta ha sido suspendida temporalmente.${reasonMsg}`,
            isPermanent: false,
            suspendedUntil: user.accountSuspendedUntil,
            reason:
              user.accountSuspensionReason ||
              'Infracción de normas de la plataforma.',
          });
        }
      } else {
        // Suspensión expirada: auto-limpiar campos y actualizar caso si existe
        user.accountSuspendedUntil = null;
        user.accountSuspensionReason = null;
        if (user.currentSuspensionId) {
          await this.userRepository.query(
            `UPDATE user_suspensions SET status = 'EXPIRED' WHERE id = $1 AND status = 'ACTIVE'`,
            [user.currentSuspensionId],
          ).catch(() => {});
          user.currentSuspensionId = null;
        }
        await this.userRepository.save(user);
      }
    }

    // Lo que retornes aquí, NestJS lo inyectará en la 'Request' (req.user)
    return user;
  }
}
