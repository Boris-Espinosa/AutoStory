import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Appointment } from './Appointment';
import { AppointmentReminder } from './AppointmentReminder';
import { User } from './User';
import { Vehicle } from './Vehicle';

export enum NotificationType {
  APPOINTMENT_REMINDER = 'APPOINTMENT_REMINDER',
  APPOINTMENT_CREATED = 'APPOINTMENT_CREATED',
  APPOINTMENT_RESCHEDULED = 'APPOINTMENT_RESCHEDULED',
  APPOINTMENT_CANCELLED = 'APPOINTMENT_CANCELLED',
}

@Entity({ name: 'notifications' })
@Index('IDX_notifications_user_created_at', ['userId', 'createdAt'])
@Index('UQ_notifications_user_reminder', ['userId', 'reminderId'], {
  unique: true,
  where: `"reminder_id" IS NOT NULL`,
})
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'varchar', length: 64 })
  userId!: string;

  @Column({
    type: 'enum',
    enum: NotificationType,
    enumName: 'notification_type',
  })
  type!: NotificationType;

  @Column({ type: 'varchar', length: 120 })
  title!: string;

  @Column({ type: 'varchar', length: 300 })
  body!: string;

  @Column({ name: 'vehicle_id', type: 'uuid', nullable: true })
  vehicleId!: string | null;

  @Column({ name: 'appointment_id', type: 'uuid', nullable: true })
  appointmentId!: string | null;

  @Column({ name: 'reminder_id', type: 'uuid', nullable: true })
  reminderId!: string | null;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @ManyToOne(() => Vehicle, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'vehicle_id' })
  vehicle!: Vehicle | null;

  @ManyToOne(() => Appointment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'appointment_id' })
  appointment!: Appointment | null;

  @ManyToOne(() => AppointmentReminder, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'reminder_id' })
  reminder!: AppointmentReminder | null;
}
