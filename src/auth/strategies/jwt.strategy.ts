import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { envs } from '../../config/envs';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
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
    const user = await this.userRepository.findOneBy({ id: payload.sub });

    if (!user) {
      throw new UnauthorizedException('Token no válido');
    }

    // Validar que el usuario no haya sido baneado o eliminado (Práctica Robusta)
    if (!user.isActive) {
      throw new UnauthorizedException('El usuario está inactivo, hable con el administrador');
    }

    // Lo que retornes aquí, NestJS lo inyectará en la 'Request' (req.user)
    return user;
  }
}