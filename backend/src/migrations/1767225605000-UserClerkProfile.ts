import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Perfil local del usuario de Clerk. Solo agrega columnas: los usuarios
 * existentes (user-1 y user-2) se conservan sin cambios.
 */
export class UserClerkProfile1767225605000 implements MigrationInterface {
  name = 'UserClerkProfile1767225605000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "image_url" character varying(500)`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "profile_synced_at" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "profile_synced_at"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "image_url"`);
  }
}
