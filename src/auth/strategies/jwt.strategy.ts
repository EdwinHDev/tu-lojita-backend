import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { Company } from '../../company/entities/company.entity';
import { envs } from '../../config/envs';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
  ) {
    super({
      // Extrae el token del header: Authorization: Bearer <token>
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false, // Rechaza tokens expirados automáticamente
      secretOrKey: envs.jwtSecret, // Usa tu secreto del access token
    });
  }

  // Si el token es válido y no ha expirado, Passport ejecuta este método
  async validate(payload: { sub: string }) {
    const user = await this.userRepository.findOne({
      where: { id: payload.sub },
      relations: ['company', 'store'],
    });

    if (!user) {
      throw new UnauthorizedException('Token no válido');
    }

    // Fallback: Si no tiene la relación directa pero es dueño de una empresa, cargarla
    if (!user.company) {
      const ownedCompany = await this.companyRepository.findOne({
        where: { owner: { id: user.id } }
      });
      if (ownedCompany) {
        user.company = ownedCompany;
      }
    }

    // Validar que el usuario no haya sido baneado o eliminado (Práctica Robusta)
    if (!user.isActive) {
      throw new UnauthorizedException('El usuario está inactivo, hable con el administrador');
    }

    // Lo que retornes aquí, NestJS lo inyectará en la 'Request' (req.user)
    return user;
  }
}