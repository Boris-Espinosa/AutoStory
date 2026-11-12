import { CreateDateColumn, Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity({ name: 'users' })
export class User {
  /** Id de Clerk (formato user_...); el seed conserva "user-1" y "user-2". */
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id!: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  name!: string | null;

  @Index('UQ_users_email', { unique: true })
  @Column({ type: 'varchar', length: 255, nullable: true })
  email!: string | null;

  @Column({ name: 'image_url', type: 'varchar', length: 500, nullable: true })
  imageUrl!: string | null;

  @Column({ name: 'profile_synced_at', type: 'timestamptz', nullable: true })
  profileSyncedAt!: Date | null;

  @Column({ name: 'contact_phone', type: 'varchar', length: 32, nullable: true })
  contactPhone!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  address!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
