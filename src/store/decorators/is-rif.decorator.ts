import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

@ValidatorConstraint({ name: 'isRif', async: false })
export class IsRifConstraint implements ValidatorConstraintInterface {
  validate(value: any, args: ValidationArguments) {
    if (typeof value !== 'string') return false;

    // Letras válidas: V, E, J, C, P, G
    // Formato obligatorio: X-XXXXXXXX-X
    const formatRegex = /^[VEJCPGvejcpg]-\d{8}-\d$/;
    if (!formatRegex.test(value)) return false;

    // Limpiar guiones y calcular dígito verificador (Módulo 11)
    const rif = value.toUpperCase().replace(/-/g, '');
    const type = rif[0];
    const number = rif.slice(1, 9);
    const verificator = parseInt(rif[9]);

    // Valores numéricos por letra (según SENIAT / Wikipedia VE)
    const letters: Record<string, number> = {
      V: 4,
      E: 8,
      J: 12,
      C: 12, // Comuna / Consejo Comunal (añadido en 2015)
      P: 16,
      G: 20,
    };

    // Pesos de izquierda a derecha para los 8 dígitos
    const weights = [3, 2, 7, 6, 5, 4, 3, 2];

    let sum = letters[type];
    for (let i = 0; i < 8; i++) {
      sum += parseInt(number[i]) * weights[i];
    }

    const remainder = sum % 11;
    let expectedDigit = 11 - remainder;
    if (expectedDigit >= 10) expectedDigit = 0;

    return expectedDigit === verificator;
  }

  defaultMessage(args: ValidationArguments) {
    return 'El RIF debe tener el formato X-XXXXXXXX-X (ej: J-21235064-4) y ser un RIF venezolano válido';
  }
}

export function IsRif(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsRifConstraint,
    });
  };
}