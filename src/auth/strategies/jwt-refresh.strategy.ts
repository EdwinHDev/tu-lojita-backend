import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { envs } from '../../config/envs';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: envs.jwtRefreshSecret, // <-- IMPORTANTE: Usa el secreto de Refresh
    });
  }

  async validate(payload: { sub: string }) {
    const user = await this.userRepository.findOneBy({ id: payload.sub });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Token de refresh no válido');
    }

    return user;
  }
}