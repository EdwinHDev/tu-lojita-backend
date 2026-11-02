import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { CompanyCollaborator } from '../../company/entities/company-collaborator.entity';
import { envs } from '../../config/envs';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(CompanyCollaborator)
    private readonly collaboratorRepository: Repository<CompanyCollaborator>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: envs.jwtRefreshSecret, // <-- IMPORTANTE: Usa el secreto de Refresh
    });
  }

  async validate(payload: {
    sub: string;
    actorType?: string;
    tokenVersion?: number;
  }) {
    if (payload.actorType === 'COLLABORATOR') {
      const collaborator = await this.collaboratorRepository.findOne({
        where: { id: payload.sub },
        relations: ['company'],
      });

      if (!collaborator || !collaborator.isActive) {
        throw new UnauthorizedException('Token de refresh no válido');
      }

      if (
        payload.tokenVersion &&
        collaborator.tokenVersion !== payload.tokenVersion
      ) {
        throw new UnauthorizedException('Sesión de colaborador expirada');
      }

      return {
        id: collaborator.id,
        actorType: 'COLLABORATOR',
        isCollaborator: true,
        tokenVersion: collaborator.tokenVersion,
        company: collaborator.company,
      };
    }

    const user = await this.userRepository.findOneBy({ id: payload.sub });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Token de refresh no válido');
    }

    return user;
  }
}
