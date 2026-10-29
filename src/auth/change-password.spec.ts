import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import * as bcrypt from 'bcrypt';

describe('AuthService - changePassword', () => {
  let authService: AuthService;
  let mockUserRepository: any;
  let mockJwtService: any;
  let mockMailerService: any;

  beforeEach(() => {
    mockUserRepository = {
      createQueryBuilder: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    mockJwtService = {};
    mockMailerService = {};

    authService = new AuthService(
      mockUserRepository,
      mockJwtService,
      mockMailerService,
    );
  });

  it('should successfully change password for credential user', async () => {
    const currentHash = bcrypt.hashSync('oldPassword123', 10);
    const mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      password: currentHash,
    };

    const mockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(mockUser),
    };
    mockUserRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

    const result = await authService.changePassword('user-123', {
      currentPassword: 'oldPassword123',
      newPassword: 'newPassword456',
    });

    expect(result).toEqual({ message: 'Contraseña actualizada exitosamente.' });
    expect(mockUserRepository.update).toHaveBeenCalledWith(
      { id: 'user-123' },
      expect.objectContaining({
        password: expect.any(String),
      }),
    );
  });

  it('should reject when user is not found', async () => {
    const mockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    };
    mockUserRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

    await expect(
      authService.changePassword('user-none', {
        currentPassword: 'oldPassword123',
        newPassword: 'newPassword456',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should reject OAuth accounts with no password', async () => {
    const mockUser = {
      id: 'oauth-user',
      email: 'oauth@gmail.com',
      password: null, // OAuth account
    };

    const mockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(mockUser),
    };
    mockUserRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

    await expect(
      authService.changePassword('oauth-user', {
        currentPassword: 'anyPassword',
        newPassword: 'newPassword123',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should reject when current password is wrong', async () => {
    const currentHash = bcrypt.hashSync('correctPass123', 10);
    const mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      password: currentHash,
    };

    const mockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(mockUser),
    };
    mockUserRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

    await expect(
      authService.changePassword('user-123', {
        currentPassword: 'wrongPassword',
        newPassword: 'newPassword456',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should reject when new password is the same as current password', async () => {
    const currentHash = bcrypt.hashSync('samePass123', 10);
    const mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      password: currentHash,
    };

    const mockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(mockUser),
    };
    mockUserRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

    await expect(
      authService.changePassword('user-123', {
        currentPassword: 'samePass123',
        newPassword: 'samePass123',
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
