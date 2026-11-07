import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './User';

/**
 * Taller personal de un usuario. El nombre único por usuario (sin distinguir
 * mayúsculas) se crea con SQL en la migración: TypeORM no expresa
 * índices sobre expresiones con decoradores.
 */
@Entity({ name: 'workshops' })
export class Workshop {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  address!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  phone!: string | null;

  /** Valoración personal de 1 a 5; el CHECK vive en la base de datos. */
  @Column({ type: 'smallint', nullable: true })
  rating!: number | null;

  @Column({ name: 'created_by_user_id', type: 'varchar', length: 64 })
  createdByUserId!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'created_by_user_id' })
  createdBy!: User;
}
