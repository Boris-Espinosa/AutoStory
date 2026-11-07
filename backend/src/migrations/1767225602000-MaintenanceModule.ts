import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Módulo de mantenciones: agrega talleres personales y completa
 * MANTENCION_REPARACION. Conserva las mantenciones existentes: la fecha pasa
 * de texto a date, el kilometraje se rellena con el kilometraje actual del
 * vehículo y la mano de obra parte en 0. La columna "cost" anterior (costo
 * total declarado) no existe en el modelo nuevo, así que se elimina.
 */
export class MaintenanceModule1767225602000 implements MigrationInterface {
  name = 'MaintenanceModule1767225602000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "workshops" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" character varying(100) NOT NULL,
        "address" character varying(255),
        "phone" character varying(32),
        "rating" smallint,
        "created_by_user_id" character varying(64) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_workshops" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_workshops_rating"
          CHECK ("rating" IS NULL OR "rating" BETWEEN 1 AND 5)
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "workshops"
      ADD CONSTRAINT "FK_workshops_created_by"
      FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
      ON DELETE CASCADE
    `);
    // Nombre único por usuario sin distinguir mayúsculas.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_workshops_user_name"
      ON "workshops" ("created_by_user_id", lower("name"))
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_workshops_created_by_user_id"
      ON "workshops" ("created_by_user_id")
    `);

    await queryRunner.query(
      `ALTER TABLE "maintenances" ADD "service_mileage" integer`,
    );
    await queryRunner.query(`
      UPDATE "maintenances" AS m
      SET "service_mileage" = v."current_mileage"
      FROM "vehicles" AS v
      WHERE v."id" = m."vehicle_id"
    `);
    await queryRunner.query(
      `ALTER TABLE "maintenances" ALTER COLUMN "service_mileage" SET NOT NULL`,
    );
    await queryRunner.query(`
      ALTER TABLE "maintenances"
      ADD CONSTRAINT "CHK_maintenances_service_mileage"
      CHECK ("service_mileage" >= 0)
    `);

    await queryRunner.query(
      `ALTER TABLE "maintenances" ADD "labor_cost" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(`
      ALTER TABLE "maintenances"
      ADD CONSTRAINT "CHK_maintenances_labor_cost" CHECK ("labor_cost" >= 0)
    `);
    await queryRunner.query(
      `ALTER TABLE "maintenances" ADD "diagnosis" character varying(1000)`,
    );
    await queryRunner.query(
      `ALTER TABLE "maintenances" ADD "workshop_id" uuid`,
    );
    await queryRunner.query(`
      ALTER TABLE "maintenances"
      ADD CONSTRAINT "FK_maintenances_workshop"
      FOREIGN KEY ("workshop_id") REFERENCES "workshops"("id")
      ON DELETE SET NULL
    `);
    await queryRunner.query(
      `ALTER TABLE "maintenances" ADD "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`,
    );

    await queryRunner.query(
      `ALTER TABLE "maintenances" RENAME COLUMN "date" TO "service_date"`,
    );
    await queryRunner.query(`
      ALTER TABLE "maintenances"
      ALTER COLUMN "service_date" TYPE date USING "service_date"::date
    `);
    await queryRunner.query(
      `ALTER TABLE "maintenances" ALTER COLUMN "description" TYPE character varying(500)`,
    );
    await queryRunner.query(
      `ALTER TABLE "maintenances" DROP COLUMN "cost"`,
    );

    await queryRunner.query(`DROP INDEX "IDX_maintenances_vehicle_id"`);
    await queryRunner.query(`
      CREATE INDEX "IDX_maintenances_vehicle_service_date"
      ON "maintenances" ("vehicle_id", "service_date" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "IDX_maintenances_vehicle_service_date"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_maintenances_vehicle_id" ON "maintenances" ("vehicle_id")`,
    );

    // El costo total anterior no se puede reconstruir: se usa la mano de obra.
    await queryRunner.query(
      `ALTER TABLE "maintenances" ADD "cost" integer`,
    );
    await queryRunner.query(
      `UPDATE "maintenances" SET "cost" = "labor_cost"`,
    );
    await queryRunner.query(
      `ALTER TABLE "maintenances" ALTER COLUMN "cost" SET NOT NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "maintenances" RENAME COLUMN "service_date" TO "date"`,
    );
    await queryRunner.query(`
      ALTER TABLE "maintenances"
      ALTER COLUMN "date" TYPE character varying(10)
      USING to_char("date", 'YYYY-MM-DD')
    `);
    // Puede fallar si alguna descripción nueva supera los 255 caracteres.
    await queryRunner.query(
      `ALTER TABLE "maintenances" ALTER COLUMN "description" TYPE character varying(255)`,
    );

    await queryRunner.query(
      `ALTER TABLE "maintenances" DROP CONSTRAINT "CHK_maintenances_service_mileage"`,
    );
    await queryRunner.query(
      `ALTER TABLE "maintenances" DROP CONSTRAINT "CHK_maintenances_labor_cost"`,
    );
    await queryRunner.query(
      `ALTER TABLE "maintenances" DROP CONSTRAINT "FK_maintenances_workshop"`,
    );
    await queryRunner.query(
      `ALTER TABLE "maintenances" DROP COLUMN "service_mileage"`,
    );
    await queryRunner.query(
      `ALTER TABLE "maintenances" DROP COLUMN "labor_cost"`,
    );
    await queryRunner.query(
      `ALTER TABLE "maintenances" DROP COLUMN "diagnosis"`,
    );
    await queryRunner.query(
      `ALTER TABLE "maintenances" DROP COLUMN "workshop_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "maintenances" DROP COLUMN "created_at"`,
    );

    await queryRunner.query(`DROP TABLE "workshops"`);
  }
}
