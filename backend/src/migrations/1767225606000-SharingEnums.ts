import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Valores nuevos de los enums de compartir. ALTER TYPE ... ADD VALUE va
 * fuera de transacción: PG 11 lo exige y PG 12+ no permite usar el valor
 * nuevo hasta el commit.
 */
export class SharingEnums1767225606000 implements MigrationInterface {
  name = 'SharingEnums1767225606000';

  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "sharing_request_status" ADD VALUE 'CANCELLED'`,
    );
    await queryRunner.query(
      `ALTER TYPE "notification_type" ADD VALUE 'SHARING_REQUEST_RECEIVED'`,
    );
    await queryRunner.query(
      `ALTER TYPE "notification_type" ADD VALUE 'SHARING_REQUEST_ACCEPTED'`,
    );
    await queryRunner.query(
      `ALTER TYPE "notification_type" ADD VALUE 'SHARING_REQUEST_REJECTED'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL no permite quitar valores de un enum: se reconstruye el tipo.
    // CANCELLED → REJECTED y los tipos de compartir → APPOINTMENT_CREATED /
    // APPOINTMENT_CANCELLED: pérdida semántica irreversible.
    await queryRunner.query(
      `ALTER TABLE "sharing_requests" ALTER COLUMN "status" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TYPE "sharing_request_status" RENAME TO "sharing_request_status_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "sharing_request_status" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED')`,
    );
    await queryRunner.query(`
      ALTER TABLE "sharing_requests"
      ALTER COLUMN "status" TYPE "sharing_request_status"
      USING (CASE "status"::text
        WHEN 'CANCELLED' THEN 'REJECTED'
        ELSE "status"::text
      END)::"sharing_request_status"
    `);
    await queryRunner.query(
      `ALTER TABLE "sharing_requests" ALTER COLUMN "status" SET DEFAULT 'PENDING'`,
    );
    await queryRunner.query(`DROP TYPE "sharing_request_status_old"`);

    await queryRunner.query(
      `ALTER TYPE "notification_type" RENAME TO "notification_type_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "notification_type" AS ENUM ('APPOINTMENT_REMINDER', 'APPOINTMENT_CREATED', 'APPOINTMENT_RESCHEDULED', 'APPOINTMENT_CANCELLED')`,
    );
    await queryRunner.query(`
      ALTER TABLE "notifications"
      ALTER COLUMN "type" TYPE "notification_type"
      USING (CASE "type"::text
        WHEN 'SHARING_REQUEST_RECEIVED' THEN 'APPOINTMENT_CREATED'
        WHEN 'SHARING_REQUEST_ACCEPTED' THEN 'APPOINTMENT_CREATED'
        WHEN 'SHARING_REQUEST_REJECTED' THEN 'APPOINTMENT_CANCELLED'
        ELSE "type"::text
      END)::"notification_type"
    `);
    await queryRunner.query(`DROP TYPE "notification_type_old"`);
  }
}
