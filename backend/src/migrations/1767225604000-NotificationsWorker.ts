import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Índices parciales del trabajador de recordatorios y del contador de no
 * leídas. Van en su propia migración por si la de citas ya se ejecutó.
 */
export class NotificationsWorker1767225604000 implements MigrationInterface {
  name = 'NotificationsWorker1767225604000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_appointment_reminders_due"
      ON "appointment_reminders" ("remind_at")
      WHERE "processed_at" IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_notifications_user_unread"
      ON "notifications" ("user_id")
      WHERE "read_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_notifications_user_unread"`);
    await queryRunner.query(`DROP INDEX "IDX_appointment_reminders_due"`);
  }
}
