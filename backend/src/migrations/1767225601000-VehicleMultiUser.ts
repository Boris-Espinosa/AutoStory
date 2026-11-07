import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Modelo multi-usuario: el VIN es opcional y ni la patente ni el VIN son
 * únicos. No hay verificación de propiedad en el esquema.
 */
export class VehicleMultiUser1767225601000 implements MigrationInterface {
  name = 'VehicleMultiUser1767225601000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_vehicles_vin"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_vehicles_license_plate"`,
    );
    await queryRunner.query(
      `ALTER TABLE "vehicles" ALTER COLUMN "vin" DROP NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_vehicles_vin" ON "vehicles" ("vin")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_vehicles_license_plate" ON "vehicles" ("license_plate")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // El rollback puede fallar con datos nuevos: la unicidad global no se
    // restaura si hay patentes o VIN repetidos, y el VIN obligatorio no se
    // restaura si hay vehículos sin VIN.
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_vehicles_vin"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_vehicles_license_plate"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_vehicles_vin" ON "vehicles" ("vin")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_vehicles_license_plate" ON "vehicles" ("license_plate")`,
    );
    await queryRunner.query(
      `ALTER TABLE "vehicles" ALTER COLUMN "vin" SET NOT NULL`,
    );
  }
}
