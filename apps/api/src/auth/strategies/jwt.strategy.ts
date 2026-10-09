import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtPayload } from '../auth.service';
import { UserEntity } from '../../database/entities/user.entity';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_ACCESS_SECRET || 'dev_secret_change_me',
    });
  }

  async validate(payload: JwtPayload) {
    // A valid JWT proves that the token was issued by us, but it does not
    // prove that the user is still allowed to use the application. Resolve
    // the account on every guarded request so disabling/deleting a user takes
    // effect immediately instead of waiting for the access token to expire.
    const user = await this.users.findOne({ where: { id: payload.sub } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User inactive');
    }

    return {
      userId: user.id,
      email: user.email,
      role: user.role,
      mfaVerified: payload.mfaVerified,
      isSuperAdmin: !!user.isSuperAdmin,
    };
  }
}
