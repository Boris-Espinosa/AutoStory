import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1767225600000 implements MigrationInterface {
  name = 'InitialSchema1767225600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "user_vehicle_role" AS ENUM ('OWNER', 'GUEST')`,
    );
    await queryRunner.query(
      `CREATE TYPE "sharing_request_status" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "part_category" AS ENUM ('Encendido', 'Motor', 'Frenos', 'Suspensión', 'Transmisión', 'Eléctrico', 'Neumáticos', 'Filtros y lubricantes', 'Carrocería', 'Otro')`,
    );

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" character varying(64) NOT NULL,
        "name" character varying(120),
        "email" character varying(255),
        "contact_phone" character varying(32),
        "address" character varying(255),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_users" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_users_email" ON "users" ("email")`,
    );

    await queryRunner.query(`
      CREATE TABLE "vehicles" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "vin" character varying(17) NOT NULL,
        "license_plate" character varying(16) NOT NULL,
        "brand" character varying(80) NOT NULL,
        "model" character varying(80) NOT NULL,
        "year" integer NOT NULL,
        "current_mileage" integer NOT NULL,
        "photo_url" character varying(512),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_vehicles" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_vehicles_vin" ON "vehicles" ("vin")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_vehicles_license_plate" ON "vehicles" ("license_plate")`,
    );

    await queryRunner.query(`
      CREATE TABLE "user_vehicles" (
        "user_id" character varying(64) NOT NULL,
        "vehicle_id" uuid NOT NULL,
        "role" "user_vehicle_role" NOT NULL,
        "assigned_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_vehicles" PRIMARY KEY ("user_id", "vehicle_id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "user_vehicles"
      ADD CONSTRAINT "FK_user_vehicles_user"
      FOREIGN KEY ("user_id") REFERENCES "users"("id")
      ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "user_vehicles"
      ADD CONSTRAINT "FK_user_vehicles_vehicle"
      FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id")
      ON DELETE CASCADE
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_user_vehicles_owner" ON "user_vehicles" ("vehicle_id") WHERE "role" = 'OWNER'`,
    );

    await queryRunner.query(`
      CREATE TABLE "sharing_requests" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "vehicle_id" uuid NOT NULL,
        "sender_user_id" character varying(64) NOT NULL,
        "receiver_user_id" character varying(64) NOT NULL,
        "status" "sharing_request_status" NOT NULL DEFAULT 'PENDING',
        "sent_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "responded_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_sharing_requests" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_sharing_requests_distinct_users"
          CHECK ("sender_user_id" <> "receiver_user_id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "sharing_requests"
      ADD CONSTRAINT "FK_sharing_requests_vehicle"
      FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id")
      ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "sharing_requests"
      ADD CONSTRAINT "FK_sharing_requests_sender"
      FOREIGN KEY ("sender_user_id") REFERENCES "users"("id")
      ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "sharing_requests"
      ADD CONSTRAINT "FK_sharing_requests_receiver"
      FOREIGN KEY ("receiver_user_id") REFERENCES "users"("id")
      ON DELETE RESTRICT
    `);

    await queryRunner.query(`
      CREATE TABLE "maintenances" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "vehicle_id" uuid NOT NULL,
        "registered_by_user_id" character varying(64),
        "description" character varying(255) NOT NULL,
        "date" character varying(10) NOT NULL,
        "cost" integer NOT NULL,
        CONSTRAINT "PK_maintenances" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_maintenances_vehicle_id" ON "maintenances" ("vehicle_id")`,
    );
    await queryRunner.query(`
      ALTER TABLE "maintenances"
      ADD CONSTRAINT "FK_maintenances_vehicle"
      FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id")
      ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "maintenances"
      ADD CONSTRAINT "FK_maintenances_registered_by"
      FOREIGN KEY ("registered_by_user_id") REFERENCES "users"("id")
      ON DELETE SET NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "parts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "vehicle_id" uuid NOT NULL,
        "maintenance_id" uuid,
        "name" character varying(120) NOT NULL,
        "category" "part_category" NOT NULL,
        "cost" integer NOT NULL,
        "purchase_date" character varying(10) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_parts" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_parts_vehicle_id" ON "parts" ("vehicle_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_parts_maintenance_id" ON "parts" ("maintenance_id")`,
    );
    await queryRunner.query(`
      ALTER TABLE "parts"
      ADD CONSTRAINT "FK_parts_vehicle"
      FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id")
      ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "parts"
      ADD CONSTRAINT "FK_parts_maintenance"
      FOREIGN KEY ("maintenance_id") REFERENCES "maintenances"("id")
      ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "parts"`);
    await queryRunner.query(`DROP TABLE "maintenances"`);
    await queryRunner.query(`DROP TABLE "sharing_requests"`);
    await queryRunner.query(`DROP TABLE "user_vehicles"`);
    await queryRunner.query(`DROP TABLE "vehicles"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "part_category"`);
    await queryRunner.query(`DROP TYPE "sharing_request_status"`);
    await queryRunner.query(`DROP TYPE "user_vehicle_role"`);
  }
}
