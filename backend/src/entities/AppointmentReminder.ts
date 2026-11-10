import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Appointment } from './Appointment';

@Entity({ name: 'appointment_reminders' })
@Index('UQ_appointment_reminders_appointment_offset', ['appointmentId', 'offsetMinutes'], {
  unique: true,
})
export class AppointmentReminder {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'appointment_id', type: 'uuid' })
  appointmentId!: string;

  @Column({ name: 'offset_minutes', type: 'int' })
  offsetMinutes!: number;

  /** Instante UTC en que debe entregarse el recordatorio. */
  @Column({ name: 'remind_at', type: 'timestamptz' })
  remindAt!: Date;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt!: Date | null;

  @ManyToOne(() => Appointment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'appointment_id' })
  appointment!: Appointment;
}
