import {
  registerDecorator,
  ValidationOptions,
} from 'class-validator';

/**
 * Reject numbers that have more decimal places than `max`.
 *
 * Used to enforce the "max 2 decimal places" rule on the API side so a
 * malformed client cannot smuggle e.g. 1.2345 into a NUMERIC(14,2) column.
 *
 * Usage:
 *   @IsNumber()
 *   @Min(0)
 *   @MaxDecimalPlaces(2)
 *   orderQuantity!: number;
 */
export function MaxDecimalPlaces(
  max: number,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'MaxDecimalPlaces',
      target: object.constructor,
      propertyName,
      constraints: [max],
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (value === null || value === undefined) return true;
          if (typeof value !== 'number' || !Number.isFinite(value)) return false;
          // n dp is allowed when max === n (0.1, 0.10, 0.100 all OK for max=2).
          const factor = Math.pow(10, max);
          return Math.round(value * factor) === value * factor;
        },
        defaultMessage() {
          return `${propertyName} may have at most ${max} decimal places`;
        },
      },
    });
  };
}