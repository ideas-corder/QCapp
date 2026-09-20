import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  ConfirmMfaDto,
  LoginDto,
  RefreshDto,
  RegisterDto,
  UpdatePreferencesDto,
  VerifyMfaDto,
} from './dto/auth.dto';
import { CurrentUser, AuthUser, JwtAuthGuard } from './guards/roles.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(201)
  async register(@Body() dto: RegisterDto) {
    const user = await this.authService.register(dto);
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    };
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto) {
    return this.authService.loginStep1(dto.email, dto.password);
  }

  @Post('login/mfa')
  @HttpCode(200)
  async loginMfa(@Body() dto: VerifyMfaDto) {
    return this.authService.loginStep2(dto.mfaPendingToken, dto.totpCode);
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return user;
  }

  @UseGuards(JwtAuthGuard)
  @Post('mfa/enroll')
  async enrollMfa(@CurrentUser() user: AuthUser) {
    return this.authService.beginMfaEnrollment(user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('mfa/confirm')
  @HttpCode(200)
  async confirmMfa(
    @CurrentUser() user: AuthUser,
    @Body() dto: ConfirmMfaDto,
  ) {
    await this.authService.confirmMfaEnrollment(user.userId, dto.totpCode);
    return { mfaEnabled: true };
  }

  /**
   * Get the current user's UI preferences (currently just the New
   * Inspection form layout).
   */
  @UseGuards(JwtAuthGuard)
  @Get('preferences')
  async getPreferences(@CurrentUser() user: AuthUser) {
    return this.authService.getPreferences(user.userId);
  }

  /**
   * Update one or more UI preferences. Accepts a partial body so the
   * client can patch a single field without re-sending everything.
   */
  @UseGuards(JwtAuthGuard)
  @Put('preferences')
  @HttpCode(200)
  async updatePreferences(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdatePreferencesDto,
  ) {
    return this.authService.updatePreferences(user.userId, {
      uiLayout: dto.uiLayout,
    });
  }
}
