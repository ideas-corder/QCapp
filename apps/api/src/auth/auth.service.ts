import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { authenticator } from 'otplib';
import * as bcrypt from 'bcrypt';
import * as qrcode from 'qrcode';
import { UiLayout, UserEntity, UserRole } from '../database/entities/user.entity';

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  mfaVerified: boolean;
  /**
   * Snapshot of `users.is_super_admin` taken at token-issue time.
   * JWTs are short-lived (15m by default) so the staleness window
   * is bounded; if you promote / demote a super-admin, their next
   * login will reflect it. Mid-session promotion is intentionally
   * not supported — super-admin changes should be rare and happen
   * through the dedicated Users master.
   */
  isSuperAdmin: boolean;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly jwtService: JwtService,
  ) {}

  async register(input: {
    email: string;
    password: string;
    fullName: string;
    role?: UserRole;
  }): Promise<UserEntity> {
    const existing = await this.userRepo.findOne({ where: { email: input.email } });
    if (existing) throw new ConflictException('Email already in use');
    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = this.userRepo.create({
      email: input.email,
      passwordHash,
      fullName: input.fullName,
      role: input.role ?? 'inspector',
    });
    return this.userRepo.save(user);
  }

  async validateUser(email: string, password: string): Promise<UserEntity> {
    // Email is conventionally case-insensitive — even though users
    // are stored with the casing the admin typed at creation time,
    // sign-in should not be case-sensitive (RFC 5321 §2.4 allows
    // local-part case sensitivity but recommends treating addresses
    // as case-insensitive in practice; the seeded admin email is
    // always lowercase anyway). We lowercase here so `Admin@qc.local`
    // and `admin@qc.local` both resolve to the same row.
    const normalised = email.trim().toLowerCase();
    const user = await this.userRepo.findOne({ where: { email: normalised } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    return user;
  }

  /**
   * Step 1 of login: validate credentials.
   * If MFA is enabled AND the user's role is in MFA_REQUIRED_FOR_ROLES,
   * returns a short-lived "mfa-pending" token that is required for step 2.
   * Otherwise returns full access + refresh tokens.
   *
   * Set MFA_REQUIRED_FOR_ROLES="" (empty) to disable MFA enforcement
   * globally — even users with `mfaEnabled = true` will get a normal
   * authenticated response. This is useful for dev / demo environments.
   * The per-user `mfaEnabled` flag is still honoured for users whose role
   * IS in the list.
   */
  async loginStep1(
    email: string,
    password: string,
  ): Promise<
    | { mode: 'mfa_required'; mfaPendingToken: string }
    | { mode: 'authenticated'; accessToken: string; refreshToken: string; user: PublicUser }
  > {
    const user = await this.validateUser(email, password);

    // Global MFA gate. Parse the env list once per call (cheap), and
    // short-circuit to authenticated when the list is empty OR the
    // user's role isn't on it.
    const requiredRoles = (process.env.MFA_REQUIRED_FOR_ROLES ?? '')
      .split(',')
      .map((r) => r.trim().toLowerCase())
      .filter(Boolean);
    const mfaForcedForThisUser =
      user.mfaEnabled && requiredRoles.includes(String(user.role).toLowerCase());

    if (mfaForcedForThisUser) {
      const mfaPendingToken = await this.jwtService.signAsync(
        { sub: user.id, mfaVerified: false, stage: 'mfa-pending' },
        { expiresIn: '5m' },
      );
      return { mode: 'mfa_required', mfaPendingToken };
    }

    const tokens = await this.issueTokens(user);
    return { mode: 'authenticated', ...tokens };
  }

  /**
   * Step 2: verify TOTP code from authenticator app, then issue tokens.
   */
  async loginStep2(
    mfaPendingToken: string,
    totpCode: string,
  ): Promise<{ accessToken: string; refreshToken: string; user: PublicUser }> {
    let payload: { sub: string; mfaVerified: boolean; stage: string };
    try {
      payload = await this.jwtService.verifyAsync(mfaPendingToken);
    } catch {
      throw new UnauthorizedException('MFA session expired — please log in again');
    }
    if (payload.stage !== 'mfa-pending' || payload.mfaVerified) {
      throw new UnauthorizedException('Invalid MFA session');
    }
    const user = await this.userRepo.findOne({ where: { id: payload.sub } });
    if (!user || !user.mfaSecret) {
      throw new UnauthorizedException('MFA not configured for this user');
    }
    const ok = authenticator.check(totpCode, user.mfaSecret);
    if (!ok) throw new UnauthorizedException('Invalid authenticator code');

    return this.issueTokens(user);
  }

  async refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const user = await this.userRepo.findOne({ where: { id: payload.sub } });
    if (!user || !user.isActive) throw new UnauthorizedException('User inactive');
    return this.issueTokens(user).then(({ accessToken, refreshToken: rt }) => ({
      accessToken,
      refreshToken: rt,
    }));
  }

  /**
   * Begin MFA enrollment: generates secret + QR data URL.
   * Caller must verify with a code before we persist `mfa_enabled = true`.
   */
  async beginMfaEnrollment(userId: string): Promise<{ secret: string; otpauthUrl: string; qrDataUrl: string }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    const secret = authenticator.generateSecret();
    const issuer = process.env.MFA_ISSUER || 'QC Inspector';
    const otpauthUrl = authenticator.keyuri(user.email, issuer, secret);
    const qrDataUrl = await qrcode.toDataURL(otpauthUrl);
    // Persist the secret but mark MFA as not-yet-enabled until verified
    await this.userRepo.update(userId, { mfaSecret: secret, mfaEnabled: false });
    return { secret, otpauthUrl, qrDataUrl };
  }

  async confirmMfaEnrollment(userId: string, totpCode: string): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user || !user.mfaSecret) throw new UnauthorizedException('No MFA secret to verify');
    const ok = authenticator.check(totpCode, user.mfaSecret);
    if (!ok) throw new UnauthorizedException('Invalid authenticator code');
    await this.userRepo.update(userId, { mfaEnabled: true });
  }

  /**
   * Read the current user's UI preferences. Used by the web app to pick the
   * New Inspection form layout on SSR.
   */
  async getPreferences(userId: string): Promise<{ uiLayout: UiLayout }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    return { uiLayout: user.uiLayout ?? 'modern' };
  }

  /**
   * Persist UI preferences. Only fields present in the input are updated.
   * Returns the freshly saved values so the client can update its UI in one
   * round-trip.
   */
  async updatePreferences(
    userId: string,
    patch: { uiLayout?: UiLayout },
  ): Promise<{ uiLayout: UiLayout }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    const next: Partial<UserEntity> = {};
    if (patch.uiLayout !== undefined) next.uiLayout = patch.uiLayout;
    if (Object.keys(next).length > 0) {
      await this.userRepo.update(userId, next);
    }
    return { uiLayout: patch.uiLayout ?? user.uiLayout ?? 'modern' };
  }

  private async issueTokens(
    user: UserEntity,
  ): Promise<{ accessToken: string; refreshToken: string; user: PublicUser }> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      mfaVerified: !user.mfaEnabled || true,
      isSuperAdmin: !!user.isSuperAdmin,
    };
    const accessToken = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_ACCESS_SECRET,
      expiresIn: process.env.JWT_ACCESS_TTL || '15m',
    });
    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: process.env.JWT_REFRESH_TTL || '7d',
    });
    await this.userRepo.update(user.id, { lastLoginAt: new Date() });
    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        mfaEnabled: user.mfaEnabled,
        uiLayout: user.uiLayout ?? 'modern',
        isSuperAdmin: !!user.isSuperAdmin,
      },
    };
  }
}

export interface PublicUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  mfaEnabled: boolean;
  uiLayout: UiLayout;
  isSuperAdmin: boolean;
}
