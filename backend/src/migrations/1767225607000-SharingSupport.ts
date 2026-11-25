import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Soporte de compartir: vínculo opcional de notificaciones con la solicitud
 * que las originó e índice parcial de una PENDING por vehículo y receptor.
 */
export class SharingSupport1767225607000 implements MigrationInterface {
  name = 'SharingSupport1767225607000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "notifications"
      ADD COLUMN "sharing_request_id" uuid NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "notifications"
      ADD CONSTRAINT "FK_notifications_sharing_request"
      FOREIGN KEY ("sharing_request_id") REFERENCES "sharing_requests"("id")
      ON DELETE CASCADE
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_sharing_requests_pending"
      ON "sharing_requests" ("vehicle_id", "receiver_user_id")
      WHERE "status" = 'PENDING'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "UQ_sharing_requests_pending"`);
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP CONSTRAINT "FK_notifications_sharing_request"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP COLUMN "sharing_request_id"`,
    );
  }
}
