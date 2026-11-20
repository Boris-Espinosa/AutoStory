import { createPartSchema } from '../../schemas/part.schema';

const validPart = {
  vehicleId: '123e4567-e89b-12d3-a456-426614174000',
  name: 'Filtro de aceite',
  category: 'Filtros y lubricantes',
  cost: 1000,
  purchaseDate: '2025-01-15',
};

describe('createPartSchema', () => {
  it('acepta el costo máximo de un int de Postgres', () => {
    expect(
      createPartSchema.parse({ ...validPart, cost: 2_147_483_647 }).cost,
    ).toBe(2_147_483_647);
  });

  it('rechaza un costo mayor que un int de Postgres', () => {
    expect(() =>
      createPartSchema.parse({ ...validPart, cost: 2_147_483_648 }),
    ).toThrow('El costo no puede superar 2.147.483.647.');
  });
});
