import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Módulo de citas: cita, recordatorios y notificaciones. También vincula una
 * mantención con la cita que la originó.
 */
export class AppointmentsModule1767225603000 implements MigrationInterface {
  name = 'AppointmentsModule1767225603000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "appointment_status" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "notification_type" AS ENUM ('APPOINTMENT_REMINDER', 'APPOINTMENT_CREATED', 'APPOINTMENT_RESCHEDULED', 'APPOINTMENT_CANCELLED')`,
    );

    await queryRunner.query(`
      CREATE TABLE "appointments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "vehicle_id" uuid NOT NULL,
        "workshop_id" uuid,
        "created_by_user_id" character varying(64),
        "scheduled_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "timezone" character varying(64) NOT NULL DEFAULT 'America/Santiago',
        "reason" character varying(200) NOT NULL,
        "notes" character varying(1000),
        "status" "appointment_status" NOT NULL DEFAULT 'SCHEDULED',
        "completed_at" TIMESTAMP WITH TIME ZONE,
        "cancelled_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_appointments" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_appointments_reason"
          CHECK (char_length("reason") BETWEEN 3 AND 200)
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "appointments"
      ADD CONSTRAINT "FK_appointments_vehicle"
      FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id")
      ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "appointments"
      ADD CONSTRAINT "FK_appointments_workshop"
      FOREIGN KEY ("workshop_id") REFERENCES "workshops"("id")
      ON DELETE SET NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "appointments"
      ADD CONSTRAINT "FK_appointments_created_by"
      FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
      ON DELETE SET NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_appointments_vehicle_scheduled_at"
      ON "appointments" ("vehicle_id", "scheduled_at")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_appointments_status_scheduled_at"
      ON "appointments" ("status", "scheduled_at")
    `);

    await queryRunner.query(`
      CREATE TABLE "appointment_reminders" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "appointment_id" uuid NOT NULL,
        "offset_minutes" integer NOT NULL,
        "remind_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "processed_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_appointment_reminders" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_appointment_reminders_offset"
          CHECK ("offset_minutes" IN (10080, 1440, 120, 30))
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "appointment_reminders"
      ADD CONSTRAINT "FK_appointment_reminders_appointment"
      FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id")
      ON DELETE CASCADE
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_appointment_reminders_appointment_offset"
      ON "appointment_reminders" ("appointment_id", "offset_minutes")
    `);

    await queryRunner.query(`
      CREATE TABLE "notifications" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" character varying(64) NOT NULL,
        "type" "notification_type" NOT NULL,
        "title" character varying(120) NOT NULL,
        "body" character varying(300) NOT NULL,
        "vehicle_id" uuid,
        "appointment_id" uuid,
        "reminder_id" uuid,
        "read_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notifications" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "notifications"
      ADD CONSTRAINT "FK_notifications_user"
      FOREIGN KEY ("user_id") REFERENCES "users"("id")
      ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "notifications"
      ADD CONSTRAINT "FK_notifications_vehicle"
      FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id")
      ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "notifications"
      ADD CONSTRAINT "FK_notifications_appointment"
      FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id")
      ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "notifications"
      ADD CONSTRAINT "FK_notifications_reminder"
      FOREIGN KEY ("reminder_id") REFERENCES "appointment_reminders"("id")
      ON DELETE SET NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_notifications_user_created_at"
      ON "notifications" ("user_id", "created_at")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_notifications_user_reminder"
      ON "notifications" ("user_id", "reminder_id")
      WHERE "reminder_id" IS NOT NULL
    `);

    await queryRunner.query(
      `ALTER TABLE "maintenances" ADD "appointment_id" uuid`,
    );
    await queryRunner.query(`
      ALTER TABLE "maintenances"
      ADD CONSTRAINT "FK_maintenances_appointment"
      FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id")
      ON DELETE SET NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_maintenances_appointment"
      ON "maintenances" ("appointment_id")
      WHERE "appointment_id" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "UQ_maintenances_appointment"`);
    await queryRunner.query(
      `ALTER TABLE "maintenances" DROP CONSTRAINT "FK_maintenances_appointment"`,
    );
    await queryRunner.query(
      `ALTER TABLE "maintenances" DROP COLUMN "appointment_id"`,
    );

    await queryRunner.query(`DROP TABLE "notifications"`);
    await queryRunner.query(`DROP TABLE "appointment_reminders"`);
    await queryRunner.query(`DROP TABLE "appointments"`);
    await queryRunner.query(`DROP TYPE "notification_type"`);
    await queryRunner.query(`DROP TYPE "appointment_status"`);
  }
}
