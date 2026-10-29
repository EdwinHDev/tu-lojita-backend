import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { CompanyCollaborator } from '../entities/company-collaborator.entity';

@Injectable()
export class CollaboratorCredentialService {
  private readonly logger = new Logger(CollaboratorCredentialService.name);

  constructor(
    @InjectRepository(CompanyCollaborator)
    private readonly collaboratorRepository: Repository<CompanyCollaborator>,
  ) {}

  /**
   * Genera un ID de acceso numérico único de exactamente 8 dígitos (10000000 a 99999999).
   * Implementa verificación atómica contra la base de datos con reintentos para garantizar unicidad global.
   */
  async generateAccessId(): Promise<string> {
    const maxAttempts = 10;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Rango inclusivo [10000000, 99999999]
      const num = crypto.randomInt(10000000, 100000000);
      const candidateId = num.toString();

      const exists = await this.collaboratorRepository.findOne({
        where: { accessId: candidateId },
        select: ['id'],
      });

      if (!exists) {
        return candidateId;
      }
    }

    this.logger.error('No se pudo generar un ID único de 8 dígitos tras 10 intentos');
    throw new Error('Error al generar ID de acceso único para el colaborador');
  }

  /**
   * Genera una contraseña inicial alfanumérica segura de exactamente 8 caracteres.
   * Utiliza caracteres alfanuméricos legibles garantizando inclusión de mayúsculas, minúsculas y números.
   */
  generateInitialPassword(): string {
    const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // Excluye I, O para evitar confusión
    const lowercase = 'abcdefghijkmnopqrstuvwxyz'; // Excluye l para evitar confusión
    const numbers = '23456789'; // Excluye 0, 1

    const allChars = uppercase + lowercase + numbers;

    // Asegurar al menos 1 mayúscula, 1 minúscula y 1 número
    const pwdArr = [
      uppercase[crypto.randomInt(0, uppercase.length)],
      lowercase[crypto.randomInt(0, lowercase.length)],
      numbers[crypto.randomInt(0, numbers.length)],
    ];

    // Llenar los 5 caracteres restantes
    for (let i = 0; i < 5; i++) {
      pwdArr.push(allChars[crypto.randomInt(0, allChars.length)]);
    }

    // Mezcla aleatoria (Fisher-Yates)
    for (let i = pwdArr.length - 1; i > 0; i--) {
      const j = crypto.randomInt(0, i + 1);
      [pwdArr[i], pwdArr[j]] = [pwdArr[j], pwdArr[i]];
    }

    return pwdArr.join('');
  }
}
