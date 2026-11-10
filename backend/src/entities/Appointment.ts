import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './User';
import { Vehicle } from './Vehicle';
import { Workshop } from './Workshop';

export enum AppointmentStatus {
  SCHEDULED = 'SCHEDULED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

@Entity({ name: 'appointments' })
@Index('IDX_appointments_vehicle_scheduled_at', ['vehicleId', 'scheduledAt'])
@Index('IDX_appointments_status_scheduled_at', ['status', 'scheduledAt'])
export class Appointment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'vehicle_id', type: 'uuid' })
  vehicleId!: string;

  @Column({ name: 'workshop_id', type: 'uuid', nullable: true })
  workshopId!: string | null;

  @Column({
    name: 'created_by_user_id',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  createdByUserId!: string | null;

  /** Instante UTC. La zona IANA se guarda aparte y solo se usa para mostrar. */
  @Column({ name: 'scheduled_at', type: 'timestamptz' })
  scheduledAt!: Date;

  @Column({ type: 'varchar', length: 64, default: 'America/Santiago' })
  timezone!: string;

  @Column({ type: 'varchar', length: 200 })
  reason!: string;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  notes!: string | null;

  @Column({
    type: 'enum',
    enum: AppointmentStatus,
    enumName: 'appointment_status',
    default: AppointmentStatus.SCHEDULED,
  })
  status!: AppointmentStatus;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne(() => Vehicle, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'vehicle_id' })
  vehicle!: Vehicle;

  @ManyToOne(() => Workshop, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'workshop_id' })
  workshop!: Workshop | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_user_id' })
  createdBy!: User | null;
}
